'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function NewQuotePage() {
  const router = useRouter()
  const [clients, setClients] = useState<any[]>([])
  const [jobs, setJobs] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [clientId, setClientId] = useState('')
  const [jobId, setJobId] = useState('')
  const [quoteTo, setQuoteTo] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState([{ description: '', qty: 1, rate: 0 }])

  useEffect(() => {
    fetch('/api/clients').then(r => r.json()).then(d => setClients(Array.isArray(d) ? d : []))
    fetch('/api/jobs').then(r => r.json()).then(d => setJobs(Array.isArray(d) ? d : []))
  }, [])

  const onClientChange = (id: string) => {
    setClientId(id)
    const c = clients.find(c => c.id === parseInt(id))
    if (c) { if (c.company) setCompanyName(c.company); if (!quoteTo) setQuoteTo(c.name) }
  }

  const onJobChange = (id: string) => {
    setJobId(id)
    const j = jobs.find(j => j.id === parseInt(id))
    if (j && j.site_address) setAddress(j.site_address)
  }

  const addLine = () => setLines([...lines, { description: '', qty: 1, rate: 0 }])
  const removeLine = (i: number) => setLines(lines.filter((_, idx) => idx !== i))
  const updateLine = (i: number, field: string, val: any) => { const u = [...lines]; u[i] = { ...u[i], [field]: val }; setLines(u) }

  const sub = lines.reduce((s, l) => s + l.qty * l.rate, 0)
  const gst = sub * 0.1
  const total = sub + gst

  const save = async (send: boolean) => {
    if (!lines.some(l => l.description && l.rate !== 0)) return
    setSaving(true)
    try {
      const res = await fetch('/api/quotes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId ? parseInt(clientId) : null, job_id: jobId ? parseInt(jobId) : null,
          line_items: lines.filter(l => l.description && l.rate !== 0),
          quote_to_name: quoteTo, quote_to_company: companyName, quote_to_address: address,
          notes, send_now: send
        })
      })
      const q = await res.json()
      if (send && q.id) await fetch('/api/quotes', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quote_id: q.id }) })
      router.push('/dashboard/quotes')
    } catch { setSaving(false) }
  }

  return (
    <div className="p-4 lg:p-6 max-w-3xl mx-auto">
      <button onClick={() => router.back()} className="text-sm text-gray-400 hover:text-gray-600 mb-4">&#8592; Back</button>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">New Quote</h1>
      <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="block text-xs text-gray-500 mb-1">Client</label>
            <select value={clientId} onChange={e => onClientChange(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white outline-none">
              <option value="">Select client...</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></div>
          <div><label className="block text-xs text-gray-500 mb-1">Link to job</label>
            <select value={jobId} onChange={e => onJobChange(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white outline-none">
              <option value="">No job</option>
              {jobs.map(j => <option key={j.id} value={j.id}>{j.job_number} — {j.title}</option>)}
            </select></div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div><label className="block text-xs text-gray-500 mb-1">Quote To</label>
            <input value={quoteTo} onChange={e => setQuoteTo(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none" placeholder="e.g. James Blake" /></div>
          <div><label className="block text-xs text-gray-500 mb-1">Company</label>
            <input value={companyName} onChange={e => setCompanyName(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none" placeholder="e.g. JJ Property" /></div>
          <div><label className="block text-xs text-gray-500 mb-1">Address</label>
            <input value={address} onChange={e => setAddress(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none" placeholder="e.g. 58 Lavinia St" /></div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-gray-500">Line items</label>
            <button onClick={addLine} className="text-xs text-blue-600">+ Add line</button>
          </div>
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="grid grid-cols-12 gap-0 bg-gray-50 px-3 py-2 text-xs text-gray-500 font-medium border-b border-gray-200">
              <span className="col-span-6">Description</span><span className="col-span-2 text-center">Qty</span><span className="col-span-3 text-right">Rate (ex GST)</span><span className="col-span-1"></span>
            </div>
            {lines.map((item, i) => (
              <div key={i} className="grid grid-cols-12 gap-0 px-3 py-2 border-b border-gray-100 last:border-0 items-center">
                <input value={item.description} onChange={e => updateLine(i, 'description', e.target.value)} className="col-span-6 text-sm outline-none pr-2" placeholder="Description..." />
                <input type="number" value={item.qty} onChange={e => updateLine(i, 'qty', parseFloat(e.target.value) || 1)} className="col-span-2 text-sm outline-none text-center" min={1} />
                <input type="number" value={item.rate || ''} onChange={e => updateLine(i, 'rate', parseFloat(e.target.value) || 0)} className="col-span-3 text-sm outline-none text-right" placeholder="0.00" />
                <button onClick={() => removeLine(i)} className="col-span-1 text-red-300 hover:text-red-500 text-center text-lg">&#215;</button>
              </div>
            ))}
          </div>
        </div>
        <div><label className="block text-xs text-gray-500 mb-1">Notes / Terms</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none resize-none" placeholder="e.g. Quote valid for 14 days..." /></div>
        <div className="text-right space-y-1 text-sm">
          <div className="text-gray-500">Subtotal: <span className="text-gray-900 font-medium">${sub.toFixed(2)}</span></div>
          <div className="text-gray-500">GST (10%): <span className="text-gray-900 font-medium">${gst.toFixed(2)}</span></div>
          <div className="text-gray-900 font-bold text-base">Total: ${total.toFixed(2)}</div>
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={() => save(false)} disabled={saving} className="flex-1 border border-gray-200 text-gray-700 rounded-xl py-3 text-sm font-medium hover:bg-gray-50 disabled:opacity-40">{saving ? 'Saving...' : 'Save as draft'}</button>
          <button onClick={() => save(true)} disabled={saving} className="flex-1 bg-[#1a1a1a] text-white rounded-xl py-3 text-sm font-semibold hover:bg-gray-800 disabled:opacity-40">{saving ? 'Sending...' : 'Save & send'}</button>
        </div>
      </div>
    </div>
  )
}
