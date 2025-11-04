import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Conversation } from '@elevenlabs/client'
import { supabase } from '../supabaseClient'
import { useAuth } from '../hooks/useAuth'
import SlideViewer from '../components/SlideViewer'

export default function LiveTutorSession() {
  const { setId, podcastId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [podcast, setPodcast] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [connectionStatus, setConnectionStatus] = useState('disconnected')
  const [mode, setMode] = useState('listening')
  const [conversation, setConversation] = useState(null)

  useEffect(() => {
    fetchPodcast()
  }, [podcastId])

  // Subscribe to Realtime updates for current_slide_number
  useEffect(() => {
    if (!podcast) return

    const channel = supabase
      .channel(`podcast-${podcastId}`)
      .on('postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'podcasts',
          filter: `id=eq.${podcastId}`
        },
        (payload) => {
          console.log('Realtime update:', payload.new.current_slide_number)
          if (payload.new.current_slide_number !== podcast.current_slide_number) {
            setPodcast(prev => ({
              ...prev,
              current_slide_number: payload.new.current_slide_number
            }))
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [podcast, podcastId])

  async function fetchPodcast() {
    setLoading(true)
    const { data, error: fetchErr } = await supabase
      .from('podcasts')
      .select('*')
      .eq('id', podcastId)
      .single()

    if (fetchErr) {
      setError(fetchErr.message)
      setLoading(false)
      return
    }

    setPodcast(data)
    setLoading(false)
  }

  function formatScript(script) {
    if (!script) return ''

    // Handle nested structure: {script: [...]} vs [...]
    const scriptArray = Array.isArray(script) ? script : script.script

    if (!scriptArray || !Array.isArray(scriptArray)) return ''

    return scriptArray
      .map(item => `${item.speaker}: ${item.text}`)
      .join('\n\n')
  }

  async function startSession() {
    if (!podcast) return

    setConnectionStatus('connecting')
    setError('')

    try {
      const agentId = import.meta.env.VITE_INTERACTIVE_AGENT_ID

      if (!agentId) {
        throw new Error('Agent ID not configured')
      }

      const formattedScript = formatScript(podcast.script)

      const conv = await Conversation.startSession({
        agentId: agentId,
        dynamicVariables: {
          topic: podcast.user_goal || podcast.title,
          script: formattedScript,
          Current_Slide_Number: podcast.current_slide_number?.toString() || '0'
        },
        onConnect: () => {
          console.log('Connected to ElevenLabs Tutor')
          setConnectionStatus('connected')
        },
        onDisconnect: () => {
          console.log('Disconnected from ElevenLabs Tutor')
          setConnectionStatus('disconnected')
          setMode('listening')
        },
        onError: (error) => {
          console.error('ElevenLabs error:', error)
          setError(error.message || 'Connection error occurred')
          setConnectionStatus('disconnected')
        },
        onModeChange: (newMode) => {
          console.log('Mode changed to:', newMode.mode)
          setMode(newMode.mode)
        }
      })

      setConversation(conv)
    } catch (err) {
      console.error('Failed to start tutor session:', err)
      setError(err.message || 'Failed to start session')
      setConnectionStatus('disconnected')
    }
  }

  async function endSession() {
    if (conversation) {
      try {
        await conversation.endSession()
        setConversation(null)
        setConnectionStatus('disconnected')
        setMode('listening')
      } catch (err) {
        console.error('Failed to end session:', err)
      }
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading tutor session...</div>
      </div>
    )
  }

  if (error && !podcast) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-600 mb-4">{error}</div>
          <button
            onClick={() => navigate(`/study-set/${setId}/podcasts`)}
            className="text-indigo-600 hover:text-indigo-700"
          >
            ← Back to Podcasts
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-gray-900">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate(`/study-set/${setId}/podcasts`)}
              className="text-gray-400 hover:text-white"
            >
              ← Back
            </button>
            <div>
              <h1 className="text-xl font-bold text-white">{podcast?.title}</h1>
              <div className="text-sm text-gray-400">Live Tutor Session</div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {/* Connection Status */}
            {connectionStatus === 'connected' && (
              <div className="flex items-center gap-2">
                {mode === 'speaking' ? (
                  <>
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                    <span className="text-sm text-gray-300">Tutor speaking...</span>
                  </>
                ) : (
                  <>
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-sm text-gray-300">You can speak</span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content: Split Screen */}
      <div className="flex-1 grid grid-cols-2 gap-0 overflow-hidden">
        {/* Left: Slides */}
        <div className="h-full border-r border-gray-700">
          <SlideViewer
            slides={podcast?.slides || []}
            currentSlide={podcast?.current_slide_number || 0}
          />
        </div>

        {/* Right: Voice Interface */}
        <div className="h-full bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex flex-col">
          <div className="flex-1 flex items-center justify-center p-8">
            {connectionStatus === 'disconnected' ? (
              <div className="text-center">
                <div className="mb-6">
                  <div className="w-32 h-32 mx-auto bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center">
                    <svg
                      className="w-16 h-16 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                      />
                    </svg>
                  </div>
                </div>
                <h2 className="text-2xl font-bold text-white mb-4">
                  Ready to Start Your Tutoring Session?
                </h2>
                <p className="text-purple-200 mb-6 max-w-md mx-auto">
                  Your AI tutor will guide you through the slides and answer your questions in real-time.
                </p>
                <button
                  onClick={startSession}
                  disabled={connectionStatus === 'connecting'}
                  className="px-8 py-4 bg-white text-purple-900 font-semibold rounded-lg shadow-lg hover:bg-gray-100 transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {connectionStatus === 'connecting' ? 'Connecting...' : 'Start Session'}
                </button>
              </div>
            ) : (
              <div className="text-center">
                <div className="mb-6">
                  <div className="w-40 h-40 mx-auto bg-gradient-to-br from-green-400 to-blue-500 rounded-full flex items-center justify-center animate-pulse">
                    <svg
                      className="w-20 h-20 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                      />
                    </svg>
                  </div>
                </div>
                <h2 className="text-2xl font-bold text-white mb-4">
                  Session Active
                </h2>
                <p className="text-purple-200 mb-6">
                  {mode === 'speaking'
                    ? 'Your tutor is speaking. Listen carefully!'
                    : 'Ask questions or request to move to a different slide.'}
                </p>
                <button
                  onClick={endSession}
                  className="px-8 py-4 bg-red-600 text-white font-semibold rounded-lg shadow-lg hover:bg-red-700 transition-all"
                >
                  End Session
                </button>
              </div>
            )}
          </div>

          {error && (
            <div className="p-4 bg-red-900 bg-opacity-50 border-t border-red-800">
              <p className="text-red-200 text-sm text-center">{error}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
