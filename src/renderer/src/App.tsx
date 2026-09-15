import { FormEvent, useEffect, useState } from 'react'
import { Note } from '@shared/ipc'

function App(): React.JSX.Element {
  const [notes, setNotes] = useState<Note[]>([])
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')

  useEffect(() => {
    window.api.getNotes().then((response) => {
      if (response.success) {
        setNotes(response.body)
      } else {
        alert(response.error)
      }
    })
  }, [])

  const handleCreate = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (!title.trim()) return

    const response = await window.api.createNote({ title, content, done: false })
    if (response.success) {
      setNotes((prev) => [...prev, response.body])
      setTitle('')
      setContent('')
    } else {
      alert(response.error)
    }
  }

  const startEditing = (note: Note): void => {
    setEditingId(note.id)
    setEditTitle(note.title)
    setEditContent(note.content ?? '')
  }

  const handleUpdate = async (id: string): Promise<void> => {
    const response = await window.api.updateNote({ id, title: editTitle, content: editContent })
    if (response.success) {
      setNotes((prev) => prev.map((note) => (note.id === id ? response.body : note)))
      setEditingId(null)
    } else {
      alert(response.error)
    }
  }

  const handleToggleDone = async (note: Note): Promise<void> => {
    const response = await window.api.updateNote({ id: note.id, done: !note.done })
    if (response.success) {
      setNotes((prev) => prev.map((n) => (n.id === note.id ? response.body : n)))
    } else {
      alert(response.error)
    }
  }

  const handleDelete = async (id: string): Promise<void> => {
    const response = await window.api.deleteNote({ id })
    if (response.success) {
      setNotes((prev) => prev.filter((note) => note.id !== id))
    } else {
      alert(response.error)
    }
  }

  return (
    <div>
      <h1>Local Notes</h1>

      <form className="note-form" onSubmit={handleCreate}>
        <input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea
          placeholder="Content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <button type="submit">Add note</button>
      </form>

      <ul className="note-list">
        {notes.map((note) => (
          <li className="note-item" key={note.id}>
            {editingId === note.id ? (
              <>
                <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} />
                <div className="note-item-actions">
                  <button onClick={() => handleUpdate(note.id)}>Save</button>
                  <button onClick={() => setEditingId(null)}>Cancel</button>
                </div>
              </>
            ) : (
              <>
                <div className="note-item-header">
                  <input
                    type="checkbox"
                    checked={note.done}
                    onChange={() => handleToggleDone(note)}
                  />
                  <strong className={note.done ? 'done' : undefined}>{note.title}</strong>
                </div>
                {note.content && <p>{note.content}</p>}
                <div className="note-item-actions">
                  <button onClick={() => startEditing(note)}>Edit</button>
                  <button onClick={() => handleDelete(note.id)}>Delete</button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

export default App
