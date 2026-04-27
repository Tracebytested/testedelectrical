'use client'
import { useEffect, useState } from 'react'

const statusColour: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  sent: 'bg-blue-100 text-blue-800',
  accepted: 'bg-green-100 text-green-800',
  declined: 'bg-red-100 text-red-800',
  expired: 'bg-gray-100 text-gray-500',
}

export default function QuotesPage() {
  const [quotes, setQuotes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState<number | null>(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    fetch('/api/quotes').then(r => r.json()).then(data => {
      setQuotes(Array.isArray(data) ? data : [])
      setLoading(false)
    })
  }, [])

  const sendQuote = async (id: number) => {
    setSending(id)
    try {
      const res = await fetch('/api/quotes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quote_id: id })
      })
      const data = await res.json()
      if (data.success) {
        setMessage(`✅ Quote ${data.quote_number} sent!`)
        setQuotes(prev => prev.map(q => q.id === id ? { ...q, status: 'sent' } : q))
      }
    } catch {
      setMessage('Error sending quote')
    }
    setSending(null)
  }

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Quotes</h1>
        <a href="/dashboard/quotes/new" className="bg-[#1a1a1a] text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-800">+ New quote</a>
      </div>
      </div>

      {message && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-800 rounded-xl px-4 py-3 text-sm">
          {message}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-gray-400">Loading...</div>
        ) : quotes.length === 0 ? (
          <div className="py-12 text-center text-gray-400">No quotes yet. Generate one from a job.</div>
        ) : (
          <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-5 py-3 text-gray-500 font-medium">Quote</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Client</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Job</th>
                <th className="text-right px-4 py-3 text-gray-500 font-medium">Total</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Status</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {quotes.map(q => (
                <tr key={q.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3.5">
                    <div className="font-medium text-gray-900">{q.quote_number}</div>
                    <div className="text-xs text-gray-400">{new Date(q.created_at).toLocaleDateString('en-AU')}</div>
                  </td>
                  <td className="px-4 py-3.5 text-gray-600">{q.client_name}</td>
                  <td className="px-4 py-3.5 text-gray-500 truncate max-w-[160px]">{q.job_title}</td>
                  <td className="px-4 py-3.5 text-right font-semibold text-gray-900">
                    ${parseFloat(q.total).toFixed(2)}
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColour[q.status] || 'bg-gray-100 text-gray-700'}`}>
                      {q.status}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex gap-2">
                      <a href={`/api/pdf?type=quote&id=${q.id}`} target="_blank" rel="noopener noreferrer"
                        className="text-xs bg-[#1a1a1a] text-white px-3 py-1.5 rounded-lg hover:bg-gray-800">
                        View
                      </a>
                      {q.status === 'draft' && (
                        <button
                          onClick={() => sendQuote(q.id)}
                          disabled={sending === q.id}
                          className="text-xs bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-40"
                        >
                          {sending === q.id ? 'Sending...' : 'Send'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>
    </div>
  )
}
