'use client'
import { useEffect, useState } from 'react'

const statusColour: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  sent: 'bg-blue-100 text-blue-800',
  paid: 'bg-green-100 text-green-800',
  overdue: 'bg-red-100 text-red-800',
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState<number | null>(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    fetch('/api/invoices').then(r => r.json()).then(data => {
      setInvoices(Array.isArray(data) ? data : [])
      setLoading(false)
    })
  }, [])

  const sendInvoice = async (id: number) => {
    setSending(id)
    setMessage('')
    try {
      const res = await fetch('/api/invoices', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_id: id })
      })
      const data = await res.json()
      if (data.success) {
        setMessage(`✅ Invoice ${data.invoice_number} sent!`)
        setInvoices(prev => prev.map(inv => inv.id === id ? { ...inv, status: 'sent' } : inv))
      }
    } catch {
      setMessage('Error sending invoice')
    }
    setSending(null)
  }

  const markPaid = async (id: number) => {
    await fetch('/api/invoices', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: 'paid', paid_at: new Date() })
    })
    setInvoices(prev => prev.map(inv => inv.id === id ? { ...inv, status: 'paid' } : inv))
  }

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
        <a href="/dashboard/invoices/new"
          className="bg-[#1a1a1a] text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-800">
          + New invoice
        </a>
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
        ) : invoices.length === 0 ? (
          <div className="py-12 text-center text-gray-400">No invoices yet</div>
        ) : (
          <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-5 py-3 text-gray-500 font-medium">Invoice</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Client</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Job</th>
                <th className="text-right px-4 py-3 text-gray-500 font-medium">Total</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Status</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {invoices.map(inv => (
                <tr key={inv.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3.5">
                    <div className="font-medium text-gray-900">{inv.invoice_number}</div>
                    <div className="text-xs text-gray-400">{new Date(inv.created_at).toLocaleDateString('en-AU')}</div>
                  </td>
                  <td className="px-4 py-3.5 text-gray-600">{inv.client_name}</td>
                  <td className="px-4 py-3.5 text-gray-500 truncate max-w-[160px]">{inv.job_title}</td>
                  <td className="px-4 py-3.5 text-right font-semibold text-gray-900">
                    ${parseFloat(inv.total).toFixed(2)}
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColour[inv.status] || 'bg-gray-100 text-gray-700'}`}>
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex gap-2">
                      <a href={`/dashboard/invoices/${inv.id}/edit`}
                        className="text-xs bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-200">
                        Edit
                      </a>
                      <a href={`/api/pdf?type=invoice&id=${inv.id}`} target="_blank" rel="noopener noreferrer"
                        className="text-xs bg-[#1a1a1a] text-white px-3 py-1.5 rounded-lg hover:bg-gray-800">
                        View
                      </a>
                      {inv.status === 'draft' && (
                        <button
                          onClick={() => sendInvoice(inv.id)}
                          disabled={sending === inv.id}
                          className="text-xs bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-40"
                        >
                          {sending === inv.id ? 'Sending...' : 'Send'}
                        </button>
                      )}
                      {inv.status === 'sent' && (
                        <button
                          onClick={() => markPaid(inv.id)}
                          className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700"
                        >
                          Mark paid
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
