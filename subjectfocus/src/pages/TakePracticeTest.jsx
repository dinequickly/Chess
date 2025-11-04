import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../hooks/useAuth'

export default function TakePracticeTest() {
  const { id, testId } = useParams() // study_set_id, practice_test_id
  const navigate = useNavigate()
  const { user } = useAuth()

  const [practiceTest, setPracticeTest] = useState(null)
  const [loading, setLoading] = useState(true)
  const [testStarted, setTestStarted] = useState(false)

  // Test state
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [answers, setAnswers] = useState({}) // { questionIndex: answer }
  const [flagged, setFlagged] = useState(new Set())
  const [timeRemaining, setTimeRemaining] = useState(null) // seconds
  const [testStartTime, setTestStartTime] = useState(null)

  const timerRef = useRef(null)

  useEffect(() => {
    fetchPracticeTest()
  }, [testId])

  useEffect(() => {
    // Poll for test generation
    if (practiceTest && practiceTest.status === 'generating') {
      console.log('🔄 Starting polling for test generation...')
      const interval = setInterval(() => {
        console.log('📡 Polling for test updates...')
        fetchPracticeTest()
      }, 3000)

      return () => {
        console.log('⏹️ Stopping polling')
        clearInterval(interval)
      }
    } else if (practiceTest) {
      console.log('✅ Test status:', practiceTest.status)
    }
  }, [practiceTest?.status, testId])

  useEffect(() => {
    // Start timer when test starts
    if (testStarted && practiceTest?.content_metadata?.time_limit_enabled) {
      const limit = practiceTest.content_metadata.time_limit_minutes * 60
      setTimeRemaining(limit)
      setTestStartTime(Date.now())

      timerRef.current = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev <= 1) {
            handleSubmit(true) // Auto-submit when time runs out
            return 0
          }
          return prev - 1
        })
      }, 1000)

      return () => clearInterval(timerRef.current)
    }
  }, [testStarted])

  async function fetchPracticeTest() {
    const { data, error } = await supabase
      .from('generated_content')
      .select('*')
      .eq('id', testId)
      .single()

    if (error) {
      console.error('Error fetching practice test:', error)
      setLoading(false)
      return
    }

    console.log('📥 Fetched practice test:', {
      id: data.id,
      status: data.status,
      title: data.title,
      hasQuestions: !!data.content_metadata?.questions?.length,
      questionCount: data.content_metadata?.questions?.length || 0
    })

    setPracticeTest(data)
    setLoading(false)
  }

  function startTest() {
    setTestStarted(true)
  }

  function handleAnswer(value) {
    setAnswers(prev => ({
      ...prev,
      [currentQuestionIndex]: value
    }))
  }

  function toggleFlag() {
    setFlagged(prev => {
      const newSet = new Set(prev)
      if (newSet.has(currentQuestionIndex)) {
        newSet.delete(currentQuestionIndex)
      } else {
        newSet.add(currentQuestionIndex)
      }
      return newSet
    })
  }

  function goToQuestion(index) {
    setCurrentQuestionIndex(index)
  }

  function nextQuestion() {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1)
    }
  }

  function previousQuestion() {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(prev => prev - 1)
    }
  }

  async function handleSubmit(autoSubmit = false) {
    if (timerRef.current) {
      clearInterval(timerRef.current)
    }

    if (!autoSubmit && !confirm('Submit your test? You cannot change answers after submitting.')) {
      return
    }

    // Save test attempt
    const { error } = await supabase
      .from('practice_test_attempts')
      .insert({
        user_id: user.id,
        practice_test_id: testId,
        study_set_id: id,
        answers,
        flagged_questions: Array.from(flagged),
        time_taken_seconds: testStartTime ? Math.floor((Date.now() - testStartTime) / 1000) : null,
        status: 'completed'
      })

    if (error) {
      console.error('Error saving attempt:', error)
      alert('Failed to submit test')
      return
    }

    // Navigate to results
    navigate(`/study-set/${id}/practice-test/${testId}/results`)
  }

  function formatTime(seconds) {
    if (seconds === null) return ''
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  if (loading) {
    return <div className="p-6">Loading...</div>
  }

  if (!practiceTest) {
    return <div className="p-6 text-red-600">Practice test not found</div>
  }

  // Generating state
  if (practiceTest.status === 'generating') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-sm border p-8 max-w-md text-center">
          <div className="mb-4">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          </div>
          <h2 className="text-xl font-semibold mb-2">Generating Your Practice Test</h2>
          <p className="text-gray-600">
            AI is creating {practiceTest.content_metadata?.total_questions || 0} questions based on your study materials...
          </p>
          <p className="text-sm text-gray-500 mt-4">This usually takes 10-30 seconds</p>
          <button
            onClick={() => fetchPracticeTest()}
            className="mt-4 px-4 py-2 text-sm text-indigo-600 hover:text-indigo-700 underline"
          >
            Refresh Status
          </button>
        </div>
      </div>
    )
  }

  // Failed state
  if (practiceTest.status === 'failed') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-sm border p-8 max-w-md text-center">
          <h2 className="text-xl font-semibold mb-2 text-red-600">Generation Failed</h2>
          <p className="text-gray-600 mb-4">Failed to generate practice test. Please try again.</p>
          <button
            onClick={() => navigate(`/study-set/${id}`)}
            className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
          >
            Back to Study Set
          </button>
        </div>
      </div>
    )
  }

  // Check if test is ready (must be 'completed' status)
  // NOTE: Valid statuses are: pending, generating, completed, failed
  const isTestReady = practiceTest.status === 'completed'
  if (!isTestReady) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-sm border p-8 max-w-md text-center">
          <h2 className="text-xl font-semibold mb-2">Test Not Ready</h2>
          <p className="text-gray-600 mb-4">
            This test has status: <strong>{practiceTest.status}</strong>
            <br />
            <span className="text-sm">Valid statuses: pending, generating, completed, failed</span>
          </p>
          <button
            onClick={() => fetchPracticeTest()}
            className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 mr-2"
          >
            Refresh
          </button>
          <button
            onClick={() => navigate(`/study-set/${id}/practice-tests`)}
            className="px-4 py-2 border rounded hover:bg-gray-50"
          >
            Back to Practice Tests
          </button>
        </div>
      </div>
    )
  }

  const questions = practiceTest.content_metadata?.questions || []
  const metadata = practiceTest.content_metadata || {}

  // Test not started - show overview
  if (!testStarted) {
    const breakdown = {
      multiple_choice: questions.filter(q => q.question_type === 'multiple_choice').length,
      true_false: questions.filter(q => q.question_type === 'true_false').length,
      short_answer: questions.filter(q => q.question_type === 'short_answer').length,
      essay: questions.filter(q => q.question_type === 'essay').length
    }

    const totalPoints = questions.reduce((sum, q) => sum + (q.points || 0), 0)

    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-sm border p-8 max-w-2xl">
          <h1 className="text-2xl font-bold mb-2">{practiceTest.title}</h1>
          <div className="text-gray-600 mb-6">
            {questions.length} Questions • {metadata.time_limit_enabled ? `${metadata.time_limit_minutes} minutes` : 'No time limit'} • {totalPoints} points
          </div>

          <div className="mb-6">
            <h2 className="font-semibold mb-3">Question Types:</h2>
            <div className="space-y-1 text-sm">
              {breakdown.multiple_choice > 0 && (
                <div>📝 {breakdown.multiple_choice} Multiple Choice</div>
              )}
              {breakdown.true_false > 0 && (
                <div>✓ {breakdown.true_false} True/False</div>
              )}
              {breakdown.short_answer > 0 && (
                <div>✍️ {breakdown.short_answer} Short Answer</div>
              )}
              {breakdown.essay > 0 && (
                <div>📄 {breakdown.essay} Essay</div>
              )}
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded p-4 mb-6 text-sm">
            <p className="font-medium mb-2">Instructions:</p>
            <ul className="list-disc list-inside space-y-1 text-gray-700">
              <li>Answer all questions to the best of your ability</li>
              <li>You can flag questions to review later</li>
              {metadata.time_limit_enabled && (
                <li>You have {metadata.time_limit_minutes} minutes to complete the test</li>
              )}
              <li>Click "Submit Test" when you're done</li>
            </ul>
          </div>

          <button
            onClick={startTest}
            className="w-full px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700"
          >
            Start Test →
          </button>
        </div>
      </div>
    )
  }

  // Test in progress
  const currentQuestion = questions[currentQuestionIndex]
  const progress = ((currentQuestionIndex + 1) / questions.length) * 100
  const answeredCount = Object.keys(answers).length

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm border p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-lg font-medium">
              Question {currentQuestionIndex + 1} of {questions.length}
            </div>
            {metadata.time_limit_enabled && (
              <div className={`text-lg font-mono ${timeRemaining < 300 ? 'text-red-600' : ''}`}>
                ⏱️ {formatTime(timeRemaining)}
              </div>
            )}
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
            <div
              className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="text-sm text-gray-600">
            Answered: {answeredCount}/{questions.length} • Flagged: {flagged.size}
          </div>
        </div>

        {/* Question */}
        <div className="bg-white rounded-lg shadow-sm border p-6 mb-4">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <div className="text-sm text-gray-500 mb-1">
                {currentQuestion.question_type === 'multiple_choice' && '📝 Multiple Choice'}
                {currentQuestion.question_type === 'true_false' && '✓ True/False'}
                {currentQuestion.question_type === 'short_answer' && '✍️ Short Answer'}
                {currentQuestion.question_type === 'essay' && '📄 Essay'}
              </div>
              <div className="text-lg font-medium mb-2">{currentQuestion.question_text}</div>
              <div className="text-sm text-gray-500">({currentQuestion.points || 5} points)</div>
            </div>
          </div>

          {/* Answer Options */}
          {(currentQuestion.question_type === 'multiple_choice' || currentQuestion.question_type === 'true_false') && (
            <div className="space-y-2">
              {currentQuestion.options?.map((option, idx) => (
                <label
                  key={idx}
                  className={`flex items-center p-3 border rounded cursor-pointer hover:bg-gray-50 ${
                    answers[currentQuestionIndex] === option ? 'bg-indigo-50 border-indigo-600' : ''
                  }`}
                >
                  <input
                    type="radio"
                    name={`question-${currentQuestionIndex}`}
                    checked={answers[currentQuestionIndex] === option}
                    onChange={() => handleAnswer(option)}
                    className="mr-3"
                  />
                  <span>{option}</span>
                </label>
              ))}
            </div>
          )}

          {currentQuestion.question_type === 'short_answer' && (
            <textarea
              value={answers[currentQuestionIndex] || ''}
              onChange={(e) => handleAnswer(e.target.value)}
              className="w-full border rounded px-3 py-2 mt-2"
              rows="3"
              placeholder="Type your answer here..."
            />
          )}

          {currentQuestion.question_type === 'essay' && (
            <textarea
              value={answers[currentQuestionIndex] || ''}
              onChange={(e) => handleAnswer(e.target.value)}
              className="w-full border rounded px-3 py-2 mt-2"
              rows="8"
              placeholder="Type your essay answer here..."
            />
          )}
        </div>

        {/* Navigation */}
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="flex items-center justify-between">
            <button
              onClick={previousQuestion}
              disabled={currentQuestionIndex === 0}
              className="px-4 py-2 border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ← Previous
            </button>

            <button
              onClick={toggleFlag}
              className={`px-4 py-2 border rounded ${
                flagged.has(currentQuestionIndex) ? 'bg-yellow-100 border-yellow-500' : 'hover:bg-gray-50'
              }`}
            >
              {flagged.has(currentQuestionIndex) ? '🚩 Flagged' : 'Flag'}
            </button>

            {currentQuestionIndex === questions.length - 1 ? (
              <button
                onClick={() => handleSubmit(false)}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
              >
                Submit Test
              </button>
            ) : (
              <button
                onClick={nextQuestion}
                className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
              >
                Next →
              </button>
            )}
          </div>
        </div>

        {/* Question Grid */}
        <div className="bg-white rounded-lg shadow-sm border p-4 mt-4">
          <div className="text-sm font-medium mb-3">All Questions:</div>
          <div className="grid grid-cols-10 gap-2">
            {questions.map((_, idx) => (
              <button
                key={idx}
                onClick={() => goToQuestion(idx)}
                className={`w-10 h-10 border rounded text-sm font-medium ${
                  idx === currentQuestionIndex
                    ? 'bg-indigo-600 text-white'
                    : answers[idx]
                    ? 'bg-green-100 border-green-500'
                    : flagged.has(idx)
                    ? 'bg-yellow-100 border-yellow-500'
                    : 'hover:bg-gray-50'
                }`}
              >
                {idx + 1}
              </button>
            ))}
          </div>
          <div className="flex gap-4 mt-3 text-xs text-gray-600">
            <span className="flex items-center gap-1">
              <div className="w-4 h-4 bg-green-100 border border-green-500 rounded"></div>
              Answered
            </span>
            <span className="flex items-center gap-1">
              <div className="w-4 h-4 bg-yellow-100 border border-yellow-500 rounded"></div>
              Flagged
            </span>
            <span className="flex items-center gap-1">
              <div className="w-4 h-4 bg-indigo-600 rounded"></div>
              Current
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
