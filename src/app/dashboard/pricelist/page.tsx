'use client'
import { useEffect, useState } from 'react'

export default function PriceListPage() {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [price, setPrice] = useState('')
  const [category, setCategory] = useState('General')

  const load = () => { fetch('/api/pricelist').then(r => r.json()).then(d => { setItems(Array.isArray(d) ? d : []); setLoading(false) }) }
  useEffect(() => { load() }, [])

  const clearForm = () => { setName(''); setDesc(''); setPrice(''); setCategory('General'); setShowAdd(false); setEditId(null) }

  const save = async () => {
    if (!name || !price) return
    setSaving(true)
    const payload: any = { item_name: name, description: desc, price: parseFloat(price), category }
    if (editId) payload.id = editId
    await fetch('/api/pricelist', { method: editId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    clearForm(); setSaving(false); load()
  }

  const remove = async (id: number, n: string) => {
    if (!confirm('Delete "' + n + '"?')) return
    await fetch('/api/pricelist?id=' + id, { method: 'DELETE' }); load()
  }

  const categories = Array.from(new Set(items.map(i => i.category || 'General')))

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Price List</h1>
          <p className="text-sm text-gray-500 mt-1">Beezy uses these prices when generating invoices and quotes</p>
        </div>
        <button onClick={() => { clearForm(); setShowAdd(true) }}
          className="bg-[#1a1a1a] text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-800">+ Add item</button>
      </div>

      {(showAdd || editId) && (
        <div className={'bg-white rounded-2xl border p-5 mb-5 ' + (editId ? 'border-blue-200' : 'border-gray-100')}>
          <h3 className="font-semibold text-gray-900 mb-4">{editId ? 'Edit item' : 'Add new item'}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <div><label className="block text-xs text-gray-500 mb-1">Item Name *</label>
              <input value={name} onChange={e => setName(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400" placeholder="e.g. Powerpoint Install (New)" /></div>
            <div><label className="block text-xs text-gray-500 mb-1">Price (ex GST) *</label>
              <input type="number" step="0.01" value={price} onChange={e => setPrice(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400" placeholder="e.g. 180.00" /></div>
            <div><label className="block text-xs text-gray-500 mb-1">Category</label>
              <input value={category} onChange={e => setCategory(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400" placeholder="e.g. Installation, Repair, Call Out" list="categories" />
              <datalist id="categories">{categories.map(c => <option key={c} value={c} />)}</datalist></div>
            <div><label className="block text-xs text-gray-500 mb-1">Description</label>
              <input value={desc} onChange={e => setDesc(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400" placeholder="Optional details" /></div>
          </div>
          <div className="flex gap-3">
            <button onClick={save} disabled={saving || !name || !price} className="bg-[#1a1a1a] text-white px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-40">{saving ? 'Saving...' : editId ? 'Save' : 'Add'}</button>
            <button onClick={clearForm} className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600">Cancel</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {loading ? <div className="py-12 text-center text-gray-400">Loading...</div> : items.length === 0 ? (
          <div className="py-12 text-center text-gray-400">No items yet. Add your common services and their prices.</div>
        ) : (
          <div className="overflow-x-auto"><table className="w-full min-w-[500px] text-sm">
            <thead className="bg-gray-50 border-b border-gray-100"><tr>
              <th className="text-left px-5 py-3 text-gray-500 font-medium">Item</th>
              <th className="text-left px-4 py-3 text-gray-500 font-medium">Category</th>
              <th className="text-right px-4 py-3 text-gray-500 font-medium">Price (ex GST)</th>
              <th className="text-right px-4 py-3 text-gray-500 font-medium">Inc GST</th>
              <th className="px-4 py-3"></th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {items.map(item => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3.5">
                    <div className="font-medium text-gray-900">{item.item_name}</div>
                    {item.description && <div className="text-xs text-gray-400 mt-0.5">{item.description}</div>}
                  </td>
                  <td className="px-4 py-3.5"><span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700">{item.category}</span></td>
                  <td className="px-4 py-3.5 text-right font-mono text-gray-900">${parseFloat(item.price).toFixed(2)}</td>
                  <td className="px-4 py-3.5 text-right font-mono text-gray-500">${(parseFloat(item.price) * 1.1).toFixed(2)}</td>
                  <td className="px-4 py-3.5"><div className="flex gap-2 justify-end">
                    <button onClick={() => { setEditId(item.id); setName(item.item_name); setDesc(item.description || ''); setPrice(item.price); setCategory(item.category || 'General'); setShowAdd(false) }}
                      className="text-xs text-blue-500 hover:text-blue-700 px-2 py-1 rounded-lg">Edit</button>
                    <button onClick={() => remove(item.id, item.item_name)}
                      className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded-lg">Delete</button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>
    </div>
  )
}
