# Local Notes

A minimal Electron desktop app — a one-evening hands-on project to get real contact with
the Electron process model, not just theory. Notes are stored as files on disk, owned
exclusively by the main process; the renderer never touches the filesystem directly.

## What this demonstrates

- **Three-process architecture**: main (Node.js, owns the filesystem), preload (bridge,
  runs with Node access but exposes only a narrow API), renderer (React UI, sandboxed
  Chromium, no direct Node access).
- **contextIsolation + contextBridge**: renderer only ever sees `window.api`, a fixed set
  of four methods (`getNotes`/`createNote`/`updateNote`/`deleteNote`) — no `nodeIntegration`,
  no raw `ipcRenderer` exposed to page JS.
- **Typed IPC contract**: a single shared source of truth (`src/shared/ipc.ts`) for the
  `Note` shape, DTOs, channel names and the `NotesApi` interface, referenced from main,
  preload and renderer builds so a channel/payload mismatch is a compile error, not a
  runtime surprise.
- **Packaging**: a real `electron-builder` distributable (`.app`/`.dmg`), not just
  `electron-vite dev`.

## Stack

Electron + [electron-vite](https://electron-vite.org/) + React + TypeScript (strict),
[electron-builder](https://www.electron.build/) for packaging.

## Running

```bash
npm install
npm run dev            # dev mode, HMR
npm run typecheck      # main + renderer, both tsconfig projects
npm run lint
npm run build:mac      # packaged .app/.dmg in dist/ (use build:win / build:linux elsewhere)
```

Notes are persisted as one JSON file per note under Electron's `userData` directory
(`~/Library/Application Support/local-notes/notes` on macOS), not next to the app bundle —
see `src/main/notesStore.ts`.

## Architecture

```
src/
├── shared/ipc.ts     # Note, DTOs, ApiResponse<T>, IpcChannel, NotesApi — the IPC contract
├── main/
│   ├── index.ts       # BrowserWindow, app lifecycle, ipcMain.handle wiring
│   └── notesStore.ts  # filesystem CRUD, the only code that touches disk
├── preload/
│   └── index.ts        # contextBridge.exposeInMainWorld('api', ...) — the only bridge
└── renderer/src/
    └── App.tsx          # React UI, calls window.api.* exclusively
```

## Not covered (by design, out of scope for a one-evening project)

Auto-updater, code signing / notarization, native modules, multi-window scenarios,
`sandbox: true` hardening. See commit history for the incremental, tutorial-style build-up.
