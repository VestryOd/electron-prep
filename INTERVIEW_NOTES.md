# Electron interview notes

Personal cheat sheet from a one-evening hands-on Electron crash course (Local Notes app).
Not a polished doc — a reference to re-read before an interview.

## One-page cheat sheet

**Main vs renderer vs preload — who can do what**

| | Runs where | Node access | DOM access | Role here |
|---|---|---|---|---|
| **main** | one Node.js OS process | full | none | owns the filesystem, `BrowserWindow` lifecycle, `ipcMain.handle` |
| **renderer** | one Chromium OS process per window | none (`nodeIntegration: false`) | full | React UI, only talks to `window.api` |
| **preload** | same OS process as renderer, separate JS *world* | full (own script) | via `window` before page JS runs | the only bridge; exposes a fixed API via `contextBridge` |

**contextIsolation** — separates the JS *context* (globals, prototype chains) of preload
from the page's own JS, even though both run in the same renderer OS process. Without it,
page JS and preload JS share one scope, so a compromised page could reach into whatever
preload has in scope. It does **not** replace `sandbox` (a Chromium OS-process-level jail,
independent of JS entirely) — the two are different layers, both usually wanted.

**invoke/handle vs send/on**
- `ipcRenderer.invoke` / `ipcMain.handle` — Promise-based request/response, one call → one
  reply. Right fit for CRUD (`getNotes`, `createNote`, ...): you always want a result or an
  error.
- `ipcRenderer.send` / `ipcMain.on` (or the reverse, `webContents.send` / `ipcRenderer.on`)
  — fire-and-forget events, no reply expected. Right fit for main pushing unprompted
  updates to renderer (progress, notifications) that don't originate from a renderer
  request.
- `ipcRenderer.sendSync` exists but blocks the renderer's JS thread until main replies —
  legacy/antipattern, avoid.

**Packaging pipeline**: `electron-vite build` compiles main/preload/renderer to
production bundles in `out/` (no dev server, no HMR) → `electron-builder` downloads a
matching Electron runtime binary, bundles it with `out/` + minimal `node_modules` into a
native format (`.app`/`.dmg` on macOS, NSIS installer on Windows, AppImage/deb on Linux).
The result is a fully standalone app — it does not depend on anything installed on the
target machine, because it carries its own copy of the Electron/Chromium/Node runtime.

## Full Q&A bank

**Process model & security boundary**
- *Why can't `BrowserWindow` be created before `app.whenReady()`?* — it wraps a native
  Chromium window (GPU process, compositor), whose native bootstrap finishes
  asynchronously; `whenReady()` resolves once that's done.
- *`typeof require` in renderer devtools console* — `undefined` with `nodeIntegration:
  false` (the default here). `require` is Node's CommonJS loader, injected into a JS
  context only when Electron explicitly allows it — nothing to do with any specific
  package like `path`.
- *Minimal RCE path if `nodeIntegration: true`* — a single XSS (e.g. via
  `dangerouslySetInnerHTML`) can call `require('child_process').exec(...)` directly,
  because `require` is already injected into the page's JS context. No extra steps needed.
- *`window-all-closed` vs `activate`, mac vs other OSes* — UX convention, not a technical
  limit: macOS apps conventionally stay alive (Dock, menu bar) with zero windows open;
  Windows/Linux don't have that convention, so last-window-closed = quit there.
- *`show: false` + `ready-to-show`* — not security, purely UX: avoids a blank/white flash
  before the renderer has finished its first paint.
- *`setWindowOpenHandler` returning `{ action: 'deny' }` + `shell.openExternal`* — without
  it, clicking an external link would spawn a **new Electron `BrowserWindow`**, which
  historically could get weaker `webPreferences` than the main window — denying it and
  handing the URL to the system browser removes an unnecessary attack surface.
