import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../hooks/useAuth'

export default function Dashboard() {
  const { user } = useAuth()
  const [sets, setSets] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    let mounted = true
    ;(async () => {
      const { data, error } = await supabase
        .from('study_sets')
        .select('id, title, subject_area, total_cards, updated_at')
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
      if (!mounted) return
      if (!error) setSets(data || [])
      setLoading(false)
    })()
    return () => { mounted = false }
  }, [user])

  if (loading) return <div className="p-6">Loading...</div>

  return (
    <div className="max-w-6xl mx-auto p-4">
      {sets.length === 0 ? (
        <div className="text-center py-16 border rounded">
          <div className="text-lg mb-3">Create your first study set</div>
          <Link to="/study-set/new" className="px-4 py-2 bg-indigo-600 text-white rounded">Create Study Set</Link>
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {sets.map(s => (
            <Link key={s.id} to={`/study-set/${s.id}`} className="border rounded p-4 hover:bg-gray-50">
              <div className="font-medium">{s.title}</div>
              <div className="text-sm text-gray-600">{s.subject_area || '—'}</div>
              <div className="text-sm mt-2">{s.total_cards} cards</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

