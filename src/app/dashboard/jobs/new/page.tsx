'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function NewJobPage() {
  const router = useRouter()
  const [clients, setClients] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    title: '',
    client_name: '',
    client_id: '',
    site_address: '',
    description: '',
    work_order_ref: '',
    scheduled_date: '',
    status: 'pending',
    source: 'manual'
  })

  useEffect(() => {
    fetch('/api/clients').then(r => r.json()).then(data => {
      setClients(Array.isArray(data) ? data : [])
    })
  }, [])

  const save = async () => {
    if (!form.title.trim()) return
    setSaving(true)
    try {
      const payload: any = { ...form }
      if (form.client_id) {
        payload.client_id = parseInt(form.client_id)
        delete payload.client_name
      } else {
        delete payload.client_id
      }
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const job = await res.json()
      router.push(`/dashboard/jobs/${job.id}`)
    } catch {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <button onClick={() => router.back()} className="text-sm text-gray-400 hover:text-gray-600 mb-4 flex items-center gap-1">
        ← Back
      </button>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">New Job</h1>

      <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">

        <div>
          <label className="block text-xs text-gray-500 mb-1">Job title *</label>
          <input value={form.title} onChange={e => setForm({...form, title: e.target.value})}
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-gray-400"
            placeholder="e.g. Switchboard upgrade, Fault finding, Safety inspection" />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Client</label>
          <select value={form.client_id} onChange={e => setForm({...form, client_id: e.target.value, client_name: ''})}
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-gray-400 bg-white">
            <option value="">Select existing client...</option>
            {clients.map(c => (
              <option key={c.id} value={c.id}>{c.name}{c.email ? ` — ${c.email}` : ''}</option>
            ))}
          </select>
          <div className="text-xs text-gray-400 mt-1 text-center">or</div>
          <input value={form.client_name} onChange={e => setForm({...form, client_name: e.target.value, client_id: ''})}
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-gray-400"
            placeholder="Type a new client name" />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Site address</label>
          <input value={form.site_address} onChange={e => setForm({...form, site_address: e.target.value})}
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-gray-400"
            placeholder="e.g. 58 Lavinia St, Greenvale VIC 3059" />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Work order / reference number</label>
          <input value={form.work_order_ref} onChange={e => setForm({...form, work_order_ref: e.target.value})}
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-gray-400"
            placeholder="e.g. WO-1234" />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Scheduled date</label>
          <input type="date" value={form.scheduled_date} onChange={e => setForm({...form, scheduled_date: e.target.value})}
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-gray-400" />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Description</label>
          <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})}
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-gray-400 resize-none"
            rows={4} placeholder="Details about the job..." />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Status</label>
          <select value={form.status} onChange={e => setForm({...form, status: e.target.value})}
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-gray-400 bg-white">
            <option value="pending">Pending</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
          </select>
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={save} disabled={saving || !form.title.trim()}
            className="flex-1 bg-[#1a1a1a] text-white rounded-xl py-3 text-sm font-semibold hover:bg-gray-800 disabled:opacity-40 transition-colors">
            {saving ? 'Creating...' : 'Create job'}
          </button>
          <button onClick={() => router.back()}
            className="px-5 py-3 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
