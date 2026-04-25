import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function GET() {
  try {
    const result = await query('SELECT * FROM clients ORDER BY name ASC')
    return NextResponse.json(result.rows)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json()
    const result = await query(
      'INSERT INTO clients (name, email, phone, address, company, is_agency, notes) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [data.name, data.email || null, data.phone || null, data.address || null, data.company || null, data.is_agency || false, data.notes || null]
    )
    return NextResponse.json(result.rows[0])
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const data = await req.json()
    if (!data.id) return NextResponse.json({ error: 'ID required' }, { status: 400 })
    const result = await query(
      'UPDATE clients SET name=$1, email=$2, phone=$3, company=$4, is_agency=$5, updated_at=NOW() WHERE id=$6 RETURNING *',
      [data.name, data.email || null, data.phone || null, data.company || null, data.is_agency || false, data.id]
    )
    return NextResponse.json(result.rows[0])
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })
    await query('UPDATE jobs SET client_id = NULL WHERE client_id = $1', [id])
    await query('UPDATE invoices SET client_id = NULL WHERE client_id = $1', [id])
    await query('UPDATE quotes SET client_id = NULL WHERE client_id = $1', [id])
    await query('UPDATE reports SET client_id = NULL WHERE client_id = $1', [id])
    await query('DELETE FROM clients WHERE id = $1', [id])
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
