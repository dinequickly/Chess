import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../hooks/useAuth'

export default function CreatePracticeTest() {
  const { id } = useParams() // study_set_id
  const navigate = useNavigate()
  const { user } = useAuth()

  // Study set and study guides data
  const [studySet, setStudySet] = useState(null)
  const [studyGuides, setStudyGuides] = useState([])
  const [loading, setLoading] = useState(true)

  // Form fields
  const [testTitle, setTestTitle] = useState('')
  const [sourceType, setSourceType] = useState('flashcards') // flashcards, study_guide, custom_topic
  const [selectedGuide, setSelectedGuide] = useState('')
  const [customTopic, setCustomTopic] = useState('')
  const [totalQuestions, setTotalQuestions] = useState(15)

  // Question distribution (percentages)
  const [distribution, setDistribution] = useState({
    multiple_choice: 60,
    true_false: 20,
    short_answer: 10,
    essay: 10
  })

  // Advanced options
  const [progressiveDifficulty, setProgressiveDifficulty] = useState(true)
  const [includeMisconceptions, setIncludeMisconceptions] = useState(true)
  const [detailedExplanations, setDetailedExplanations] = useState(true)
  const [mixRecallApplication, setMixRecallApplication] = useState(true)

  // Test settings
  const [timeLimitEnabled, setTimeLimitEnabled] = useState(true)
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(30)
  const [shuffleQuestions, setShuffleQuestions] = useState(true)
  const [showResults, setShowResults] = useState('after_submission')

  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchData()
  }, [id])

  async function fetchData() {
    setLoading(true)

    // Fetch study set
    const { data: setData, error: setError } = await supabase
      .from('study_sets')
      .select('id, title, total_cards')
      .eq('id', id)
      .single()

    if (setError) {
      setError(setError.message)
      setLoading(false)
      return
    }

    setStudySet(setData)
    setTestTitle(`${setData.title} Practice Test`)

    // Fetch study guides for this set
    const { data: guidesData } = await supabase
      .from('generated_content')
      .select('id, title')
      .eq('study_set_id', id)
      .eq('content_type', 'study_guide')
      .eq('status', 'completed')

    setStudyGuides(guidesData || [])
    setLoading(false)
  }

  function updateDistribution(type, value) {
    const numValue = parseInt(value) || 0
    setDistribution(prev => ({ ...prev, [type]: numValue }))
  }

  function getDistributionTotal() {
    return Object.values(distribution).reduce((sum, val) => sum + val, 0)
  }

  function getQuestionBreakdown() {
    const total = totalQuestions
    return {
      multiple_choice: Math.round((distribution.multiple_choice / 100) * total),
      true_false: Math.round((distribution.true_false / 100) * total),
      short_answer: Math.round((distribution.short_answer / 100) * total),
      essay: Math.round((distribution.essay / 100) * total)
    }
  }

  async function handleGenerate(e) {
    e.preventDefault()

    // Validation
    if (!testTitle.trim()) {
      setError('Please enter a test title')
      return
    }

    if (sourceType === 'study_guide' && !selectedGuide) {
      setError('Please select a study guide')
      return
    }

    if (sourceType === 'custom_topic' && !customTopic.trim()) {
      setError('Please enter a custom topic')
      return
    }

    const distTotal = getDistributionTotal()
    if (distTotal !== 100) {
      setError(`Question distribution must total 100% (currently ${distTotal}%)`)
      return
    }

    setGenerating(true)
    setError('')

    try {
      // Create practice test record in database
const { data: practiceTest, error: insertError } = await supabase
  .from('generated_content')
  .insert({
    user_id: user.id,
    study_set_id: id,
    content_type: 'practice_test',
    title: testTitle,
    status: 'generating',

    // Store test configuration and questions in content_metadata
    content_metadata: {
      source_type: sourceType,
      source_guide_id: selectedGuide || null,
      custom_topic: customTopic || null,
      total_questions: totalQuestions,
      distribution: {
        multiple_choice: distribution.multiple_choice,
        true_false: distribution.true_false,
        short_answer: distribution.short_answer,
        essay: distribution.essay
      },
      progressive_difficulty: progressiveDifficulty,
      include_misconceptions: includeMisconceptions,
      detailed_explanations: detailedExplanations,
      mix_recall_application: mixRecallApplication,
      time_limit_enabled: timeLimitEnabled,
      time_limit_minutes: timeLimitEnabled ? timeLimitMinutes : null,
      shuffle_questions: shuffleQuestions,
      show_results: showResults,
      questions: []  // Will be populated by webhook
    }
  })
  .select()
  .single()

if (insertError) throw insertError

      // Fire webhook to generate test
      const webhookPayload = {
        practice_test_id: practiceTest.id,
        study_set_id: id,
        test_title: testTitle,
        source: sourceType,
        source_guide_id: selectedGuide || null,
        custom_topic: customTopic || null,
        total_questions: totalQuestions,
        distribution,
        progressive_difficulty: progressiveDifficulty,
        include_misconceptions: includeMisconceptions,
        detailed_explanations: detailedExplanations,
        mix_recall_application: mixRecallApplication,
        time_limit_minutes: timeLimitEnabled ? timeLimitMinutes : null,
        shuffle_questions: shuffleQuestions,
        show_results: showResults
      }

      console.log('🚀 Firing webhook to generate practice test:', webhookPayload)

      fetch('https://maxipad.app.n8n.cloud/webhook/generate-practice-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(webhookPayload)
      })
        .then(response => {
          console.log('✅ Webhook response status:', response.status)
          return response.text()
        })
        .then(data => {
          console.log('✅ Webhook response data:', data)
        })
        .catch(err => {
          console.error('❌ Webhook error:', err)
        })

      // Navigate to test waiting/loading page
      navigate(`/study-set/${id}/practice-test/${practiceTest.id}`)
    } catch (err) {
      console.error('Generate error:', err)
      setError(err.message || 'Failed to generate practice test')
      setGenerating(false)
    }
  }

  if (loading) {
    return <div className="p-6">Loading...</div>
  }

  const breakdown = getQuestionBreakdown()
  const distTotal = getDistributionTotal()

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto p-6">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => navigate(`/study-set/${id}`)}
              className="text-gray-600 hover:text-gray-900"
            >
              ← Back to Study Set
            </button>
            <button
              onClick={async () => {
                console.log('🧪 Testing webhook...')
                try {
                  const response = await fetch('https://maxipad.app.n8n.cloud/webhook/generate-practice-test', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ test: true, timestamp: new Date().toISOString() })
                  })
                  console.log('✅ Test webhook response:', response.status, await response.text())
                  alert(`Webhook test: ${response.status} ${response.ok ? 'OK' : 'Failed'}`)
                } catch (err) {
                  console.error('❌ Test webhook error:', err)
                  alert('Webhook test failed: ' + err.message)
                }
              }}
              className="text-xs px-2 py-1 border rounded hover:bg-gray-50"
            >
              Test Webhook
            </button>
          </div>
          <h1 className="text-2xl font-bold">Generate Practice Test</h1>
        </div>

        <form onSubmit={handleGenerate} className="bg-white rounded-lg shadow-sm border p-6 space-y-6">
          {/* Test Title */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Test Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={testTitle}
              onChange={(e) => setTestTitle(e.target.value)}
              className="w-full border rounded px-3 py-2"
              placeholder="Civil War Midterm Practice"
              required
            />
          </div>

          {/* Source Material */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Source Material <span className="text-red-500">*</span>
            </label>
            <div className="space-y-2">
              <label className="flex items-center">
                <input
                  type="radio"
                  value="flashcards"
                  checked={sourceType === 'flashcards'}
                  onChange={(e) => setSourceType(e.target.value)}
                  className="mr-2"
                />
                Current Study Set ({studySet?.total_cards || 0} flashcards)
              </label>

              {studyGuides.length > 0 && (
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="study_guide"
                    checked={sourceType === 'study_guide'}
                    onChange={(e) => setSourceType(e.target.value)}
                    className="mr-2"
                  />
                  <span className="mr-2">Study Guide:</span>
                  <select
                    value={selectedGuide}
                    onChange={(e) => {
                      setSelectedGuide(e.target.value)
                      setSourceType('study_guide')
                    }}
                    disabled={sourceType !== 'study_guide'}
                    className="border rounded px-2 py-1 text-sm disabled:bg-gray-100"
                  >
                    <option value="">Select guide...</option>
                    {studyGuides.map(guide => (
                      <option key={guide.id} value={guide.id}>
                        {guide.title}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label className="flex items-start">
                <input
                  type="radio"
                  value="custom_topic"
                  checked={sourceType === 'custom_topic'}
                  onChange={(e) => setSourceType(e.target.value)}
                  className="mr-2 mt-1"
                />
                <div className="flex-1">
                  <span>Custom Topic:</span>
                  <input
                    type="text"
                    value={customTopic}
                    onChange={(e) => {
                      setCustomTopic(e.target.value)
                      setSourceType('custom_topic')
                    }}
                    disabled={sourceType !== 'custom_topic'}
                    className="w-full border rounded px-3 py-2 mt-1 disabled:bg-gray-100"
                    placeholder="e.g., The Civil War Era"
                  />
                </div>
              </label>
            </div>
          </div>

          {/* Number of Questions */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Number of Questions <span className="text-red-500">*</span>
            </label>
            <input
              type="range"
              min="5"
              max="50"
              step="5"
              value={totalQuestions}
              onChange={(e) => setTotalQuestions(parseInt(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-sm text-gray-600 mt-1">
              <span>5</span>
              <span className="font-medium text-indigo-600">{totalQuestions} questions</span>
              <span>50</span>
            </div>
          </div>

          {/* Question Type Distribution */}
          <div>
            <label className="block text-sm font-medium mb-2">Question Type Distribution</label>
            <div className="border rounded p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm">
                  Multiple Choice
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={distribution.multiple_choice}
                    onChange={(e) => updateDistribution('multiple_choice', e.target.value)}
                    className="w-full border rounded px-2 py-1 mt-1"
                  />
                </label>

                <label className="text-sm">
                  True/False
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={distribution.true_false}
                    onChange={(e) => updateDistribution('true_false', e.target.value)}
                    className="w-full border rounded px-2 py-1 mt-1"
                  />
                </label>

                <label className="text-sm">
                  Short Answer
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={distribution.short_answer}
                    onChange={(e) => updateDistribution('short_answer', e.target.value)}
                    className="w-full border rounded px-2 py-1 mt-1"
                  />
                </label>

                <label className="text-sm">
                  Essay
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={distribution.essay}
                    onChange={(e) => updateDistribution('essay', e.target.value)}
                    className="w-full border rounded px-2 py-1 mt-1"
                  />
                </label>
              </div>

              <div className={`text-sm font-medium ${distTotal === 100 ? 'text-green-600' : 'text-red-600'}`}>
                Total: {distTotal}% {distTotal === 100 ? '✓' : `(must be 100%)`}
              </div>

              <div className="text-xs text-gray-600 bg-gray-50 p-2 rounded">
                <span className="font-medium">{totalQuestions} questions = </span>
                {breakdown.multiple_choice} MC, {breakdown.true_false} T/F, {breakdown.short_answer} SA, {breakdown.essay} Essay
              </div>
            </div>
          </div>

          {/* Difficulty Settings */}
          <div>
            <label className="block text-sm font-medium mb-2">Difficulty Settings</label>
            <label className="flex items-start">
              <input
                type="checkbox"
                checked={progressiveDifficulty}
                onChange={(e) => setProgressiveDifficulty(e.target.checked)}
                className="mr-2 mt-1"
              />
              <div>
                <div className="font-medium text-sm">Progressive Difficulty</div>
                <div className="text-xs text-gray-600">Start easy, gradually increase</div>
              </div>
            </label>
          </div>

          {/* Advanced Options */}
          <div>
            <label className="block text-sm font-medium mb-2">Advanced Options</label>
            <div className="space-y-3">
              <label className="flex items-start">
                <input
                  type="checkbox"
                  checked={includeMisconceptions}
                  onChange={(e) => setIncludeMisconceptions(e.target.checked)}
                  className="mr-2 mt-1"
                />
                <div>
                  <div className="font-medium text-sm">Include Common Misconceptions</div>
                  <div className="text-xs text-gray-600">Add tricky distractors</div>
                </div>
              </label>

              <label className="flex items-start">
                <input
                  type="checkbox"
                  checked={detailedExplanations}
                  onChange={(e) => setDetailedExplanations(e.target.checked)}
                  className="mr-2 mt-1"
                />
                <div>
                  <div className="font-medium text-sm">Provide Detailed Explanations</div>
                  <div className="text-xs text-gray-600">Show why answers are correct/wrong</div>
                </div>
              </label>

              <label className="flex items-start">
                <input
                  type="checkbox"
                  checked={mixRecallApplication}
                  onChange={(e) => setMixRecallApplication(e.target.checked)}
                  className="mr-2 mt-1"
                />
                <div>
                  <div className="font-medium text-sm">Mix Recall & Application Questions</div>
                  <div className="text-xs text-gray-600">Test understanding, not just memorization</div>
                </div>
              </label>
            </div>
          </div>

          {/* Test Settings */}
          <div>
            <label className="block text-sm font-medium mb-2">Test Settings</label>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <label className="text-sm">Time Limit:</label>
                <input
                  type="number"
                  min="5"
                  max="180"
                  value={timeLimitMinutes}
                  onChange={(e) => setTimeLimitMinutes(parseInt(e.target.value) || 30)}
                  disabled={!timeLimitEnabled}
                  className="border rounded px-2 py-1 w-20 disabled:bg-gray-100"
                />
                <span className="text-sm">minutes</span>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={timeLimitEnabled}
                    onChange={(e) => setTimeLimitEnabled(e.target.checked)}
                    className="mr-2"
                  />
                  <span className="text-sm">Enable</span>
                </label>
              </div>

              <label className="flex items-center">
                <span className="text-sm mr-3">Shuffle Questions:</span>
                <input
                  type="checkbox"
                  checked={shuffleQuestions}
                  onChange={(e) => setShuffleQuestions(e.target.checked)}
                  className="mr-2"
                />
                <span className="text-sm">Yes</span>
              </label>

              <div className="flex items-center gap-3">
                <label className="text-sm">Show Results:</label>
                <select
                  value={showResults}
                  onChange={(e) => setShowResults(e.target.value)}
                  className="border rounded px-2 py-1"
                >
                  <option value="after_submission">After Submission</option>
                  <option value="immediately">Immediately (per question)</option>
                  <option value="never">Never (practice only)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded text-sm">
              {error}
            </div>
          )}

          {/* Submit Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={() => navigate(`/study-set/${id}`)}
              className="px-4 py-2 border rounded hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={generating || distTotal !== 100}
              className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {generating ? 'Generating...' : 'Generate Practice Test →'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
