'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Stats {
  jobs: { pending: string; active: string; completed: string; total: string }
  invoices: { outstanding: string; paid_this_month: string; overdue: string; sent: string }
  quotes: { draft: string; sent: string; accepted: string }
  recent_jobs: Array<{ id: number; job_number: string; title: string; status: string; client_name: string; site_address: string; created_at: string }>
  recent_emails: Array<{ id: number; from_address: string; subject: string; received_at: string }>
}

const statusColour: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  active: 'bg-blue-100 text-blue-800',
  completed: 'bg-purple-100 text-purple-800',
  invoiced: 'bg-green-100 text-green-800',
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [aiMsg, setAiMsg] = useState('')
  const [aiReply, setAiReply] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [polling, setPolling] = useState(false)
  const [pollResult, setPollResult] = useState('')
  const [error, setError] = useState('')

  const loadStats = () => {
    fetch('/api/dashboard?t=' + Date.now(), { cache: 'no-store' })
      .then(r => r.json())
      .then(data => {
        if (data.error) {
          setError(data.error)
        } else {
          setStats(data)
        }
      })
      .catch(e => setError(e.message))
  }

  useEffect(() => {
    loadStats()
    // Refresh every 30 seconds
    const interval = setInterval(loadStats, 30000)
    return () => clearInterval(interval)
  }, [])

  const pollEmail = async () => {
    setPolling(true)
    setPollResult('')
    try {
      const res = await fetch('/api/gmail', { method: 'POST' })
      const data = await res.json()
      if (data.processed?.length > 0) {
        setPollResult(`✅ ${data.processed.length} new work order${data.processed.length > 1 ? 's' : ''} created`)
        fetch('/api/dashboard').then(r => r.json()).then(setStats).catch(() => {})
      } else {
        setPollResult(data.error ? `Error: ${data.error}` : 'No new emails to process')
      }
    } catch (e: any) {
      setPollResult('Error checking emails — check Gmail credentials in variables')
    }
    setPolling(false)
  }

  const askAI = async () => {
    if (!aiMsg.trim()) return
    setAiLoading(true)
    setAiReply('')
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: aiMsg })
      })
      const data = await res.json()
      setAiReply(data.response || data.error || 'No response')
      setAiMsg('')
    } catch {
      setAiReply('Error — check Anthropic API key in variables')
    }
    setAiLoading(false)
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <button
          onClick={pollEmail}
          disabled={polling}
          className="bg-[#1a1a1a] text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50"
        >
          {polling ? 'Checking...' : '📬 Check Emails'}
        </button>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-800 rounded-xl px-4 py-3 text-sm">
          Database error: {error} — make sure DATABASE_URL is set in Railway variables
        </div>
      )}

      {pollResult && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-800 rounded-xl px-4 py-3 text-sm">
          {pollResult}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Active jobs" value={String(parseInt(stats?.jobs?.active || '0'))} sub="in progress" colour="blue" />
        <StatCard label="Pending jobs" value={String(parseInt(stats?.jobs?.pending || '0'))} sub="awaiting action" colour="amber" />
        <StatCard label="Outstanding" value={`$${parseFloat(stats?.invoices?.outstanding || '0').toFixed(0)}`} sub="invoices sent" colour="purple" />
        <StatCard label="Paid this month" value={`$${parseFloat(stats?.invoices?.paid_this_month || '0').toFixed(0)}`} sub="collected" colour="green" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Recent jobs</h2>
            <Link href="/dashboard/jobs" className="text-sm text-blue-600 hover:underline">View all</Link>
          </div>
          <div className="divide-y divide-gray-50">
            {!stats && !error && (
              <p className="text-gray-400 text-sm px-5 py-8 text-center">Loading...</p>
            )}
            {stats && (!stats.recent_jobs || stats.recent_jobs.length === 0) && (
              <p className="text-gray-400 text-sm px-5 py-8 text-center">No jobs yet. Click "Check Emails" to import work orders.</p>
            )}
            {stats?.recent_jobs?.map(job => (
              <Link
                key={job.id}
                href={`/dashboard/jobs/${job.id}`}
                className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-gray-900 truncate">{job.title}</div>
                  <div className="text-xs text-gray-500 mt-0.5 truncate">{job.client_name} · {job.site_address}</div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColour[job.status] || 'bg-gray-100 text-gray-700'}`}>
                    {job.status}
                  </span>
                  <span className="text-xs text-gray-400">{job.job_number}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <h3 className="font-semibold text-sm text-gray-900 mb-3">Quick summary</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Quotes sent</span>
                <span className="font-medium">{stats?.quotes?.sent || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Quotes accepted</span>
                <span className="font-medium text-green-700">{stats?.quotes?.accepted || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Overdue invoices</span>
                <span className={`font-medium ${parseInt(stats?.invoices?.overdue || '0') > 0 ? 'text-red-600' : 'text-gray-700'}`}>
                  {stats?.invoices?.overdue || 0}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Jobs completed</span>
                <span className="font-medium">{stats?.jobs?.completed || 0}</span>
              </div>
            </div>
          </div>

          <div className="bg-[#1a1a1a] rounded-2xl p-4">
            <h3 className="font-semibold text-sm text-[#F5C400] mb-3">⚡ Ask Beezy</h3>
            {aiReply && (
              <div className="bg-white/10 rounded-xl px-3 py-2.5 text-white/90 text-sm mb-3 leading-relaxed">
                {aiReply}
              </div>
            )}
            <textarea
              value={aiMsg}
              onChange={e => setAiMsg(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), askAI())}
              placeholder="Ask Beezy anything..."
              className="w-full bg-white/10 text-white placeholder-white/30 rounded-xl px-3 py-2.5 text-sm resize-none outline-none border border-white/10 focus:border-[#F5C400]/50"
              rows={3}
            />
            <button
              onClick={askAI}
              disabled={aiLoading || !aiMsg.trim()}
              className="mt-2 w-full bg-[#F5C400] text-[#1a1a1a] font-semibold rounded-xl py-2 text-sm hover:bg-yellow-400 transition-colors disabled:opacity-40"
            >
              {aiLoading ? 'Thinking...' : 'Ask'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, sub, colour }: { label: string; value: string; sub: string; colour: string }) {
  const colours: Record<string, string> = {
    blue: 'bg-blue-50 border-blue-100',
    amber: 'bg-amber-50 border-amber-100',
    purple: 'bg-purple-50 border-purple-100',
    green: 'bg-green-50 border-green-100',
  }
  const textColours: Record<string, string> = {
    blue: 'text-blue-900',
    amber: 'text-amber-900',
    purple: 'text-purple-900',
    green: 'text-green-900',
  }
  return (
    <div className={`rounded-2xl border p-4 ${colours[colour]}`}>
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${textColours[colour]}`}>{value}</div>
      <div className="text-xs text-gray-400 mt-0.5">{sub}</div>
    </div>
  )
}
