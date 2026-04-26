'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function NewReportPage() {
  const router = useRouter()
  const [clients, setClients] = useState<any[]>([])
  const [jobs, setJobs] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [form, setForm] = useState({
    client_id: '', job_id: '', title: '', site_address: '',
    task_information: '', investigation_findings: '', work_undertaken: '',
    remedial_action: '', recommended_followup: 'No further action required.',
    price_ex_gst: ''
  })
  const [aiDescription, setAiDescription] = useState('')

  useEffect(() => {
    fetch('/api/clients').then(r => r.json()).then(d => setClients(Array.isArray(d) ? d : []))
    fetch('/api/jobs').then(r => r.json()).then(d => setJobs(Array.isArray(d) ? d : []))
  }, [])

  const generateFromDescription = async () => {
    if (!aiDescription.trim()) return
    setGenerating(true)
    const selectedJob = jobs.find(j => j.id === parseInt(form.job_id))
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          generate_from_description: true,
          description: aiDescription,
          job_id: form.job_id ? parseInt(form.job_id) : null,
          client_id: form.client_id ? parseInt(form.client_id) : null,
          site_address: form.site_address || selectedJob?.site_address
        })
      })
      const data = await res.json()
      if (data.title) {
        setForm(prev => ({
          ...prev,
          title: data.title || '',
          task_information: data.task_information || '',
          investigation_findings: data.investigation_findings || '',
          work_undertaken: data.work_undertaken || '',
          remedial_action: data.remedial_action || '',
          recommended_followup: data.recommended_followup || 'No further action required.',
          price_ex_gst: data.price_ex_gst || ''
        }))
      }
    } catch {}
    setGenerating(false)
  }

  const save = async (send: boolean) => {
    if (!form.title.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          client_id: form.client_id ? parseInt(form.client_id) : null,
          job_id: form.job_id ? parseInt(form.job_id) : null,
          price_ex_gst: parseFloat(form.price_ex_gst) || 0,
          send_now: send
        })
      })
      const report = await res.json()
      if (send && report.id) {
        await fetch('/api/reports', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ report_id: report.id }) })
      }
      router.push('/dashboard/reports')
    } catch { setSaving(false) }
  }

  const field = (label: string, key: keyof typeof form, rows = 3) => (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      {rows === 1
        ? <input value={form[key]} onChange={e => setForm({...form, [key]: e.target.value})}
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-gray-400" />
        : <textarea value={form[key]} onChange={e => setForm({...form, [key]: e.target.value})}
            rows={rows} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-gray-400 resize-none" />
      }
    </div>
  )

  return (
    <div className="p-4 lg:p-6 max-w-3xl mx-auto">
      <button onClick={() => router.back()} className="text-sm text-gray-400 hover:text-gray-600 mb-4">← Back</button>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">New Report</h1>

      {/* AI Generate */}
      <div className="bg-[#1a1a1a] rounded-2xl p-5 mb-5">
        <div className="text-xs text-yellow-400 font-semibold mb-2">⚡ Generate with Beezy</div>
        <textarea value={aiDescription} onChange={e => setAiDescription(e.target.value)}
          rows={3} placeholder="Describe what was done... e.g. Attended site, found faulty MCB in switchboard, replaced, tested all circuits, all good."
          className="w-full bg-white/10 text-white placeholder-white/40 rounded-xl px-4 py-3 text-sm outline-none resize-none mb-3" />
        <button onClick={generateFromDescription} disabled={generating || !aiDescription.trim()}
          className="bg-yellow-400 text-black px-4 py-2 rounded-lg text-sm font-semibold hover:bg-yellow-300 disabled:opacity-40">
          {generating ? 'Generating...' : 'Generate report fields'}
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Client</label>
            <select value={form.client_id} onChange={e => setForm({...form, client_id: e.target.value})}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white outline-none">
              <option value="">Select client...</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Link to job (optional)</label>
            <select value={form.job_id} onChange={e => setForm({...form, job_id: e.target.value})}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white outline-none">
              <option value="">No job</option>
              {jobs.map(j => <option key={j.id} value={j.id}>{j.job_number} — {j.title}</option>)}
            </select>
          </div>
        </div>
        {field('Report title *', 'title', 1)}
        {field('Site address', 'site_address', 1)}
        {field('Task information', 'task_information')}
        {field('Investigation findings', 'investigation_findings')}
        {field('Work undertaken', 'work_undertaken')}
        {field('Remedial action', 'remedial_action')}
        {field('Recommended follow up', 'recommended_followup', 2)}
        <div>
          <label className="block text-xs text-gray-500 mb-1">Price (ex GST)</label>
          <input type="number" value={form.price_ex_gst} onChange={e => setForm({...form, price_ex_gst: e.target.value})}
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-gray-400"
            placeholder="0.00" />
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={() => save(false)} disabled={saving || !form.title}
            className="flex-1 border border-gray-200 text-gray-700 rounded-xl py-3 text-sm font-medium hover:bg-gray-50 disabled:opacity-40">
            {saving ? 'Saving...' : 'Save as draft'}
          </button>
          <button onClick={() => save(true)} disabled={saving || !form.title}
            className="flex-1 bg-[#1a1a1a] text-white rounded-xl py-3 text-sm font-semibold hover:bg-gray-800 disabled:opacity-40">
            {saving ? 'Sending...' : 'Save & send'}
          </button>
        </div>
      </div>
    </div>
  )
}
