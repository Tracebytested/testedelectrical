import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getNextJobNumber, findOrCreateClient } from '@/lib/utils'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')
    const limit = searchParams.get('limit') || '50'

    let sql = `
      SELECT j.*, c.name as client_name, c.email as client_email, c.is_agency
      FROM jobs j
      LEFT JOIN clients c ON j.client_id = c.id
    `
    const params: any[] = []

    if (status) {
      sql += ' WHERE j.status = $1'
      params.push(status)
    }

    sql += ' ORDER BY j.created_at DESC LIMIT $' + (params.length + 1)
    params.push(parseInt(limit))

    const result = await query(sql, params)
    return NextResponse.json(result.rows)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json()
    const jobNumber = await getNextJobNumber()

    let clientId = data.client_id
    if (!clientId && data.client_name) {
      clientId = await findOrCreateClient({
        name: data.client_name,
        email: data.client_email
      })
    }

    const result = await query(
      `INSERT INTO jobs (job_number, client_id, title, description, site_address, status, source, work_order_ref, scheduled_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [
        jobNumber, clientId, data.title, data.description,
        data.site_address, data.status || 'pending',
        data.source || 'manual', data.work_order_ref, data.scheduled_date
      ]
    )

    return NextResponse.json(result.rows[0])
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const data = await req.json()
    const { id, ...fields } = data

    const allowedFields = ['status', 'title', 'description', 'site_address', 'scheduled_date', 'completed_date']
    const updates = Object.entries(fields)
      .filter(([key]) => allowedFields.includes(key))
      .map(([key], i) => `${key} = $${i + 2}`)
    const values = Object.entries(fields)
      .filter(([key]) => allowedFields.includes(key))
      .map(([, val]) => val)

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const result = await query(
      `UPDATE jobs SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id, ...values]
    )

    return NextResponse.json(result.rows[0])
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
