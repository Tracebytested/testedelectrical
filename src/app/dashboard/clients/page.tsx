'use client'
import { useEffect, useState } from 'react'

export default function ClientsPage() {
  const [clients, setClients] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [editing, setEditing] = useState<any | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const emptyForm = { name: '', company: '', email: '', phone: '', is_agency: false }
  const [form, setForm] = useState(emptyForm)

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
    await fetch(`/api/clients?id=${id}`, { method: 'DELETE' })
    setClients(prev => prev.filter(c => c.id !== id))
    setDeleting(null)
  }

  const addClient = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    const res = await fetch('/api/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    })
    const data = await res.json()
    setClients(prev => [data, ...prev])
    setForm(emptyForm)
    setShowAdd(false)
    setMessage('✅ Client added')
    setSaving(false)
  }

  const saveEdit = async () => {
    if (!editing) return
    setSaving(true)
    await fetch('/api/clients', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editing)
    })
    setClients(prev => prev.map(c => c.id === editing.id ? editing : c))
    setEditing(null)
    setMessage('✅ Client updated')
    setSaving(false)
  }

  const formFields = [
    { label: 'Name *', key: 'name', placeholder: 'e.g. Pivotal Property Management' },
    { label: 'Company', key: 'company', placeholder: 'e.g. Pivotal Pty Ltd' },
    { label: 'Email', key: 'email', placeholder: 'email@example.com' },
    { label: 'Phone', key: 'phone', placeholder: '04XX XXX XXX' },
  ]

  const renderFormFields = (values: any, onChange: (f: any) => void) => (
    <div className="grid grid-cols-2 gap-3 mb-3">
      {formFields.map(f => (
        <div key={f.key}>
          <label className="block text-xs text-gray-500 mb-1">{f.label}</label>
          <input value={values[f.key] || ''} onChange={e => onChange({...values, [f.key]: e.target.value})}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400"
            placeholder={f.placeholder} />
        </div>
      ))}
      <div className="col-span-2">
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input type="checkbox" checked={values.is_agency || false} onChange={e => onChange({...values, is_agency: e.target.checked})} className="rounded" />
          This is an agency / property manager
        </label>
      </div>
    </div>
  )

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
        <button onClick={() => { setShowAdd(!showAdd); setEditing(null) }}
          className="bg-[#1a1a1a] text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-800">
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
          {renderFormFields(form, setForm)}
          <div className="flex gap-3">
            <button onClick={addClient} disabled={saving || !form.name.trim()}
              className="bg-[#1a1a1a] text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-gray-800 disabled:opacity-40">
              {saving ? 'Saving...' : 'Add client'}
            </button>
            <button onClick={() => { setShowAdd(false); setForm(emptyForm) }}
              className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </div>
      )}

      {editing && (
        <div className="bg-white rounded-2xl border border-blue-200 p-5 mb-5">
          <h3 className="font-semibold text-gray-900 mb-4">Edit — {editing.name}</h3>
          {renderFormFields(editing, setEditing)}
          <div className="flex gap-3">
            <button onClick={saveEdit} disabled={saving}
              className="bg-[#1a1a1a] text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-gray-800 disabled:opacity-40">
              {saving ? 'Saving...' : 'Save changes'}
            </button>
            <button onClick={() => setEditing(null)}
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
          <div className="py-12 text-center text-gray-400">No clients yet.</div>
        ) : (
          <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-5 py-3 text-gray-500 font-medium">Name</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Company</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Email</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Phone</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Type</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {clients.map(c => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3.5 font-medium text-gray-900">{c.name}</td>
                  <td className="px-4 py-3.5 text-gray-600">{c.company || '—'}</td>
                  <td className="px-4 py-3.5 text-gray-600">{c.email || '—'}</td>
                  <td className="px-4 py-3.5 text-gray-600">{c.phone || '—'}</td>
                  <td className="px-4 py-3.5">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${c.is_agency ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-700'}`}>
                      {c.is_agency ? 'Agency' : 'Client'}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex gap-2">
                      <button onClick={() => { setEditing({...c}); setShowAdd(false) }}
                        className="text-xs text-blue-500 hover:text-blue-700 hover:bg-blue-50 px-2 py-1 rounded-lg transition-colors">
                        Edit
                      </button>
                      <button onClick={() => deleteClient(c.id, c.name)} disabled={deleting === c.id}
                        className="text-xs text-red-400 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded-lg transition-colors disabled:opacity-40">
                        {deleting === c.id ? '...' : 'Delete'}
                      </button>
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
