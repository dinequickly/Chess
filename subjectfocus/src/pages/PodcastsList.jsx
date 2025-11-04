import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../hooks/useAuth'

export default function PodcastsList() {
  const { id } = useParams() // study_set_id
  const navigate = useNavigate()
  const { user } = useAuth()
  const [podcasts, setPodcasts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchPodcasts()
  }, [id])

  async function fetchPodcasts() {
    setLoading(true)
    const { data, error: fetchErr } = await supabase
      .from('podcasts')
      .select('*')
      .eq('study_set_id', id)
      .order('created_at', { ascending: false })

    if (fetchErr) {
      setError(fetchErr.message)
    } else {
      setPodcasts(data || [])
    }
    setLoading(false)
  }

  async function deletePodcast(podcastId) {
    if (!confirm('Delete this podcast?')) return

    const { error: deleteErr } = await supabase
      .from('podcasts')
      .delete()
      .eq('id', podcastId)

    if (deleteErr) {
      alert('Failed to delete: ' + deleteErr.message)
    } else {
      fetchPodcasts()
    }
  }

  function getTypeLabel(type) {
    const labels = {
      'pre-recorded': 'Pre-Recorded',
      'live-tutor': 'Live Tutor',
      'live-interactive': 'Live Interactive'
    }
    return labels[type] || type
  }

  function getStatusBadge(status) {
    const styles = {
      generating: 'bg-yellow-100 text-yellow-800',
      ready: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800'
    }
    return (
      <span className={`px-2 py-1 rounded text-xs font-medium ${styles[status] || ''}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    )
  }

  if (loading) return <div className="p-6">Loading podcasts...</div>
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
            <h1 className="text-2xl font-bold">Podcasts</h1>
          </div>
          <button
            onClick={() => navigate(`/study-set/${id}/podcasts/create`)}
            className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
          >
            Create Podcast
          </button>
        </div>

        {/* Type Filter Buttons */}
        <div className="bg-white rounded-lg shadow-sm border p-4 mb-6">
          <div className="flex gap-3">
            <button
              onClick={() => navigate(`/study-set/${id}/podcasts/create?type=pre-recorded`)}
              className="flex-1 px-4 py-3 border rounded hover:bg-gray-50 text-center"
            >
              <div className="font-medium">Pre-Recorded</div>
              <div className="text-xs text-gray-500 mt-1">Listen to generated content</div>
            </button>
            <button
              onClick={() => navigate(`/study-set/${id}/podcasts/create?type=live-tutor`)}
              className="flex-1 px-4 py-3 border rounded hover:bg-gray-50 text-center"
            >
              <div className="font-medium">Live Tutor</div>
              <div className="text-xs text-gray-500 mt-1">Interactive tutoring session</div>
            </button>
            <button
              onClick={() => navigate(`/study-set/${id}/podcasts/create?type=live-interactive`)}
              className="flex-1 px-4 py-3 border rounded hover:bg-gray-50 text-center"
            >
              <div className="font-medium">Live Interactive</div>
              <div className="text-xs text-gray-500 mt-1">Real-time discussion</div>
            </button>
          </div>
        </div>

        {/* Podcasts List */}
        <div className="space-y-4">
          {podcasts.length === 0 ? (
            <div className="bg-white rounded-lg shadow-sm border p-12 text-center">
              <p className="text-gray-500 mb-4">No podcasts yet</p>
              <button
                onClick={() => navigate(`/study-set/${id}/podcasts/create`)}
                className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
              >
                Create Your First Podcast
              </button>
            </div>
          ) : (
            podcasts.map(podcast => (
              <div key={podcast.id} className="bg-white rounded-lg shadow-sm border p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-medium">{podcast.title}</h3>
                      {getStatusBadge(podcast.status)}
                    </div>
                    <div className="text-sm text-gray-600 space-y-1">
                      <div>Type: {getTypeLabel(podcast.type)}</div>
                      <div>Duration: {podcast.duration_minutes} min</div>
                      {podcast.user_goal && (
                        <div className="mt-2 text-gray-700">
                          <span className="font-medium">Goal:</span> {podcast.user_goal}
                        </div>
                      )}
                      <div className="text-xs text-gray-400 mt-2">
                        Created {new Date(podcast.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {podcast.status === 'ready' && (
                      <button
                        onClick={() => navigate(`/study-set/${id}/podcasts/${podcast.id}`)}
                        className="px-3 py-1.5 border rounded hover:bg-gray-50"
                      >
                        Open
                      </button>
                    )}
                    <button
                      onClick={() => deletePodcast(podcast.id)}
                      className="px-3 py-1.5 border rounded text-red-600 hover:bg-red-50"
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
