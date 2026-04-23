'use client'
import { useEffect, useState } from 'react'

export default function ClientsPage() {
  const [clients, setClients] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [message, setMessage] = useState('')
  const [form, setForm] = useState({ name: '', email: '', phone: '', company: '', is_agency: false })

  const load = () => {
    fetch('/api/clients').then(r => r.json()).then(data => {
      setClients(Array.isArray(data) ? data : [])
      setLoading(false)
    })
  }

  useEffect(() => { load() }, [])

  const deleteClient = async (id: number, name: string) => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return
    setDeleting(id)
    try {
      await fetch(`/api/clients?id=${id}`, { method: 'DELETE' })
      setClients(prev => prev.filter(c => c.id !== id))
    } catch {
      setMessage('Error deleting client')
    }
    setDeleting(null)
  }

  const addClient = async () => {
    if (!form.name.trim()) return
    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      })
      const data = await res.json()
      setClients(prev => [data, ...prev])
      setForm({ name: '', email: '', phone: '', company: '', is_agency: false })
      setShowAdd(false)
      setMessage('✅ Client added')
    } catch {
      setMessage('Error adding client')
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="bg-[#1a1a1a] text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-800"
        >
          + Add client
        </button>
      </div>

      {message && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-800 rounded-xl px-4 py-3 text-sm">
          {message}
        </div>
      )}

      {showAdd && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-5">
          <h3 className="font-semibold text-gray-900 mb-4">Add new client</h3>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Name *</label>
              <input value={form.name} onChange={e => setForm({...form, name: e.target.value})}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400"
                placeholder="Client or company name" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Email</label>
              <input value={form.email} onChange={e => setForm({...form, email: e.target.value})}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400"
                placeholder="email@example.com" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Phone</label>
              <input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400"
                placeholder="04XX XXX XXX" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Company</label>
              <input value={form.company} onChange={e => setForm({...form, company: e.target.value})}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400"
                placeholder="Company name" />
            </div>
          </div>
          <div className="flex items-center gap-3 mb-4">
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input type="checkbox" checked={form.is_agency} onChange={e => setForm({...form, is_agency: e.target.checked})}
                className="rounded" />
              This is an agency / property manager
            </label>
          </div>
          <div className="flex gap-3">
            <button onClick={addClient}
              className="bg-[#1a1a1a] text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-gray-800">
              Add client
            </button>
            <button onClick={() => setShowAdd(false)}
              className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-gray-400">Loading...</div>
        ) : clients.length === 0 ? (
          <div className="py-12 text-center text-gray-400">No clients yet — they appear automatically when work orders come in.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-5 py-3 text-gray-500 font-medium">Name</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Email</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Phone</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Type</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {clients.map(c => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3.5 font-medium text-gray-900">{c.name}</td>
                  <td className="px-4 py-3.5 text-gray-600">{c.email || '—'}</td>
                  <td className="px-4 py-3.5 text-gray-600">{c.phone || '—'}</td>
                  <td className="px-4 py-3.5">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${c.is_agency ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-700'}`}>
                      {c.is_agency ? 'Agency' : 'Client'}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <button
                      onClick={() => deleteClient(c.id, c.name)}
                      disabled={deleting === c.id}
                      className="text-xs text-red-400 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded-lg transition-colors disabled:opacity-40"
                    >
                      {deleting === c.id ? '...' : 'Delete'}
                    </button>
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
