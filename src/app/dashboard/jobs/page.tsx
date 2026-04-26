'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

const statusColour: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  active: 'bg-blue-100 text-blue-800',
  completed: 'bg-purple-100 text-purple-800',
  invoiced: 'bg-green-100 text-green-800',
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<any[]>([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<number | null>(null)

  const loadJobs = () => {
    setLoading(true)
    const url = filter === 'all' ? '/api/jobs' : `/api/jobs?status=${filter}`
    fetch(url).then(r => r.json()).then(data => {
      setJobs(Array.isArray(data) ? data : [])
      setLoading(false)
    })
  }

  useEffect(() => { loadJobs() }, [filter])

  const deleteJob = async (id: number, title: string) => {
    if (!confirm(`Delete "${title}"?\n\nThis will also delete any quotes, invoices and reports linked to this job.`)) return
    setDeleting(id)
    try {
      await fetch(`/api/jobs?id=${id}`, { method: 'DELETE' })
      setJobs(prev => prev.filter(j => j.id !== id))
    } catch {
      alert('Error deleting job')
    }
    setDeleting(null)
  }

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Jobs</h1>
        <Link
          href="/dashboard/jobs/new"
          className="bg-[#1a1a1a] text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-800"
        >
          + New job
        </Link>
      </div>

      <div className="flex gap-2 mb-5">
        {['all', 'pending', 'active', 'completed', 'invoiced'].map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors capitalize ${
              filter === s ? 'bg-[#1a1a1a] text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-gray-400">Loading...</div>
        ) : jobs.length === 0 ? (
          <div className="py-12 text-center text-gray-400">
            <p className="text-lg mb-1">No jobs found</p>
            <p className="text-sm">Check emails or create a job manually</p>
          </div>
        ) : (
          <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-5 py-3 text-gray-500 font-medium">Job</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Client</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Site</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Status</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Date</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {jobs.map(job => (
                <tr key={job.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3.5">
                    <Link href={`/dashboard/jobs/${job.id}`} className="block">
                      <div className="font-medium text-gray-900 truncate max-w-xs">{job.title}</div>
                      <div className="text-xs text-gray-400">{job.job_number}</div>
                    </Link>
                  </td>
                  <td className="px-4 py-3.5 text-gray-600">{job.client_name || '—'}</td>
                  <td className="px-4 py-3.5 text-gray-500 truncate max-w-[160px]">{job.site_address || '—'}</td>
                  <td className="px-4 py-3.5">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColour[job.status] || 'bg-gray-100 text-gray-700'}`}>
                      {job.status}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-gray-400 text-xs">
                    {new Date(job.created_at).toLocaleDateString('en-AU')}
                  </td>
                  <td className="px-4 py-3.5">
                    <button
                      onClick={() => deleteJob(job.id, job.title)}
                      disabled={deleting === job.id}
                      className="text-xs text-red-400 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded-lg transition-colors disabled:opacity-40"
                    >
                      {deleting === job.id ? '...' : 'Delete'}
                    </button>
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
