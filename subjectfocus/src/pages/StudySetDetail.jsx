import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'

export default function StudySetDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [setData, setSetData] = useState(null)
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editOpen, setEditOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [subject, setSubject] = useState('')
  const [color, setColor] = useState('')

  // New card fields
  const [term, setTerm] = useState('')
  const [definition, setDefinition] = useState('')
  const [creatingCard, setCreatingCard] = useState(false)

  // Edit existing card state
  const [editingId, setEditingId] = useState(null)
  const [editTerm, setEditTerm] = useState('')
  const [editDefinition, setEditDefinition] = useState('')

  const canRender = useMemo(() => !!id, [id])

  useEffect(() => {
    if (!canRender) return
    let mounted = true
    ;(async () => {
      const { data: setRow, error: setErr } = await supabase
        .from('study_sets')
        .select('id, title, description, subject_area, total_cards, color_theme')
        .eq('id', id)
        .single()
      if (!mounted) return
      if (setErr) { setError(setErr.message); setLoading(false); return }
      setSetData(setRow)
      setTitle(setRow.title || '')
      setDescription(setRow.description || '')
      setSubject(setRow.subject_area || '')
      setColor(setRow.color_theme || '')

      const { data: cardsData } = await supabase
        .from('flashcards')
        .select('id, question, answer')
        .eq('study_set_id', id)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
      setCards(cardsData || [])
      setLoading(false)
    })()
    return () => { mounted = false }
  }, [id, canRender])

  async function updateSet(e) {
    e.preventDefault()
    const { error } = await supabase
      .from('study_sets')
      .update({ title, description: description || null, subject_area: subject || null, color_theme: color || null })
      .eq('id', id)
    if (error) setError(error.message)
    else {
      setEditOpen(false)
      setSetData({ ...setData, title, description, subject_area: subject, color_theme: color })
    }
  }

  async function deleteSet() {
    if (!confirm('Delete this study set?')) return
    const { error } = await supabase.from('study_sets').delete().eq('id', id)
    if (error) setError(error.message)
    else navigate('/')
  }

  async function addCard(e) {
    e.preventDefault()
    if (!term.trim() || !definition.trim()) return
    setCreatingCard(true)
    const { data, error } = await supabase
      .from('flashcards')
      .insert({ study_set_id: id, question: term.trim(), answer: definition.trim() })
      .select('id, question, answer')
      .single()
    setCreatingCard(false)
    if (error) setError(error.message)
    else {
      setCards(c => [...c, data])
      setTerm(''); setDefinition('')
    }
  }

  function startEdit(card) {
    setEditingId(card.id)
    setEditTerm(card.question || '')
    setEditDefinition(card.answer || '')
  }

  function cancelEdit() {
    setEditingId(null)
    setEditTerm('')
    setEditDefinition('')
  }

  async function saveEdit() {
    if (!editingId) return
    if (!editTerm.trim() || !editDefinition.trim()) return
    const { data, error } = await supabase
      .from('flashcards')
      .update({ question: editTerm.trim(), answer: editDefinition.trim() })
      .eq('id', editingId)
      .select('id, question, answer')
      .single()
    if (!error && data) {
      setCards(cs => cs.map(c => (c.id === editingId ? data : c)))
      cancelEdit()
    } else if (error) {
      setError(error.message)
    }
  }

  async function deleteCard(card) {
    const { error } = await supabase
      .from('flashcards')
      .delete()
      .eq('id', card.id)
    if (!error) setCards(cs => cs.filter(c => c.id !== card.id))
  }

  if (loading) return <div className="p-6">Loading...</div>
  if (error) return <div className="p-6 text-red-600">{error}</div>
  if (!setData) return <div className="p-6">Not found</div>

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{setData.title}</h1>
          <div className="text-sm text-gray-600">{setData.subject_area || '—'} · {setData.total_cards} cards</div>
          {setData.description && <p className="mt-2 text-gray-800 whitespace-pre-wrap">{setData.description}</p>}
        </div>
        <div className="space-x-2">
          <button onClick={() => setEditOpen(v=>!v)} className="px-3 py-1.5 border rounded">Edit</button>
          <button onClick={deleteSet} className="px-3 py-1.5 border rounded text-red-600">Delete</button>
        </div>
      </div>

      {editOpen && (
        <form onSubmit={updateSet} className="border rounded p-4 space-y-3">
          <div>
            <label className="block text-sm mb-1">Title</label>
            <input className="w-full border rounded px-3 py-2" value={title} onChange={e=>setTitle(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm mb-1">Description</label>
            <textarea className="w-full border rounded px-3 py-2" rows="4" value={description} onChange={e=>setDescription(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm mb-1">Subject</label>
            <input className="w-full border rounded px-3 py-2" value={subject} onChange={e=>setSubject(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm mb-1">Color</label>
            <input className="w-full border rounded px-3 py-2" value={color} onChange={e=>setColor(e.target.value)} />
          </div>
          <button className="bg-indigo-600 text-white px-4 py-2 rounded">Save</button>
        </form>
      )}

      <div className="border rounded p-4">
        <div className="mb-3 font-medium">Flashcards</div>
        {cards.length === 0 ? (
          <div className="text-sm text-gray-700">No flashcards yet. Add your first card!</div>
        ) : (
          <ul className="space-y-2">
            {cards.map(card => (
              <li key={card.id} className="border rounded p-3 flex items-start justify-between">
                {editingId === card.id ? (
                  <div className="w-full">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <input className="border rounded px-3 py-2" placeholder="Term" value={editTerm} onChange={e=>setEditTerm(e.target.value)} />
                      <input className="border rounded px-3 py-2" placeholder="Definition" value={editDefinition} onChange={e=>setEditDefinition(e.target.value)} />
                    </div>
                    <div className="mt-2 flex gap-2">
                      <button onClick={saveEdit} className="px-3 py-1.5 bg-indigo-600 text-white rounded text-sm">Save</button>
                      <button onClick={cancelEdit} className="px-3 py-1.5 border rounded text-sm">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div>
                      <div className="font-medium">Term: {card.question}</div>
                      <div className="text-gray-700">Definition: {card.answer}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => startEdit(card)} className="text-sm underline">Edit</button>
                      <button onClick={() => deleteCard(card)} className="text-sm text-red-600 underline">Delete</button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={addCard} className="mt-4 grid gap-2 sm:grid-cols-2">
          <input className="border rounded px-3 py-2" placeholder="Term" value={term} onChange={e=>setTerm(e.target.value)} />
          <input className="border rounded px-3 py-2" placeholder="Definition" value={definition} onChange={e=>setDefinition(e.target.value)} />
          <div className="sm:col-span-2">
            <button disabled={creatingCard} className="bg-indigo-600 text-white px-4 py-2 rounded">Add Flashcard</button>
          </div>
        </form>
      </div>
    </div>
  )
}
