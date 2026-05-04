'use client'
import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'

export default function EditInvoicePage() {
  const router = useRouter()
  const params = useParams()
  const invoiceId = params.id as string

  const [clients, setClients] = useState<any[]>([])
  const [jobs, setJobs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [clientId, setClientId] = useState('')
  const [jobId, setJobId] = useState('')
  const [billToName, setBillToName] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [address, setAddress] = useState('')
  const [status, setStatus] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [lines, setLines] = useState([{ description: '', qty: 1, rate: 0 }])

  useEffect(() => {
    Promise.all([
      fetch('/api/clients').then(r => r.json()),
      fetch('/api/jobs').then(r => r.json()),
      fetch(`/api/invoices?id=${invoiceId}`).then(r => r.json()),
    ]).then(([clientsData, jobsData, invoiceData]) => {
      setClients(Array.isArray(clientsData) ? clientsData : [])
      setJobs(Array.isArray(jobsData) ? jobsData : [])

      if (invoiceData && !invoiceData.error) {
        const inv = Array.isArray(invoiceData) ? invoiceData[0] : invoiceData
        if (inv) {
          setClientId(inv.client_id?.toString() || '')
          setJobId(inv.job_id?.toString() || '')
          setBillToName(inv.bill_to_name || inv.client_name || '')
          setCompanyName(inv.bill_to_company || '')
          setAddress(inv.bill_to_address || inv.site_address || '')
          setStatus(inv.status || 'draft')
          setInvoiceNumber(inv.invoice_number || '')
          const items = typeof inv.line_items === 'string' ? JSON.parse(inv.line_items) : inv.line_items
          if (Array.isArray(items) && items.length > 0) {
            setLines(items.map((item: any) => ({
              description: item.description || '',
              qty: item.qty || item.quantity || 1,
              rate: item.rate || item.unit_price || 0,
            })))
          }
        }
      }
      setLoading(false)
    })
  }, [invoiceId])

  const onClientChange = (id: string) => {
    setClientId(id)
    const c = clients.find(c => c.id === parseInt(id))
    if (c) { if (c.company) setCompanyName(c.company); if (!billToName) setBillToName(c.name) }
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
      const res = await fetch('/api/invoices', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: parseInt(invoiceId),
          client_id: clientId ? parseInt(clientId) : null,
          job_id: jobId ? parseInt(jobId) : null,
          line_items: lines.filter(l => l.description && l.rate !== 0),
          bill_to_name: billToName,
          bill_to_company: companyName,
          bill_to_address: address,
        })
      })
      const inv = await res.json()
      if (inv.error) {
        alert('Save failed: ' + inv.error)
        setSaving(false)
        return
      }
      if (send && inv.id) {
        await fetch('/api/invoices', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ invoice_id: inv.id })
        })
      }
      router.push('/dashboard/invoices')
    } catch (e: any) {
      alert('Save failed: ' + (e.message || 'Unknown error'))
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-4 lg:p-6 max-w-3xl mx-auto">
        <div className="py-12 text-center text-gray-400">Loading invoice...</div>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 max-w-3xl mx-auto">
      <button onClick={() => router.back()} className="text-sm text-gray-400 hover:text-gray-600 mb-4">&#8592; Back</button>
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Edit Invoice {invoiceNumber}</h1>
        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
          status === 'draft' ? 'bg-gray-100 text-gray-700' :
          status === 'sent' ? 'bg-blue-100 text-blue-800' :
          status === 'paid' ? 'bg-green-100 text-green-800' :
          'bg-gray-100 text-gray-700'
        }`}>{status}</span>
      </div>
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
          <div><label className="block text-xs text-gray-500 mb-1">Bill To Name</label>
            <input value={billToName} onChange={e => setBillToName(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none" placeholder="e.g. James Blake" /></div>
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
        <div className="text-right space-y-1 text-sm">
          <div className="text-gray-500">Subtotal: <span className="text-gray-900 font-medium">${sub.toFixed(2)}</span></div>
          <div className="text-gray-500">GST (10%): <span className="text-gray-900 font-medium">${gst.toFixed(2)}</span></div>
          <div className="text-gray-900 font-bold text-base">Total: ${total.toFixed(2)}</div>
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={() => save(false)} disabled={saving} className="flex-1 border border-gray-200 text-gray-700 rounded-xl py-3 text-sm font-medium hover:bg-gray-50 disabled:opacity-40">{saving ? 'Saving...' : 'Update invoice'}</button>
          {status === 'draft' && (
            <button onClick={() => save(true)} disabled={saving} className="flex-1 bg-[#1a1a1a] text-white rounded-xl py-3 text-sm font-semibold hover:bg-gray-800 disabled:opacity-40">{saving ? 'Sending...' : 'Update & send'}</button>
          )}
        </div>
      </div>
    </div>
  )
}
