import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../hooks/useAuth'

export default function StudySetOverview() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [studySet, setStudySet] = useState(null)
  const [counts, setCounts] = useState({
    flashcard_sets: 0,
    study_guides: 0,
    podcasts: 0,
    practice_tests: 0,
    mind_maps: 0,
    briefs: 0,
    total_flashcards: 0
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchOverview()
  }, [id])

  async function fetchOverview() {
    setLoading(true)

    // Fetch study set
    const { data: setData, error: setError } = await supabase
      .from('study_sets')
      .select('*')
      .eq('id', id)
      .single()

    if (setError) {
      console.error('Error fetching study set:', setError)
      setLoading(false)
      return
    }

    setStudySet(setData)

    // Fetch counts for all content types
    const [flashcardSets, studyGuides, podcasts, practiceTests, mindMaps, briefs] = await Promise.all([
      supabase
        .from('flashcard_sets')
        .select('id', { count: 'exact', head: true })
        .eq('study_set_id', id),
      supabase
        .from('generated_content')
        .select('id', { count: 'exact', head: true })
        .eq('study_set_id', id)
        .eq('content_type', 'study_guide'),
      supabase
        .from('podcasts')
        .select('id', { count: 'exact', head: true })
        .eq('study_set_id', id),
      supabase
        .from('generated_content')
        .select('id', { count: 'exact', head: true })
        .eq('study_set_id', id)
        .eq('content_type', 'practice_test'),
      supabase
        .from('generated_content')
        .select('id', { count: 'exact', head: true })
        .eq('study_set_id', id)
        .eq('content_type', 'mindmap'),
      supabase
        .from('generated_content')
        .select('id', { count: 'exact', head: true })
        .eq('study_set_id', id)
        .eq('content_type', 'brief')
    ])

    setCounts({
      flashcard_sets: flashcardSets.count || 0,
      study_guides: studyGuides.count || 0,
      podcasts: podcasts.count || 0,
      practice_tests: practiceTests.count || 0,
      mind_maps: mindMaps.count || 0,
      briefs: briefs.count || 0,
      total_flashcards: setData.total_cards || 0
    })

    setLoading(false)
  }

  if (loading) {
    return <div className="p-6">Loading...</div>
  }

  if (!studySet) {
    return <div className="p-6 text-red-600">Study set not found</div>
  }

  const contentTypes = [
    {
      title: 'Flashcard Sets',
      icon: '📚',
      count: counts.flashcard_sets,
      subtext: `${counts.total_flashcards} total cards`,
      route: `/study-set/${id}/flashcard-sets`,
      color: 'indigo'
    },
    {
      title: 'Study Guides',
      icon: '📖',
      count: counts.study_guides,
      route: `/study-set/${id}/guides`,
      color: 'blue'
    },
    {
      title: 'Podcasts',
      icon: '🎙️',
      count: counts.podcasts,
      route: `/study-set/${id}/podcasts`,
      color: 'purple'
    },
    {
      title: 'Practice Tests',
      icon: '📝',
      count: counts.practice_tests,
      route: `/study-set/${id}/practice-tests`,
      color: 'green'
    },
    {
      title: 'Mind Maps',
      icon: '🧠',
      count: counts.mind_maps,
      route: `/study-set/${id}/mindmaps`,
      color: 'pink'
    },
    {
      title: 'Briefs',
      icon: '📄',
      count: counts.briefs,
      route: `/study-set/${id}/briefs`,
      color: 'yellow'
    }
  ]

  const colorClasses = {
    indigo: 'bg-indigo-50 border-indigo-200 hover:bg-indigo-100',
    blue: 'bg-blue-50 border-blue-200 hover:bg-blue-100',
    purple: 'bg-purple-50 border-purple-200 hover:bg-purple-100',
    green: 'bg-green-50 border-green-200 hover:bg-green-100',
    pink: 'bg-pink-50 border-pink-200 hover:bg-pink-100',
    yellow: 'bg-yellow-50 border-yellow-200 hover:bg-yellow-100'
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto p-6">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => navigate('/')}
            className="text-gray-600 hover:text-gray-900 mb-4"
          >
            ← Back to Dashboard
          </button>
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h1 className="text-3xl font-bold mb-2">{studySet.title}</h1>
            {studySet.subject_area && (
              <div className="text-sm text-gray-600 mb-4">
                📚 {studySet.subject_area}
              </div>
            )}
            {studySet.description && (
              <p className="text-gray-700">{studySet.description}</p>
            )}
          </div>
        </div>

        {/* Practice All Button */}
        <div className="mb-6">
          <button
            onClick={() => navigate(`/study-set/${id}/practice`)}
            className="w-full px-6 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg font-semibold text-lg hover:from-indigo-700 hover:to-purple-700 shadow-lg transition-all"
          >
            🎯 Practice All Flashcards ({counts.total_flashcards} cards)
          </button>
        </div>

        {/* Content Type Grid */}
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-4">Study Materials</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {contentTypes.map((type) => (
              <button
                key={type.title}
                onClick={() => navigate(type.route)}
                className={`${colorClasses[type.color]} border rounded-lg p-6 text-left transition-all hover:shadow-md`}
              >
                <div className="flex items-start justify-between mb-3">
                  <span className="text-4xl">{type.icon}</span>
                  <span className="px-3 py-1 bg-white rounded-full text-sm font-semibold">
                    {type.count}
                  </span>
                </div>
                <h3 className="font-semibold text-lg mb-1">{type.title}</h3>
                {type.subtext && (
                  <p className="text-sm text-gray-600">{type.subtext}</p>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Quick Stats */}
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h2 className="text-xl font-semibold mb-4">Study Set Info</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-gray-50 rounded">
              <div className="text-2xl font-bold text-indigo-600">{counts.total_flashcards}</div>
              <div className="text-sm text-gray-600">Total Cards</div>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded">
              <div className="text-2xl font-bold text-blue-600">{counts.flashcard_sets}</div>
              <div className="text-sm text-gray-600">Flashcard Sets</div>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded">
              <div className="text-2xl font-bold text-green-600">{counts.study_guides}</div>
              <div className="text-sm text-gray-600">Study Guides</div>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded">
              <div className="text-2xl font-bold text-purple-600">{counts.practice_tests}</div>
              <div className="text-sm text-gray-600">Practice Tests</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
