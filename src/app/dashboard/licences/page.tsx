'use client'
import { useEffect, useState } from 'react'

function getStatus(item: any): { label: string; colour: string; daysLeft: number } {
  if (item.no_expiry) return { label: 'No Expiry', colour: 'bg-blue-100 text-blue-800', daysLeft: 9999 }
  if (!item.expiry_date) return { label: 'No Date', colour: 'bg-gray-100 text-gray-600', daysLeft: 9999 }
  const now = new Date(); now.setHours(0, 0, 0, 0)
  const exp = new Date(item.expiry_date)
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
  const [uploading, setUploading] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState('licence')
  const [licNum, setLicNum] = useState('')
  const [issueDate, setIssueDate] = useState('')
  const [expiry, setExpiry] = useState('')
  const [noExpiry, setNoExpiry] = useState(false)
  const [imageUrl, setImageUrl] = useState('')
  const [notes, setNotes] = useState('')
  const [viewImage, setViewImage] = useState<string | null>(null)

  const load = () => { fetch('/api/licences').then(r => r.json()).then(d => { setItems(Array.isArray(d) ? d : []); setLoading(false) }) }
  useEffect(() => { load() }, [])

  const clearForm = () => {
    setName(''); setType('licence'); setLicNum(''); setIssueDate(''); setExpiry('')
    setNoExpiry(false); setImageUrl(''); setNotes(''); setShowAdd(false); setEditId(null)
  }

  const startEdit = (item: any) => {
    setEditId(item.id); setName(item.name); setType(item.type || 'licence')
    setLicNum(item.licence_number || ''); setIssueDate(item.issue_date?.split('T')[0] || '')
    setExpiry(item.expiry_date?.split('T')[0] || ''); setNoExpiry(item.no_expiry || false)
    setImageUrl(item.image_url || ''); setNotes(item.notes || ''); setShowAdd(false)
  }

  const uploadImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (data.url) setImageUrl(data.url)
      if (data.error) console.error('Upload error:', data.error)
    } catch {}
    setUploading(false)
  }

  const save = async () => {
    if (!name) return
    if (!noExpiry && !expiry) return
    setSaving(true)
    const payload: any = { name, type, licence_number: licNum, issue_date: issueDate || null, expiry_date: noExpiry ? null : (expiry || null), no_expiry: noExpiry, image_url: imageUrl || null, notes: notes || null }
    if (editId) payload.id = editId
    const res = await fetch('/api/licences', { method: editId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const result = await res.json()
    console.log('Save result:', result)
    clearForm(); setSaving(false); load()
  }

  const remove = async (id: number, n: string) => {
    if (!confirm('Delete "' + n + '"?')) return
    await fetch('/api/licences?id=' + id, { method: 'DELETE' }); load()
  }

  const withExpiry = items.filter(i => !i.no_expiry && i.expiry_date)
  const inDate = withExpiry.filter(i => getStatus(i).daysLeft >= 0).length
  const expired = withExpiry.filter(i => getStatus(i).daysLeft < 0).length
  const noExp = items.filter(i => i.no_expiry).length
  const isEditing = showAdd || editId !== null

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Licences & Insurance</h1>
        <button onClick={() => { setEditId(null); setName(''); setType('licence'); setLicNum(''); setIssueDate(''); setExpiry(''); setNoExpiry(false); setImageUrl(''); setNotes(''); setShowAdd(true) }}
          className="bg-[#1a1a1a] text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-800">+ Add</button>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3">
          <div className="text-2xl font-bold text-green-800">{inDate}</div>
          <div className="text-xs text-green-600">In Date</div>
        </div>
        <div className={'border rounded-xl px-4 py-3 ' + (expired > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200')}>
          <div className={'text-2xl font-bold ' + (expired > 0 ? 'text-red-800' : 'text-gray-400')}>{expired}</div>
          <div className={'text-xs ' + (expired > 0 ? 'text-red-600' : 'text-gray-400')}>Expired</div>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
          <div className="text-2xl font-bold text-blue-800">{noExp}</div>
          <div className="text-xs text-blue-600">No Expiry</div>
        </div>
      </div>

      {isEditing && (
        <div className={'bg-white rounded-2xl border p-5 mb-5 ' + (editId ? 'border-blue-200' : 'border-gray-100')}>
          <h3 className="font-semibold text-gray-900 mb-4">{editId ? 'Edit' : 'Add new'}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <div><label className="block text-xs text-gray-500 mb-1">Name *</label>
              <input value={name} onChange={e => setName(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400" placeholder="e.g. Electrical Licence, Public Liability" /></div>
            <div><label className="block text-xs text-gray-500 mb-1">Type</label>
              <select value={type} onChange={e => setType(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none bg-white">
                <option value="licence">Licence</option><option value="insurance">Insurance</option><option value="registration">Registration</option><option value="certificate">Certificate</option><option value="other">Other</option>
              </select></div>
            <div><label className="block text-xs text-gray-500 mb-1">Licence/Policy Number</label>
              <input value={licNum} onChange={e => setLicNum(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400" placeholder="e.g. A65280" /></div>
            <div><label className="block text-xs text-gray-500 mb-1">Issue Date</label>
              <input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400" /></div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs text-gray-500">Expiry Date</label>
                <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                  <input type="checkbox" checked={noExpiry} onChange={e => setNoExpiry(e.target.checked)} className="rounded" />
                  N/A - Does not expire
                </label>
              </div>
              {!noExpiry && (
                <input type="date" value={expiry} onChange={e => setExpiry(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400" />
              )}
              {noExpiry && <div className="w-full border border-gray-100 rounded-lg px-3 py-2 text-sm text-gray-400 bg-gray-50">No expiry date</div>}
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Upload Image</label>
              <div className="flex items-center gap-2">
                <label className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-500 cursor-pointer hover:bg-gray-50 text-center">
                  {uploading ? 'Uploading...' : imageUrl ? 'Change image' : 'Choose file...'}
                  <input type="file" accept="image/*,.pdf,application/pdf" onChange={uploadImage} className="hidden" />
                </label>
                {imageUrl && (
                  <button onClick={() => setViewImage(imageUrl)} className="text-xs text-blue-600 hover:text-blue-800 px-2 py-2 border border-blue-200 rounded-lg">View</button>
                )}
              </div>
              {imageUrl && <div className="text-xs text-green-600 mt-1">{imageUrl.toLowerCase().endsWith('.pdf') ? 'PDF' : 'Image'} attached</div>}
            </div>
            <div className="sm:col-span-2"><label className="block text-xs text-gray-500 mb-1">Notes</label>
              <input value={notes} onChange={e => setNotes(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400" placeholder="Optional notes" /></div>
          </div>
          <div className="flex gap-3">
            <button onClick={save} disabled={saving || !name || (!noExpiry && !expiry)} className="bg-[#1a1a1a] text-white px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-40">{saving ? 'Saving...' : editId ? 'Save' : 'Add'}</button>
            <button onClick={clearForm} className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600">Cancel</button>
          </div>
        </div>
      )}

      {/* Image viewer modal */}
      {viewImage && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setViewImage(null)}>
          <div className="bg-white rounded-2xl max-w-3xl max-h-[90vh] overflow-auto p-2" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-2 mb-2">
              <span className="text-sm font-medium text-gray-700">Document Preview</span>
              <button onClick={() => setViewImage(null)} className="text-gray-400 hover:text-gray-700 text-xl">&#10005;</button>
            </div>
            {viewImage.includes('.pdf') || viewImage.includes('drive.google.com') ? (
              <iframe src={viewImage} className="w-full" style={{height: '80vh', minWidth: '600px'}} />
            ) : (
              <img src={viewImage} alt="Document" className="max-w-full rounded-lg" />
            )}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {loading ? <div className="py-12 text-center text-gray-400">Loading...</div> : items.length === 0 ? (
          <div className="py-12 text-center text-gray-400">No licences or insurance added yet.</div>
        ) : (
          <div className="overflow-x-auto"><table className="w-full min-w-[750px] text-sm">
            <thead className="bg-gray-50 border-b border-gray-100"><tr>
              <th className="text-left px-4 py-3 text-gray-500 font-medium w-8"></th>
              <th className="text-left px-4 py-3 text-gray-500 font-medium">Name</th>
              <th className="text-left px-3 py-3 text-gray-500 font-medium">Type</th>
              <th className="text-left px-3 py-3 text-gray-500 font-medium">Number</th>
              <th className="text-left px-3 py-3 text-gray-500 font-medium">Issued</th>
              <th className="text-left px-3 py-3 text-gray-500 font-medium">Expiry</th>
              <th className="text-left px-3 py-3 text-gray-500 font-medium">Status</th>
              <th className="px-3 py-3"></th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {items.map(item => { const s = getStatus(item); return (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    {item.image_url ? (
                      <button onClick={() => setViewImage(item.image_url)} className="w-8 h-8 rounded-lg bg-blue-50 overflow-hidden hover:ring-2 ring-blue-300 flex items-center justify-center">
                        <span className="text-blue-600 text-xs font-bold">View</span>
                      </button>
                    ) : (
                      <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center text-gray-300 text-xs">—</div>
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900">{item.name}</td>
                  <td className="px-3 py-3 text-gray-600 capitalize">{item.type}</td>
                  <td className="px-3 py-3 text-gray-600 font-mono text-xs">{item.licence_number || '—'}</td>
                  <td className="px-3 py-3 text-gray-600">{item.issue_date ? new Date(item.issue_date).toLocaleDateString('en-AU') : '—'}</td>
                  <td className="px-3 py-3 text-gray-600">{item.no_expiry ? 'N/A' : item.expiry_date ? new Date(item.expiry_date).toLocaleDateString('en-AU') : '—'}</td>
                  <td className="px-3 py-3"><span className={'text-xs px-2 py-1 rounded-full font-medium ' + s.colour}>{s.label}{!item.no_expiry && s.daysLeft >= 0 && s.daysLeft <= 30 ? ' (' + s.daysLeft + 'd)' : ''}</span></td>
                  <td className="px-3 py-3"><div className="flex gap-2">
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
