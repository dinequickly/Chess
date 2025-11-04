import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../hooks/useAuth'

export default function PracticeTestsList() {
  const { id } = useParams() // study_set_id
  const navigate = useNavigate()
  const { user } = useAuth()
  const [practiceTests, setPracticeTests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchPracticeTests()
  }, [id])

  async function fetchPracticeTests() {
    setLoading(true)
    const { data, error: fetchErr } = await supabase
      .from('generated_content')
      .select('*')
      .eq('study_set_id', id)
      .eq('content_type', 'practice_test')
      .order('created_at', { ascending: false })

    if (fetchErr) {
      setError(fetchErr.message)
    } else {
      setPracticeTests(data || [])
    }
    setLoading(false)
  }

  async function deletePracticeTest(testId, testTitle) {
    if (!confirm(`Delete "${testTitle}"?\n\nThis will delete the test and all attempt history.`)) return

    const { error: deleteErr } = await supabase
      .from('generated_content')
      .delete()
      .eq('id', testId)

    if (deleteErr) {
      alert('Failed to delete: ' + deleteErr.message)
    } else {
      fetchPracticeTests()
    }
  }

  function getStatusBadge(status) {
    const styles = {
      generating: 'bg-yellow-100 text-yellow-800',
      completed: 'bg-green-100 text-green-800',
      ready: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800'
    }
    const label = status === 'ready' ? 'Ready' : status.charAt(0).toUpperCase() + status.slice(1)
    return (
      <span className={`px-2 py-1 rounded text-xs font-medium ${styles[status] || ''}`}>
        {label}
      </span>
    )
  }

  function isTestReady(test) {
    return test.status === 'completed' || test.status === 'ready'
  }

  function getSourceLabel(sourceType) {
    const labels = {
      flashcards: 'Flashcards',
      study_guide: 'Study Guide',
      custom_topic: 'Custom Topic'
    }
    return labels[sourceType] || sourceType
  }

  function getTotalQuestions(test) {
    return test.content_metadata?.questions?.length || test.content_metadata?.total_questions || 0
  }

  function getTotalPoints(test) {
    const questions = test.content_metadata?.questions || []
    return questions.reduce((sum, q) => sum + (q.points || 0), 0) || (getTotalQuestions(test) * 5)
  }

  if (loading) return <div className="p-6">Loading practice tests...</div>
  if (error) return <div className="p-6 text-red-600">{error}</div>

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate(`/study-set/${id}`)}
              className="text-gray-600 hover:text-gray-900"
            >
              ← Back
            </button>
            <h1 className="text-2xl font-bold">Practice Tests</h1>
          </div>
          <button
            onClick={() => navigate(`/study-set/${id}/practice-test/create`)}
            className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
          >
            Create Practice Test
          </button>
        </div>

        {/* Info Card */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-blue-900">
            <span className="font-medium">💡 Tip:</span> Practice tests help you assess your knowledge with AI-generated questions.
            Track your progress over time and identify areas that need more study.
          </p>
        </div>

        {/* Practice Tests List */}
        <div className="space-y-4">
          {practiceTests.length === 0 ? (
            <div className="bg-white rounded-lg shadow-sm border p-12 text-center">
              <p className="text-gray-500 mb-4">No practice tests yet</p>
              <button
                onClick={() => navigate(`/study-set/${id}/practice-test/create`)}
                className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
              >
                Create Your First Practice Test
              </button>
            </div>
          ) : (
            practiceTests.map(test => (
              <div key={test.id} className="bg-white rounded-lg shadow-sm border p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-medium text-lg">{test.title}</h3>
                      {getStatusBadge(test.status)}
                    </div>
                    <div className="text-sm text-gray-600 space-y-1">
                      <div className="flex items-center gap-4">
                        <span>📝 {getTotalQuestions(test)} questions</span>
                        <span>📊 {getTotalPoints(test)} points</span>
                        {test.content_metadata?.time_limit_minutes && (
                          <span>⏱️ {test.content_metadata.time_limit_minutes} min</span>
                        )}
                      </div>
                      <div>
                        <span className="font-medium">Source:</span> {getSourceLabel(test.content_metadata?.source_type)}
                      </div>
                      <div className="text-xs text-gray-400 mt-2">
                        Created {new Date(test.created_at).toLocaleDateString()} at{' '}
                        {new Date(test.created_at).toLocaleTimeString()}
                      </div>
                    </div>

                    {/* Question Distribution */}
                    {isTestReady(test) && test.content_metadata?.distribution && (
                      <div className="mt-3 flex gap-2 text-xs">
                        {test.content_metadata.distribution.multiple_choice > 0 && (
                          <span className="px-2 py-1 bg-gray-100 rounded">
                            {test.content_metadata.distribution.multiple_choice}% MC
                          </span>
                        )}
                        {test.content_metadata.distribution.true_false > 0 && (
                          <span className="px-2 py-1 bg-gray-100 rounded">
                            {test.content_metadata.distribution.true_false}% T/F
                          </span>
                        )}
                        {test.content_metadata.distribution.short_answer > 0 && (
                          <span className="px-2 py-1 bg-gray-100 rounded">
                            {test.content_metadata.distribution.short_answer}% SA
                          </span>
                        )}
                        {test.content_metadata.distribution.essay > 0 && (
                          <span className="px-2 py-1 bg-gray-100 rounded">
                            {test.content_metadata.distribution.essay}% Essay
                          </span>
                        )}
                      </div>
                    )}

                    {/* Attempt History */}
                    <PracticeTestAttempts testId={test.id} studySetId={id} />
                  </div>

                  <div className="flex flex-col gap-2 ml-4">
                    {isTestReady(test) && (
                      <button
                        onClick={() => navigate(`/study-set/${id}/practice-test/${test.id}`)}
                        className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 whitespace-nowrap"
                      >
                        Take Test
                      </button>
                    )}
                    {test.status === 'generating' && (
                      <button
                        onClick={() => navigate(`/study-set/${id}/practice-test/${test.id}`)}
                        className="px-4 py-2 border rounded hover:bg-gray-50 whitespace-nowrap"
                      >
                        View Status
                      </button>
                    )}
                    <button
                      onClick={() => deletePracticeTest(test.id, test.title)}
                      className="px-4 py-2 border border-red-300 text-red-600 rounded hover:bg-red-50 whitespace-nowrap"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

// Component to show attempt history for a test
function PracticeTestAttempts({ testId, studySetId }) {
  const [attempts, setAttempts] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    fetchAttempts()
  }, [testId])

  async function fetchAttempts() {
    const { data } = await supabase
      .from('practice_test_attempts')
      .select('id, score, max_score, created_at, status')
      .eq('practice_test_id', testId)
      .order('created_at', { ascending: false })
      .limit(3)

    setAttempts(data || [])
    setLoading(false)
  }

  if (loading || attempts.length === 0) return null

  return (
    <div className="mt-3 pt-3 border-t">
      <div className="text-xs font-medium text-gray-500 mb-2">Recent Attempts:</div>
      <div className="space-y-1">
        {attempts.map(attempt => {
          const percentage = attempt.max_score ? Math.round((attempt.score / attempt.max_score) * 100) : 0
          return (
            <button
              key={attempt.id}
              onClick={() => navigate(`/study-set/${studySetId}/practice-test/${testId}/results`)}
              className="w-full text-left text-xs p-2 bg-gray-50 rounded hover:bg-gray-100 flex items-center justify-between"
            >
              <span>
                {new Date(attempt.created_at).toLocaleDateString()} - {attempt.score}/{attempt.max_score}
              </span>
              <span className={`font-medium ${percentage >= 70 ? 'text-green-600' : 'text-yellow-600'}`}>
                {percentage}%
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