- *`contextIsolation` vs `sandbox`* — `contextIsolation` splits the JS *world* (globals/
  prototypes) between preload and page, inside one OS process. `sandbox` is a Chromium
  OS-process-level jail (same mechanism as a regular Chrome tab) — restricts what the
  renderer process can do at the syscall level, and additionally restricts preload to a
  small whitelist of Node built-ins (no arbitrary `require`). `@electron-toolkit`'s
  template disables `sandbox` by default for preload flexibility but keeps
  `contextIsolation` on — a deliberate, documented trade-off, not a mistake.

**IPC contract & serialization**
- *Class instance with prototype methods through IPC* — arrives as a **plain object**
  silently, no error: structured clone only copies **own enumerable properties**, and
  class methods usually live on the prototype, which clone never even looks at.
  A function assigned as an **own** property (not via a class) *does* throw
  `DataCloneError`.
- *Custom `Error` subclass thrown in `ipcMain.handle`* — renderer receives a generic
  `Error` with the message preserved; `instanceof MyCustomError` is `false` — the
  prototype chain doesn't survive the boundary. This is exactly why we designed
  `ApiResponse<T>` as an explicit `{success, body}`/`{success, error}` envelope instead of
  relying on thrown custom errors.
- *invoke/handle vs send/on, revisited* — invoke/handle is the right fit for anything with
  a "did it work" answer; send/on fits background one-way notifications.
