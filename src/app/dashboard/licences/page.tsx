'use client'
import { useEffect, useState } from 'react'

function getStatus(expiry: string): { label: string; colour: string; daysLeft: number } {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const exp = new Date(expiry)
  const diff = Math.ceil((exp.getTime() - now.getTime()) / 86400000)
  if (diff < 0) return { label: 'Expired', colour: 'bg-red-100 text-red-800', daysLeft: diff }
  if (diff <= 7) return { label: 'Expiring this week', colour: 'bg-orange-100 text-orange-800', daysLeft: diff }
  if (diff <= 30) return { label: 'Expiring soon', colour: 'bg-amber-100 text-amber-800', daysLeft: diff }
  return { label: 'In Date', colour: 'bg-green-100 text-green-800', daysLeft: diff }
}

export default function LicencesPage() {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<any | null>(null)
  const [saving, setSaving] = useState(false)
  const emptyForm = { name: '', type: 'licence', licence_number: '', expiry_date: '', notes: '' }
  const [form, setForm] = useState(emptyForm)

  const load = () => {
    fetch('/api/licences').then(r => r.json()).then(d => { setItems(Array.isArray(d) ? d : []); setLoading(false) })
  }
  useEffect(() => { load() }, [])

  const save = async (isEdit: boolean) => {
    if (!form.name || !form.expiry_date) return
    setSaving(true)
    const method = isEdit ? 'PUT' : 'POST'
    const payload = isEdit ? { ...form, id: editing.id } : form
    await fetch('/api/licences', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    setForm(emptyForm); setShowAdd(false); setEditing(null); setSaving(false); load()
  }

  const remove = async (id: number, name: string) => {
    if (!confirm('Delete "' + name + '"?')) return
    await fetch('/api/licences?id=' + id, { method: 'DELETE' }); load()
  }

  const inDate = items.filter(i => getStatus(i.expiry_date).daysLeft >= 0).length
  const expired = items.filter(i => getStatus(i.expiry_date).daysLeft < 0).length

  const FormFields = ({ values, onChange }: { values: any; onChange: (f: any) => void }) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
      <div>
        <label className="block text-xs text-gray-500 mb-1">Name *</label>
        <input value={values.name} onChange={e => onChange({ ...values, name: e.target.value })}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400"
          placeholder="e.g. Electrical Licence, Public Liability Insurance" />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Type</label>
        <select value={values.type} onChange={e => onChange({ ...values, type: e.target.value })}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none bg-white">
          <option value="licence">Licence</option>
          <option value="insurance">Insurance</option>
          <option value="registration">Registration</option>
          <option value="certificate">Certificate</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Licence/Policy Number</label>
        <input value={values.licence_number} onChange={e => onChange({ ...values, licence_number: e.target.value })}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400"
          placeholder="e.g. A65280" />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Expiry Date *</label>
        <input type="date" value={values.expiry_date ? values.expiry_date.split('T')[0] : ''} onChange={e => onChange({ ...values, expiry_date: e.target.value })}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400" />
      </div>
      <div className="sm:col-span-2">
        <label className="block text-xs text-gray-500 mb-1">Notes</label>
        <input value={values.notes || ''} onChange={e => onChange({ ...values, notes: e.target.value })}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400"
          placeholder="Optional notes" />
      </div>
    </div>
  )

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Licences & Insurance</h1>
        <button onClick={() => { setShowAdd(!showAdd); setEditing(null) }}
          className="bg-[#1a1a1a] text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-800">
          + Add
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3">
          <div className="text-2xl font-bold text-green-800">{inDate}</div>
          <div className="text-xs text-green-600">In Date</div>
        </div>
        <div className={'border rounded-xl px-4 py-3 ' + (expired > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200')}>
          <div className={'text-2xl font-bold ' + (expired > 0 ? 'text-red-800' : 'text-gray-400')}>{expired}</div>
          <div className={'text-xs ' + (expired > 0 ? 'text-red-600' : 'text-gray-400')}>Expired</div>
        </div>
      </div>

      {showAdd && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-5">
          <h3 className="font-semibold text-gray-900 mb-4">Add new</h3>
          <FormFields values={form} onChange={setForm} />
          <div className="flex gap-3">
            <button onClick={() => save(false)} disabled={saving || !form.name || !form.expiry_date}
              className="bg-[#1a1a1a] text-white px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-40">
              {saving ? 'Saving...' : 'Add'}
            </button>
            <button onClick={() => { setShowAdd(false); setForm(emptyForm) }}
              className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600">Cancel</button>
          </div>
        </div>
      )}

      {editing && (
        <div className="bg-white rounded-2xl border border-blue-200 p-5 mb-5">
          <h3 className="font-semibold text-gray-900 mb-4">Edit — {editing.name}</h3>
          <FormFields values={form} onChange={setForm} />
          <div className="flex gap-3">
            <button onClick={() => save(true)} disabled={saving}
              className="bg-[#1a1a1a] text-white px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-40">
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button onClick={() => { setEditing(null); setForm(emptyForm) }}
              className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600">Cancel</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {loading ? <div className="py-12 text-center text-gray-400">Loading...</div> : items.length === 0 ? (
          <div className="py-12 text-center text-gray-400">No licences or insurance added yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-5 py-3 text-gray-500 font-medium">Name</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">Type</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">Number</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">Expiry</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {items.map(item => {
                  const status = getStatus(item.expiry_date)
                  return (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3.5 font-medium text-gray-900">{item.name}</td>
                      <td className="px-4 py-3.5 text-gray-600 capitalize">{item.type}</td>
                      <td className="px-4 py-3.5 text-gray-600 font-mono text-xs">{item.licence_number || '—'}</td>
                      <td className="px-4 py-3.5 text-gray-600">{new Date(item.expiry_date).toLocaleDateString('en-AU')}</td>
                      <td className="px-4 py-3.5">
                        <span className={'text-xs px-2 py-1 rounded-full font-medium ' + status.colour}>
                          {status.label}
                          {status.daysLeft >= 0 && status.daysLeft <= 30 ? ' (' + status.daysLeft + 'd)' : ''}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex gap-2">
                          <button onClick={() => { setEditing(item); setForm({ ...item, expiry_date: item.expiry_date.split('T')[0] }); setShowAdd(false) }}
                            className="text-xs text-blue-500 hover:text-blue-700 px-2 py-1 rounded-lg">Edit</button>
                          <button onClick={() => remove(item.id, item.name)}
                            className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded-lg">Delete</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
