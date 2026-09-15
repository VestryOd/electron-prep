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

export type ApiResponse<T> = {
  success: boolean
  body: T
  error?: string
}

export interface NotesApi {
  getNotes: () => Promise<ApiResponse<Note[]>>
  createNote: (dto: CreateNoteDto) => Promise<ApiResponse<Note>>
  updateNote: (dto: UpdateNoteDto) => Promise<ApiResponse<Note>>
  deleteNote: (dto: DeleteNoteDto) => Promise<ApiResponse<{ id: string }>>
}