- *Why a shared `.ts` types file across `tsconfig.node.json`/`tsconfig.web.json`, not a
  compiled `.js` import* — the compiled main output has side effects that run on import
  (e.g. `app.whenReady().then(...)`, references to `electron`'s main-only APIs) —
  importing it into a browser bundle would try to execute Node/Electron bootstrap code in
  a context that has none of it. Only *type* declarations are safe to share, because they
  fully erase at compile time and carry zero runtime code.
- *Functions crossing `contextBridge.exposeInMainWorld` despite structured clone not
  carrying functions* — `contextBridge` has its own special-cased proxying for functions
  (and `Promise`s): it doesn't clone the function, it creates a proxy stub in the target
  world that forwards the call back across the boundary. This is a feature specific to
  `contextBridge`, not something raw `ipcRenderer.invoke` payloads get.
- *What `nodeIntegration: true` would additionally allow over our four `window.api`
  methods* — the renderer could call `ipcRenderer.invoke` with **any** channel string and
  arbitrary payloads directly, bypassing whatever narrow surface preload intended to
  expose — the "closed menu" model breaks entirely.
- *A discriminated union (`{success:true; body:T} | {success:false; error:string}`) vs
  `{success:boolean; body:T; error?:string}`* — the union lets TypeScript narrow
  `response.body` as guaranteed-present in the `success:true` branch and `response.error`
  as guaranteed-present in the `success:false` branch, with zero extra null-checks or
  placeholder values. The non-union version forces fake "empty" values for `body` on
  failure (there's no natural empty `Note`), which is exactly the bug this project hit and
  fixed.

**Filesystem & main process**
- *Why `fs` calls in main must be async* — main runs a single Node.js event loop shared by
  **all** windows and all IPC handling; a blocking sync call freezes the whole app, not
  just one renderer tab (unlike, say, one tab hanging in a multi-process browser UI).
  Concretely, `fs/promises` operations are offloaded to libuv's thread pool, not the main
  JS thread — so even a slow disk read doesn't block IPC handling for unrelated windows.
- *`app.getPath('userData')` vs `__dirname`/`process.cwd()`* — a packaged app's install
  location is often read-only (signed `.app` bundles, `Program Files` needing admin
  rights); `userData` is Electron's guaranteed-writable, OS-correct, per-user data
  directory, resolved consistently in both dev and packaged builds (verified: our dev and
  packaged build shared the exact same `userData` path and saw the same notes file).
- *`IpcMainInvokeEvent`* — mainly useful for sender/origin validation (`event.senderFrame`)
  in multi-window or multi-trust-level apps — rejecting calls that didn't come from your
  own expected renderer. Not needed for routing (one channel = one handler regardless).

**React/renderer specifics**
- *How `window.api` gets typed in `App.tsx` with zero imports* — `declare global {
  interface Window { api: NotesApi } }` in `preload/index.d.ts`, included in
  `tsconfig.web.json`'s `include` — TypeScript applies global ambient declarations
  automatically to every file in the project, no import needed.
- *Does a slow `window.api.getNotes()` freeze the renderer UI* — no: it's a `Promise`-based
  async call end to end (contextBridge proxy → real IPC → async main handler); the
  renderer's JS thread is free to keep handling clicks/scrolling while waiting. Contrast
  with a hypothetical `ipcRenderer.sendSync`, which would block the renderer's JS thread
  until main replies, freezing all UI interaction for the duration.

**Packaging**
- *Why `electron-builder` downloads its own Electron runtime copy instead of using
  `node_modules/electron`* — the dev copy is just a launcher wrapping a prebuilt binary,
  meant for local development; a shipped app must be fully standalone (Chromium + Node +
  V8 all bundled), since the end user's machine has none of this installed.
- *Separating dev vs prod `userData` to avoid dev notes leaking into a "prod" install* —
  `app.isPackaged` (or `is.dev` from `@electron-toolkit/utils`, already used in this repo)
  to branch, then `app.setPath('userData', devPath)` before `app.whenReady()`.
- *Gatekeeper: locally-built app opens with no warning, but a colleague's copy downloaded
  via Google Drive gets blocked* — Gatekeeper's check is gated on the
  `com.apple.quarantine` xattr, which browsers/Mail/AirDrop set on downloaded files but a
  local `open` from Terminal never does. Our build has no real Developer ID (only a
  mandatory ad-hoc signature Apple's linker applies to all arm64 binaries —
  `TeamIdentifier=not set`), so a quarantined copy triggers the "cannot be opened, unknown
  developer" dialog (bypassable via right-click → Open, but blocked on a plain double-click).

**Release readiness (discussed, not implemented)**
- *Code signing* — a paid Apple Developer ID certificate (or CA cert on Windows); purely a
  build-config/credentials concern, `electron-builder` picks it up automatically, no app
  code changes.
- *Notarization* — a separate post-signing step: Apple scans the signed binary for malware
  and staples an approval ticket; without it, even a signed-but-not-notarized app can still
  get a lighter Gatekeeper warning on first download.
- *Auto-updater (`electron-updater`)* — checks a hosted manifest (`latest-mac.yml`, which
  `electron-builder` generates on every build regardless of whether it's used), downloads
  and verifies the new version, swaps it on relaunch. In most configurations it refuses to
  apply an update whose signature it can't verify — so it's hard-dependent on code signing
  being set up first.

## Honest boundary — do not overclaim in an interview

Not implemented, not tested, don't claim hands-on depth here:
- Auto-updater (`electron-updater`) — discussed conceptually only, never wired up.
- Code signing / notarization — no Apple Developer ID available; understand the mechanism,
  never executed it.
- Native modules / native addons.
- Multi-window scenarios beyond the default single window.
- `sandbox: true` hardening (preload currently runs with `sandbox: false`, the
  `@electron-toolkit` template default) — understand the trade-off, didn't flip it.
- Native application menu (step 7 of the original plan) — skipped for time; the concept
  (one `ipcMain` handler triggered from two entry points, a menu item and a UI button) was
  discussed but never wired up.
- Production security hardening beyond what's here (CSP headers, permission request
  handlers, etc.) — out of scope for a one-evening project.

## Real-world parallels worth mentioning in an interview

- `contextIsolation` + `contextBridge`'s narrow `window.api` surface ≈ moving an API key or
  privileged operation behind a server-side proxy in a normal web app: the untrusted
  context (browser page / Electron renderer) never gets the credential or the raw
  capability, only a fixed, narrow set of operations exposed by the trusted side (Express
  proxy / preload script).
- The `ApiResponse<T>` discriminated union and the whole "shared types file across three
  build targets" problem is the same shape as keeping a REST API's request/response types
  in sync between a Next.js API route and its frontend caller — except here the "network
  boundary" is IPC between OS processes instead of HTTP, and the failure mode (prototype
  loss on thrown errors, structured-clone limits) is Electron-specific.
