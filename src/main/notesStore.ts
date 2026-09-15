import { app } from 'electron'
import { readdir, readFile, mkdir, writeFile, unlink } from 'fs/promises'
import * as path from 'path'
import * as crypto from 'crypto'
import type { CreateNoteDto, Note, UpdateNoteDto } from '../shared/ipc'

// One JSON file per note in <userData>/notes — not app.getAppPath()/cwd,
// see step 5 theory for why packaged apps can't assume those are writable.

const folderName = 'notes'

const getFolderPath = (): string => {
  const userFolderPath = app.getPath('userData')
  return path.resolve(userFolderPath, folderName)
}

const deserializeNote = (noteString: string): Note | null => {
  try {
    return JSON.parse(noteString)
  } catch {
    return null
  }
}

const getJsonFiles = async (folderPath: string): Promise<string[]> => {
  try {
    const files = await readdir(folderPath)
    return files.filter((file) => file.endsWith('.json'))
  } catch {
    return []
  }
}

// mkdir with recursive:true is idempotent — no need to check existence first.
const ensureFolder = async (): Promise<string> => {
  const folderPath = getFolderPath()
  await mkdir(folderPath, { recursive: true })
  return folderPath
}

export async function readAll(): Promise<Note[]> {
  const folderPath = getFolderPath()
  const noteNames = await getJsonFiles(folderPath)
  const files = await Promise.all(
    noteNames.map((note) => readFile(path.resolve(folderPath, note), 'utf8'))
  )
  return files.map(deserializeNote).filter((note): note is Note => note !== null)
}

export async function create(dto: CreateNoteDto): Promise<Note> {
  const folderPath = await ensureFolder()

  const id = crypto.randomUUID()
  const note: Note = {
    id,
    ...dto,
    createdAt: new Date().toISOString()
  }
  await writeFile(path.join(folderPath, `${id}.json`), JSON.stringify(note), 'utf8')
  return note
}

export async function update(dto: UpdateNoteDto): Promise<Note> {
  const folderPath = await ensureFolder()
  const filePath = path.join(folderPath, `${dto.id}.json`)

  let existing: Note | null
  try {
    existing = deserializeNote(await readFile(filePath, 'utf8'))
  } catch {
    existing = null
  }
  if (!existing) {
    throw new Error(`Note ${dto.id} not found`)
  }

  const updated: Note = {
    ...existing,
    ...dto,
    updatedAt: new Date().toISOString()
  }
  await writeFile(filePath, JSON.stringify(updated), 'utf8')
  return updated
}

export async function remove(id: string): Promise<{ id: string }> {
  const folderPath = await ensureFolder()
  try {
    await unlink(path.join(folderPath, `${id}.json`))
    return { id }
  } catch {
    throw new Error(`Note ${id} not found`)
  }
}
