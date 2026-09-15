import { ElectronAPI } from '@electron-toolkit/preload'
import { NotesApi } from '../shared/ipc'

declare global {
  interface Window {
    electron: ElectronAPI
    api: NotesApi
  }
}
