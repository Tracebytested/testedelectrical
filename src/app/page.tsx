'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    })
    if (res.ok) {
      router.push('/dashboard')
    } else {
      setError('Wrong password')
    }
  }

  return (
    <div className="min-h-screen bg-[#1a1a1a] flex items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-[#F5C400] font-bold text-4xl tracking-tight">TESTED</div>
          <div className="text-white/50 text-sm mt-1">Electrical & Communications Services</div>
        </div>
        <form onSubmit={handleLogin} className="bg-[#252525] rounded-2xl p-8 shadow-2xl">
          <h1 className="text-white font-semibold text-lg mb-6">Admin Dashboard</h1>
          <div className="mb-4">
            <label className="block text-white/50 text-sm mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-[#1a1a1a] text-white rounded-lg px-4 py-3 outline-none border border-white/10 focus:border-[#F5C400] transition-colors"
              placeholder="Enter your password"
              autoFocus
            />
          </div>
          {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
          <button
            type="submit"
            className="w-full bg-[#F5C400] text-[#1a1a1a] font-bold rounded-lg py-3 hover:bg-yellow-400 transition-colors"
          >
            Sign In
          </button>
        </form>
      </div>
    </div>
  )
}
