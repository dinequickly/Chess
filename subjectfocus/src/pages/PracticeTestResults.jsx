import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../hooks/useAuth'

export default function PracticeTestResults() {
  const { id, testId } = useParams() // study_set_id, practice_test_id
  const navigate = useNavigate()
  const { user } = useAuth()

  const [practiceTest, setPracticeTest] = useState(null)
  const [attempt, setAttempt] = useState(null)
  const [loading, setLoading] = useState(true)
  const [reviewMode, setReviewMode] = useState(false)

  useEffect(() => {
    fetchResults()
  }, [testId, user])

  async function fetchResults() {
    // Fetch practice test
    const { data: testData, error: testError } = await supabase
      .from('generated_content')
      .select('*')
      .eq('id', testId)
      .single()

    if (testError) {
      console.error('Error fetching test:', testError)
      setLoading(false)
      return
    }

    // Fetch latest attempt
    const { data: attemptData, error: attemptError } = await supabase
      .from('practice_test_attempts')
      .select('*')
      .eq('practice_test_id', testId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (attemptError) {
      console.error('Error fetching attempt:', attemptError)
      setLoading(false)
      return
    }

    // Calculate score
    const questions = testData.content_metadata?.questions || []
    let totalScore = 0
    let maxScore = 0

    questions.forEach((question, idx) => {
      const userAnswer = attemptData.answers[idx]
      const correctAnswer = question.correct_answer
      const points = question.points || 5

      maxScore += points

      if (userAnswer && correctAnswer) {
        if (question.question_type === 'multiple_choice' || question.question_type === 'true_false') {
          if (userAnswer === correctAnswer) {
            totalScore += points
          }
        }
        // For short_answer and essay, we'd need AI grading or manual grading
        // For now, we'll just show them as unanswered
      }
    })

    // Update attempt with calculated score
    await supabase
      .from('practice_test_attempts')
      .update({
        score: totalScore,
        max_score: maxScore,
        completed_at: new Date().toISOString()
      })
      .eq('id', attemptData.id)

    setPracticeTest(testData)
    setAttempt({ ...attemptData, score: totalScore, max_score: maxScore })
    setLoading(false)
  }

  function formatTime(seconds) {
    if (!seconds) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  function getPercentage() {
    if (!attempt || !attempt.max_score) return 0
    return Math.round((attempt.score / attempt.max_score) * 100)
  }

  function getPerformanceByType() {
    if (!practiceTest || !attempt) return {}

    const questions = practiceTest.content_metadata?.questions || []
    const performance = {}

    questions.forEach((question, idx) => {
      const type = question.question_type
      if (!performance[type]) {
        performance[type] = { correct: 0, total: 0 }
      }

      performance[type].total++

      const userAnswer = attempt.answers[idx]
      const correctAnswer = question.correct_answer

      if (userAnswer === correctAnswer) {
        performance[type].correct++
      }
    })

    return performance
  }

  if (loading) {
    return <div className="p-6">Loading results...</div>
  }

  if (!practiceTest || !attempt) {
    return <div className="p-6 text-red-600">Results not found</div>
  }

  const percentage = getPercentage()
  const questions = practiceTest.content_metadata?.questions || []
  const performance = getPerformanceByType()

  // Results Overview
  if (!reviewMode) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-4xl mx-auto p-6">
          <div className="bg-white rounded-lg shadow-sm border p-8 mb-6">
            <h1 className="text-3xl font-bold mb-4 text-center">
              Results: {attempt.score}/{attempt.max_score} ({percentage}%)
            </h1>

            <div className="flex justify-center mb-6">
              <div className="text-6xl">
                {percentage >= 90 ? '🎉' : percentage >= 70 ? '👍' : percentage >= 50 ? '📚' : '💪'}
              </div>
            </div>

            {attempt.time_taken_seconds && (
              <div className="text-center text-gray-600 mb-6">
                Time Taken: {formatTime(attempt.time_taken_seconds)}
              </div>
            )}

            {/* Performance by Type */}
            <div className="mb-6">
              <h2 className="text-xl font-semibold mb-3">Performance by Question Type:</h2>
              <div className="space-y-2">
                {Object.entries(performance).map(([type, stats]) => {
                  const typePercentage = Math.round((stats.correct / stats.total) * 100)
                  return (
                    <div key={type} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                      <span className="font-medium capitalize">
                        {type.replace('_', ' ')}:
                      </span>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-600">
                          {stats.correct}/{stats.total}
                        </span>
                        <div className="w-32 bg-gray-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${
                              typePercentage >= 70 ? 'bg-green-500' : 'bg-yellow-500'
                            }`}
                            style={{ width: `${typePercentage}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium">{typePercentage}%</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => setReviewMode(true)}
                className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
              >
                Review Answers
              </button>
              <button
                onClick={() => navigate(`/study-set/${id}/practice-test/${testId}`)}
                className="flex-1 px-4 py-2 border rounded hover:bg-gray-50"
              >
                Retake Test
              </button>
            </div>

            <button
              onClick={() => navigate(`/study-set/${id}`)}
              className="w-full mt-3 px-4 py-2 border rounded hover:bg-gray-50"
            >
              Back to Study Set
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Review Mode
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-6">
        <div className="mb-6">
          <button
            onClick={() => setReviewMode(false)}
            className="text-gray-600 hover:text-gray-900 mb-4"
          >
            ← Back to Results
          </button>
          <h1 className="text-2xl font-bold">Question Review</h1>
        </div>

        <div className="space-y-4">
          {questions.map((question, idx) => {
            const userAnswer = attempt.answers[idx]
            const correctAnswer = question.correct_answer
            const isCorrect = userAnswer === correctAnswer
            const points = question.points || 5

            return (
              <div key={idx} className="bg-white rounded-lg shadow-sm border p-6">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-medium text-gray-500">
                        Question {idx + 1}
                      </span>
                      {isCorrect ? (
                        <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded">
                          ✅ Correct (+{points} pts)
                        </span>
                      ) : (
                        <span className="px-2 py-1 bg-red-100 text-red-800 text-xs rounded">
                          ❌ Incorrect (0 pts)
                        </span>
                      )}
                    </div>
                    <div className="text-lg font-medium mb-2">{question.question_text}</div>
                  </div>
                </div>

                {/* Show answer options for MC/TF */}
                {(question.question_type === 'multiple_choice' || question.question_type === 'true_false') && (
                  <div className="space-y-2 mb-4">
                    {question.options?.map((option, optIdx) => {
                      const isUserAnswer = userAnswer === option
                      const isCorrectAnswer = correctAnswer === option

                      return (
                        <div
                          key={optIdx}
                          className={`p-3 border rounded ${
                            isCorrectAnswer
                              ? 'bg-green-50 border-green-500'
                              : isUserAnswer
                              ? 'bg-red-50 border-red-500'
                              : ''
                          }`}
                        >
                          {option}
                          {isUserAnswer && !isCorrectAnswer && (
                            <span className="ml-2 text-red-600 text-sm">← Your answer</span>
                          )}
                          {isCorrectAnswer && (
                            <span className="ml-2 text-green-600 text-sm">← Correct</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Show text answers for SA/Essay */}
                {(question.question_type === 'short_answer' || question.question_type === 'essay') && (
                  <div className="mb-4">
                    <div className="text-sm font-medium mb-2">Your Answer:</div>
                    <div className="p-3 bg-gray-50 border rounded whitespace-pre-wrap">
                      {userAnswer || '(No answer provided)'}
                    </div>
                    {question.sample_answer && (
                      <>
                        <div className="text-sm font-medium mt-3 mb-2">Sample Answer:</div>
                        <div className="p-3 bg-green-50 border border-green-200 rounded whitespace-pre-wrap">
                          {question.sample_answer}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Explanation */}
                {question.explanation && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded">
                    <div className="text-sm font-medium mb-1">Explanation:</div>
                    <div className="text-sm">{question.explanation}</div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="mt-6 flex gap-3">
          <button
            onClick={() => setReviewMode(false)}
            className="flex-1 px-4 py-2 border rounded hover:bg-gray-50"
          >
            Back to Results
          </button>
          <button
            onClick={() => navigate(`/study-set/${id}`)}
            className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
          >
            Back to Study Set
          </button>
        </div>
      </div>
    </div>
  )
}
