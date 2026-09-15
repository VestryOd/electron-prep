// Included in both tsconfig.node.json (main/preload) and tsconfig.web.json (renderer)
// so main, preload and renderer all type-check against the same IPC contract.

// Dates as ISO strings, not Date: JSON.stringify/parse (disk persistence in step 5)
// turns Date into a string anyway without a custom reviver, so we keep one format
// across disk, IPC and React state instead of converting at each boundary.
export interface Note {
  id: string
  title: string
  content?: string
  done: boolean
  createdAt: string
  updatedAt?: string
}

export type CreateNoteDto = {
  title: string
  content?: string
  done: boolean
}

export type UpdateNoteDto = {
  id: string
  title?: string
  content?: string
  done?: boolean
}

export type DeleteNoteDto = {
  id: string
}

// Discriminated union rather than `{ success: boolean; body: T; error?: string }`:
// a failure has no meaningful T to put in `body` (e.g. T = Note has no "empty" value),
// and this shape lets callers narrow with `if (response.success)` instead of guessing.
export type ApiResponse<T> = { success: true; body: T } | { success: false; error: string }

// Single source of truth for channel names: ipcRenderer.invoke(channel) in preload
// and ipcMain.handle(channel) in main must reference the same string, and nothing
// in TypeScript checks that on its own — this object is what makes a typo a
// compile error instead of a silent runtime mismatch.
export const IpcChannel = {
  GetNotes: 'notes:get',
  CreateNote: 'notes:create',
  UpdateNote: 'notes:update',
  DeleteNote: 'notes:delete'
} as const

export interface NotesApi {
  getNotes: () => Promise<ApiResponse<Note[]>>
  createNote: (dto: CreateNoteDto) => Promise<ApiResponse<Note>>
  updateNote: (dto: UpdateNoteDto) => Promise<ApiResponse<Note>>
  deleteNote: (dto: DeleteNoteDto) => Promise<ApiResponse<{ id: string }>>
}
