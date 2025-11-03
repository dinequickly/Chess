import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'

export default function PracticeMode() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [setData, setSetData] = useState(null)
  const [allCards, setAllCards] = useState([])
  const [displayCards, setDisplayCards] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filterStarred, setFilterStarred] = useState(false)
  const [shuffled, setShuffled] = useState(false)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data: setRow, error: setErr } = await supabase
        .from('study_sets')
        .select('id, title, subject_area')
        .eq('id', id)
        .single()
      if (!mounted) return
      if (setErr) { setError(setErr.message); setLoading(false); return }
      setSetData(setRow)

      const { data: cardsData, error: cardsErr } = await supabase
        .from('flashcards')
        .select('id, question, answer, starred')
        .eq('study_set_id', id)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
      if (cardsErr) { setError(cardsErr.message); setLoading(false); return }
      setAllCards(cardsData || [])
      setDisplayCards(cardsData || [])
      setLoading(false)

      // Check if we should scroll to a specific card
      const cardId = searchParams.get('cardId')
      if (cardId && cardsData) {
        const index = cardsData.findIndex(c => c.id === cardId)
        if (index !== -1) setCurrentIndex(index)
      }
    })()
    return () => { mounted = false }
  }, [id, searchParams])

  // Fisher-Yates shuffle algorithm
  function shuffleArray(array) {
    const shuffled = [...array]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    return shuffled
  }

  useEffect(() => {
    let filtered = filterStarred ? allCards.filter(c => c.starred) : allCards
    let result = shuffled ? shuffleArray(filtered) : filtered
    setDisplayCards(result)
    setCurrentIndex(0)
    setFlipped(false)
  }, [filterStarred, shuffled, allCards])

  function handlePrevious() {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1)
      setFlipped(false)
    }
  }

  function handleNext() {
    if (currentIndex < displayCards.length - 1) {
      setCurrentIndex(currentIndex + 1)
      setFlipped(false)
    }
  }

  function handleCardClick() {
    setFlipped(!flipped)
  }

  function handleEdit() {
    const currentCard = displayCards[currentIndex]
    if (currentCard) {
      navigate(`/study-set/${id}?editCard=${currentCard.id}`)
    }
  }

  function handleExit() {
    navigate(`/study-set/${id}`)
  }

  if (loading) return <div className="p-6">Loading...</div>
  if (error) return <div className="p-6 text-red-600">{error}</div>
  if (!setData) return <div className="p-6">Not found</div>
  if (displayCards.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-gray-600">No cards to practice{filterStarred ? ' (no starred cards)' : ''}.</p>
          <button onClick={handleExit} className="px-4 py-2 border rounded">Back to Study Set</button>
        </div>
      </div>
    )
  }

  const currentCard = displayCards[currentIndex]

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="font-semibold text-lg">{setData.title}</h1>
            <p className="text-sm text-gray-600">
              Card {currentIndex + 1} of {displayCards.length}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Filter Dropdown */}
            <select
              value={filterStarred ? 'starred' : 'all'}
              onChange={(e) => setFilterStarred(e.target.value === 'starred')}
              className="px-3 py-1.5 border rounded text-sm"
            >
              <option value="all">All Cards</option>
              <option value="starred">⭐ Starred Only</option>
            </select>

            {/* Shuffle Toggle */}
            <button
              onClick={() => setShuffled(!shuffled)}
              className={`px-3 py-1.5 border rounded text-sm ${shuffled ? 'bg-indigo-100 border-indigo-300' : ''}`}
            >
              {shuffled ? '🔀 Shuffled' : '🔀 Shuffle'}
            </button>

            {/* Edit Button */}
            <button
              onClick={handleEdit}
              className="px-3 py-1.5 border rounded text-sm"
            >
              ✏️ Edit
            </button>

            {/* Exit Button */}
            <button
              onClick={handleExit}
              className="px-3 py-1.5 border rounded text-sm"
            >
              ✕ Exit
            </button>
          </div>
        </div>
      </div>

      {/* Main Card Area */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-2xl">
          {/* Flip Card */}
          <div
            onClick={handleCardClick}
            className="relative cursor-pointer"
            style={{ perspective: '1000px' }}
          >
            <div
              className={`relative w-full transition-transform duration-500 transform-gpu`}
              style={{
                transformStyle: 'preserve-3d',
                transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
                minHeight: '300px'
              }}
            >
              {/* Front of card (Question) */}
              <div
                className="absolute inset-0 bg-white border-2 border-gray-300 rounded-lg shadow-lg p-8 flex flex-col items-center justify-center"
                style={{
                  backfaceVisibility: 'hidden',
                  minHeight: '300px'
                }}
              >
                <div className="text-sm text-gray-500 mb-4">Question</div>
                <div className="text-2xl font-medium text-center">{currentCard.question}</div>
                <div className="text-sm text-gray-400 mt-8">Click to flip</div>
              </div>

              {/* Back of card (Answer) */}
              <div
                className="absolute inset-0 bg-indigo-50 border-2 border-indigo-300 rounded-lg shadow-lg p-8 flex flex-col items-center justify-center"
                style={{
                  backfaceVisibility: 'hidden',
                  transform: 'rotateY(180deg)',
                  minHeight: '300px'
                }}
              >
                <div className="text-sm text-indigo-600 mb-4">Answer</div>
                <div className="text-2xl font-medium text-center">{currentCard.answer}</div>
                <div className="text-sm text-gray-400 mt-8">Click to flip back</div>
              </div>
            </div>
          </div>

          {/* Navigation Controls */}
          <div className="mt-6 flex items-center justify-between">
            <button
              onClick={handlePrevious}
              disabled={currentIndex === 0}
              className="px-6 py-2 border rounded disabled:opacity-30 disabled:cursor-not-allowed"
            >
              ← Previous
            </button>
            <div className="text-sm text-gray-600">
              {flipped ? 'Showing answer' : 'Showing question'}
            </div>
            <button
              onClick={handleNext}
              disabled={currentIndex === displayCards.length - 1}
              className="px-6 py-2 border rounded disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Next →
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
