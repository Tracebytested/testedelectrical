'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

export default function JobDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const [job, setJob] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [action, setAction] = useState<'quote' | 'invoice' | 'report' | null>(null)
  const [description, setDescription] = useState('')
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState('')
  const [relatedDocs, setRelatedDocs] = useState<{ reports: any[], invoices: any[], quotes: any[] }>({ reports: [], invoices: [], quotes: [] })
  const [photos, setPhotos] = useState<string[]>([])

  useEffect(() => {
    fetch(`/api/jobs`).then(r => r.json()).then(data => {
      const jobs = Array.isArray(data) ? data : []
      const found = jobs.find((j: any) => j.id === parseInt(id as string))
      setJob(found || null)
      setLoading(false)
    })

    // Load related docs
    Promise.all([
      fetch('/api/reports').then(r => r.json()),
      fetch('/api/invoices').then(r => r.json()),
      fetch('/api/quotes').then(r => r.json())
    ]).then(([reports, invoices, quotes]) => {
      const jobId = parseInt(id as string)
      setRelatedDocs({
        reports: (Array.isArray(reports) ? reports : []).filter((r: any) => r.job_id === jobId),
        invoices: (Array.isArray(invoices) ? invoices : []).filter((i: any) => i.job_id === jobId),
        quotes: (Array.isArray(quotes) ? quotes : []).filter((q: any) => q.job_id === jobId),
      })
    })

    // Load job photos from Google Drive
    fetch('/api/photos?job_id=' + id).then(r => r.json()).then(data => {
      if (Array.isArray(data)) setPhotos(data)
    }).catch(() => {})
  }, [id])

  const updateStatus = async (status: string) => {
    await fetch('/api/jobs', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: parseInt(id as string), status })
    })
    setJob((prev: any) => ({ ...prev, status }))
  }

  const handleAction = async () => {
    if (!description.trim()) return
    setWorking(true)
    setMessage('')
    try {
      if (action === 'quote') {
        const res = await fetch('/api/quotes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ job_id: job.id, client_id: job.client_id, description, generate_from_description: true })
        })
        const q = await res.json()
        await fetch('/api/quotes', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quote_id: q.id }) })
        setMessage(`✅ Quote ${q.quote_number} generated and sent!`)
      }
      if (action === 'report') {
        const res = await fetch('/api/reports', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ job_id: job.id, client_id: job.client_id, description, generate_from_description: true })
        })
        const r = await res.json()
        await fetch('/api/reports', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ report_id: r.id }) })
        setMessage(`✅ Report ${r.report_number} generated and sent!`)
        updateStatus('completed')
      }
      if (action === 'invoice') {
        const res = await fetch('/api/invoices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ job_id: job.id, client_id: job.client_id, description, generate_from_description: true })
        })
        const inv = await res.json()
        await fetch('/api/invoices', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invoice_id: inv.id }) })
        setMessage(`✅ Invoice ${inv.invoice_number} generated and sent!`)
        updateStatus('invoiced')
      }
      // Reload related docs
      const [reports, invoices, quotes] = await Promise.all([
        fetch('/api/reports').then(r => r.json()),
        fetch('/api/invoices').then(r => r.json()),
        fetch('/api/quotes').then(r => r.json())
      ])
      const jobId = parseInt(id as string)
      setRelatedDocs({
        reports: (Array.isArray(reports) ? reports : []).filter((r: any) => r.job_id === jobId),
        invoices: (Array.isArray(invoices) ? invoices : []).filter((i: any) => i.job_id === jobId),
        quotes: (Array.isArray(quotes) ? quotes : []).filter((q: any) => q.job_id === jobId),
      })
      setAction(null)
      setDescription('')
    } catch {
      setMessage('Something went wrong. Try again.')
    }
    setWorking(false)
  }

  if (loading) return <div className="p-6 text-gray-400">Loading...</div>
  if (!job) return <div className="p-6 text-gray-400">Job not found</div>

  const statusColour: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-800',
    active: 'bg-blue-100 text-blue-800',
    completed: 'bg-purple-100 text-purple-800',
    invoiced: 'bg-green-100 text-green-800',
  }

  const hasReport = relatedDocs.reports.length > 0
  const hasInvoice = relatedDocs.invoices.length > 0
  const hasQuote = relatedDocs.quotes.length > 0

  return (
    <div className="p-4 lg:p-6 max-w-3xl mx-auto">
      <button onClick={() => router.back()} className="text-sm text-gray-400 hover:text-gray-600 mb-4 flex items-center gap-1">← Back</button>

      {/* Job header */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs text-gray-400 font-mono">{job.job_number}</span>
              {job.work_order_ref && <span className="text-xs text-gray-400">· WO: {job.work_order_ref}</span>}
            </div>
            <h1 className="text-xl font-bold text-gray-900">{job.title}</h1>
            <p className="text-gray-500 text-sm mt-1">{job.client_name}</p>
          </div>
          <span className={`text-xs px-3 py-1.5 rounded-full font-semibold flex-shrink-0 ${statusColour[job.status] || 'bg-gray-100 text-gray-700'}`}>
            {job.status}
          </span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div><div className="text-xs text-gray-400 mb-0.5">Site address</div><div className="text-gray-700">{job.site_address || '—'}</div></div>
          <div><div className="text-xs text-gray-400 mb-0.5">Agency contact</div><div className="text-gray-700">{job.agency_contact || '—'}</div></div>
          <div><div className="text-xs text-gray-400 mb-0.5">Source</div><div className="text-gray-700 capitalize">{job.source || '—'}</div></div>
          <div><div className="text-xs text-gray-400 mb-0.5">Created</div><div className="text-gray-700">{new Date(job.created_at).toLocaleDateString('en-AU')}</div></div>
        </div>
        {job.description && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <div className="text-xs text-gray-400 mb-1">Description</div>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{job.description}</p>
          </div>
        )}
      </div>

      {/* Status buttons */}
      <div className="flex gap-2 mb-4">
        {['pending', 'active', 'completed', 'invoiced'].map(s => (
          <button key={s} onClick={() => updateStatus(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${job.status === s ? 'bg-[#1a1a1a] text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            {s}
          </button>
        ))}
      </div>

      {message && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-800 rounded-xl px-4 py-3 text-sm">{message}</div>
      )}

      {/* Existing documents */}
      {(hasReport || hasInvoice || hasQuote) && (
        <div className="mb-4 space-y-3">
          {relatedDocs.reports.map(r => (
            <DocCard key={r.id} type="Report" number={r.report_number} title={r.title}
              status={r.status} date={r.created_at} price={r.price_ex_gst} docId={r.id}
              onResend={async () => {
                await fetch('/api/reports', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ report_id: r.id }) })
                setMessage(`✅ Report ${r.report_number} resent!`)
              }}
            />
          ))}
          {relatedDocs.invoices.map(i => (
            <DocCard key={i.id} type="Invoice" number={i.invoice_number} title={i.job_title}
              status={i.status} date={i.created_at} price={i.total} docId={i.id}
              onResend={async () => {
                await fetch('/api/invoices', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invoice_id: i.id }) })
                setMessage(`✅ Invoice ${i.invoice_number} resent!`)
              }}
            />
          ))}
          {relatedDocs.quotes.map(q => (
            <DocCard key={q.id} type="Quote" number={q.quote_number} title={q.job_title}
              status={q.status} date={q.created_at} price={q.total} docId={q.id}
              onResend={async () => {
                await fetch('/api/quotes', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quote_id: q.id }) })
                setMessage(`✅ Quote ${q.quote_number} resent!`)
              }}
            />
          ))}
        </div>
      )}

      {/* Photos */}
      {photos.length > 0 && (
        <div className="mb-4 bg-white rounded-2xl border border-gray-100 p-4">
          <h3 className="font-medium text-sm text-gray-900 mb-3">Site Photos ({photos.length})</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {photos.map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block aspect-video bg-gray-100 rounded-lg overflow-hidden">
                <img src={url} alt={'Photo ' + (i + 1)} className="w-full h-full object-cover hover:opacity-90 transition-opacity" />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Generate new docs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 mb-4">
        <ActionBtn label={hasQuote ? '📋 New Quote' : '📋 Generate Quote'} onClick={() => setAction(action === 'quote' ? null : 'quote')} active={action === 'quote'} />
        <ActionBtn label={hasReport ? '📄 New Report' : '📄 Generate Report'} onClick={() => setAction(action === 'report' ? null : 'report')} active={action === 'report'} />
        <ActionBtn label={hasInvoice ? '💰 New Invoice' : '💰 Generate Invoice'} onClick={() => setAction(action === 'invoice' ? null : 'invoice')} active={action === 'invoice'} />
      </div>

      {action && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h3 className="font-semibold text-gray-900 mb-3 capitalize">
            {action === 'quote' ? 'Describe the work to quote' : action === 'report' ? 'Describe what was done' : 'Describe the work completed'}
          </h3>
          <textarea value={description} onChange={e => setDescription(e.target.value)}
            placeholder={action === 'quote' ? 'e.g. Supply and install 2x emergency exit signs...' :
              action === 'report' ? 'e.g. Attended site, found faulty MCB, replaced, tested...' :
              'e.g. Replaced 3x GPOs, installed new light fitting, 2.5 hours...'}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm resize-none outline-none focus:border-gray-400 transition-colors" rows={5} />
          <div className="flex gap-3 mt-3">
            <button onClick={handleAction} disabled={working || !description.trim()}
              className="flex-1 bg-[#1a1a1a] text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-gray-800 disabled:opacity-40 transition-colors">
              {working ? 'Generating & sending...' : `Generate ${action} & send`}
            </button>
            <button onClick={() => { setAction(null); setDescription('') }}
              className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}

function DocCard({ type, number, title, status, date, price, docId, onResend }: {
  type: string; number: string; title: string; status: string;
  date: string; price: any; docId: number; onResend: () => void
}) {
  const icons: Record<string, string> = { Report: '📄', Invoice: '💰', Quote: '📋' }
  const typeParam: Record<string, string> = { Report: 'report', Invoice: 'invoice', Quote: 'quote' }
  const statusColour: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-700', sent: 'bg-blue-100 text-blue-800',
    paid: 'bg-green-100 text-green-800',
  }

  const viewUrl = `/api/pdf?type=${typeParam[type]}&id=${docId}`

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm">{icons[type]}</span>
            <span className="font-medium text-sm text-gray-900">{type} {number}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColour[status] || 'bg-gray-100 text-gray-700'}`}>{status}</span>
          </div>
          <p className="text-xs text-gray-500 truncate">{title}</p>
          <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
            <span>{new Date(date).toLocaleDateString('en-AU')}</span>
            {price && parseFloat(price) > 0 && <span className="font-medium text-gray-600">${parseFloat(price).toFixed(2)}</span>}
          </div>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <a href={viewUrl} target="_blank" rel="noopener noreferrer"
            className="text-xs bg-[#1a1a1a] text-white px-3 py-1.5 rounded-lg hover:bg-gray-800 transition-colors">
            View PDF
          </a>
          <button onClick={onResend}
            className="text-xs bg-gray-50 border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            Resend
          </button>
        </div>
      </div>
    </div>
  )
}

function ActionBtn({ label, onClick, active }: { label: string; onClick: () => void; active: boolean }) {
  return (
    <button onClick={onClick}
      className={`py-3 rounded-xl text-sm font-medium transition-colors ${active ? 'bg-[#1a1a1a] text-white' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
      {label}
    </button>
  )
}
