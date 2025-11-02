import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'

export default function Signup() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function onSubmit(e) {
    e.preventDefault()
    setMessage(''); setError('')
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) setError(error.message)
    else setMessage('Check your email to verify your account.')
  }

  return (
    <div className="max-w-md mx-auto p-6">
      <h1 className="text-xl font-semibold mb-4">Sign Up</h1>
      <form onSubmit={onSubmit} className="space-y-3">
        <input className="w-full border rounded px-3 py-2" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} />
        <input className="w-full border rounded px-3 py-2" placeholder="Password" type="password" value={password} onChange={e=>setPassword(e.target.value)} />
        {error && <div className="text-sm text-red-600">{error}</div>}
        {message && <div className="text-sm text-green-600">{message}</div>}
        <button className="w-full bg-indigo-600 text-white rounded px-3 py-2">Sign Up</button>
      </form>
      <div className="mt-3 text-sm">
        Already have an account? <Link to="/login" className="underline">Log in</Link>
      </div>
    </div>
  )
}

