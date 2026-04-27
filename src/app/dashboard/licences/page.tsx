'use client'
import { useEffect, useState } from 'react'

function getStatus(expiry: string): { label: string; colour: string; daysLeft: number } {
  const now = new Date(); now.setHours(0, 0, 0, 0)
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
  const [editId, setEditId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState('licence')
  const [licNum, setLicNum] = useState('')
  const [expiry, setExpiry] = useState('')
  const [notes, setNotes] = useState('')

  const load = () => { fetch('/api/licences').then(r => r.json()).then(d => { setItems(Array.isArray(d) ? d : []); setLoading(false) }) }
  useEffect(() => { load() }, [])

  const clearForm = () => { setName(''); setType('licence'); setLicNum(''); setExpiry(''); setNotes(''); setShowAdd(false); setEditId(null) }

  const startEdit = (item: any) => {
    setEditId(item.id); setName(item.name); setType(item.type || 'licence')
    setLicNum(item.licence_number || ''); setExpiry(item.expiry_date?.split('T')[0] || ''); setNotes(item.notes || ''); setShowAdd(false)
  }

  const save = async () => {
    if (!name || !expiry) return
    setSaving(true)
    const payload = { name, type, licence_number: licNum, expiry_date: expiry, notes, id: editId }
    await fetch('/api/licences', { method: editId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    clearForm(); setSaving(false); load()
  }

  const remove = async (id: number, n: string) => {
    if (!confirm('Delete "' + n + '"?')) return
    await fetch('/api/licences?id=' + id, { method: 'DELETE' }); load()
  }

  const inDate = items.filter(i => getStatus(i.expiry_date).daysLeft >= 0).length
  const expired = items.filter(i => getStatus(i.expiry_date).daysLeft < 0).length
  const isEditing = showAdd || editId !== null

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Licences & Insurance</h1>
        <button onClick={() => { setShowAdd(true); setEditId(null); setName(''); setType('licence'); setLicNum(''); setExpiry(''); setNotes('') }}
          className="bg-[#1a1a1a] text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-800">+ Add</button>
      </div>

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

      {isEditing && (
        <div className={'bg-white rounded-2xl border p-5 mb-5 ' + (editId ? 'border-blue-200' : 'border-gray-100')}>
          <h3 className="font-semibold text-gray-900 mb-4">{editId ? 'Edit' : 'Add new'}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <div><label className="block text-xs text-gray-500 mb-1">Name *</label>
              <input value={name} onChange={e => setName(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400" placeholder="e.g. Electrical Licence" /></div>
            <div><label className="block text-xs text-gray-500 mb-1">Type</label>
              <select value={type} onChange={e => setType(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none bg-white">
                <option value="licence">Licence</option><option value="insurance">Insurance</option><option value="registration">Registration</option><option value="certificate">Certificate</option><option value="other">Other</option>
              </select></div>
            <div><label className="block text-xs text-gray-500 mb-1">Number</label>
              <input value={licNum} onChange={e => setLicNum(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400" placeholder="e.g. A65280" /></div>
            <div><label className="block text-xs text-gray-500 mb-1">Expiry Date *</label>
              <input type="date" value={expiry} onChange={e => setExpiry(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400" /></div>
            <div className="sm:col-span-2"><label className="block text-xs text-gray-500 mb-1">Notes</label>
              <input value={notes} onChange={e => setNotes(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400" placeholder="Optional" /></div>
          </div>
          <div className="flex gap-3">
            <button onClick={save} disabled={saving || !name || !expiry} className="bg-[#1a1a1a] text-white px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-40">{saving ? 'Saving...' : editId ? 'Save' : 'Add'}</button>
            <button onClick={clearForm} className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600">Cancel</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {loading ? <div className="py-12 text-center text-gray-400">Loading...</div> : items.length === 0 ? (
          <div className="py-12 text-center text-gray-400">No licences or insurance added yet.</div>
        ) : (
          <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
            <thead className="bg-gray-50 border-b border-gray-100"><tr>
              <th className="text-left px-5 py-3 text-gray-500 font-medium">Name</th>
              <th className="text-left px-4 py-3 text-gray-500 font-medium">Type</th>
              <th className="text-left px-4 py-3 text-gray-500 font-medium">Number</th>
              <th className="text-left px-4 py-3 text-gray-500 font-medium">Expiry</th>
              <th className="text-left px-4 py-3 text-gray-500 font-medium">Status</th>
              <th className="px-4 py-3"></th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {items.map(item => { const s = getStatus(item.expiry_date); return (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3.5 font-medium text-gray-900">{item.name}</td>
                  <td className="px-4 py-3.5 text-gray-600 capitalize">{item.type}</td>
                  <td className="px-4 py-3.5 text-gray-600 font-mono text-xs">{item.licence_number || '—'}</td>
                  <td className="px-4 py-3.5 text-gray-600">{new Date(item.expiry_date).toLocaleDateString('en-AU')}</td>
                  <td className="px-4 py-3.5"><span className={'text-xs px-2 py-1 rounded-full font-medium ' + s.colour}>{s.label}{s.daysLeft >= 0 && s.daysLeft <= 30 ? ' (' + s.daysLeft + 'd)' : ''}</span></td>
                  <td className="px-4 py-3.5"><div className="flex gap-2">
                    <button onClick={() => startEdit(item)} className="text-xs text-blue-500 hover:text-blue-700 px-2 py-1 rounded-lg">Edit</button>
                    <button onClick={() => remove(item.id, item.name)} className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded-lg">Delete</button>
                  </div></td>
                </tr>
              )})}
            </tbody>
          </table></div>
        )}
      </div>
    </div>
  )
}
