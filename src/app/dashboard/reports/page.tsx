'use client'
import { useEffect, useState } from 'react'

export default function ReportsPage() {
  const [reports, setReports] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState<number | null>(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    fetch('/api/reports').then(r => r.json()).then(data => {
      setReports(Array.isArray(data) ? data : [])
      setLoading(false)
    })
  }, [])

  const sendReport = async (id: number) => {
    setSending(id)
    try {
      const res = await fetch('/api/reports', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report_id: id })
      })
      const data = await res.json()
      if (data.success) {
        setMessage(`✅ Report ${data.report_number} sent!`)
        setReports(prev => prev.map(r => r.id === id ? { ...r, status: 'sent' } : r))
      }
    } catch {
      setMessage('Error sending report')
    }
    setSending(null)
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
      </div>

      {message && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-800 rounded-xl px-4 py-3 text-sm">
          {message}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-gray-400">Loading...</div>
        ) : reports.length === 0 ? (
          <div className="py-12 text-center text-gray-400">No reports yet. Complete a job to generate one.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-5 py-3 text-gray-500 font-medium">Report</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Client</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Title</th>
                <th className="text-right px-4 py-3 text-gray-500 font-medium">Price ex GST</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Status</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {reports.map(r => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3.5">
                    <div className="font-medium text-gray-900">{r.report_number}</div>
                    <div className="text-xs text-gray-400">{new Date(r.created_at).toLocaleDateString('en-AU')}</div>
                  </td>
                  <td className="px-4 py-3.5 text-gray-600">{r.client_name}</td>
                  <td className="px-4 py-3.5 text-gray-700 truncate max-w-[200px]">{r.title}</td>
                  <td className="px-4 py-3.5 text-right font-medium text-gray-900">
                    {r.price_ex_gst > 0 ? `$${parseFloat(r.price_ex_gst).toFixed(2)}` : '—'}
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                      r.status === 'sent' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'
                    }`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex gap-2">
                      <a href={`/api/pdf?type=report&id=${r.id}`} target="_blank" rel="noopener noreferrer"
                        className="text-xs bg-[#1a1a1a] text-white px-3 py-1.5 rounded-lg hover:bg-gray-800">
                        View
                      </a>
                      {r.status === 'draft' && (
                        <button
                          onClick={() => sendReport(r.id)}
                          disabled={sending === r.id}
                          className="text-xs bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-40"
                        >
                          {sending === r.id ? 'Sending...' : 'Send'}
                        </button>
                      )}
                      {r.status === 'sent' && (
                        <button
                          onClick={() => sendReport(r.id)}
                          disabled={sending === r.id}
                          className="text-xs bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-40"
                        >
                          {sending === r.id ? 'Sending...' : 'Resend'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
