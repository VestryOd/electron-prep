import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { CreateNoteDto, DeleteNoteDto, IpcChannel, NotesApi, UpdateNoteDto } from '../shared/ipc'

// Custom APIs for renderer
const api: NotesApi = {
  getNotes: async () => {
    return ipcRenderer.invoke(IpcChannel.GetNotes)
  },
  createNote: async (dto: CreateNoteDto) => {
    return ipcRenderer.invoke(IpcChannel.CreateNote, dto)
  },
  updateNote: async (dto: UpdateNoteDto) => {
    return ipcRenderer.invoke(IpcChannel.UpdateNote, dto)
  },
  deleteNote: async (dto: DeleteNoteDto) => {
    return ipcRenderer.invoke(IpcChannel.DeleteNote, dto)
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
