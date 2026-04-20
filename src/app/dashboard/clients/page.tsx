'use client'
import { useEffect, useState } from 'react'

export default function ClientsPage() {
  const [clients, setClients] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/clients').then(r => r.json()).then(data => {
      setClients(Array.isArray(data) ? data : [])
      setLoading(false)
    })
  }, [])

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Clients</h1>
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-gray-400">Loading...</div>
        ) : clients.length === 0 ? (
          <div className="py-12 text-center text-gray-400">No clients yet — they'll appear automatically when work orders come in.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-5 py-3 text-gray-500 font-medium">Name</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Email</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Phone</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Type</th>
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
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
