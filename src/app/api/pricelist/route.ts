import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await query(`CREATE TABLE IF NOT EXISTS pricelist (
      id SERIAL PRIMARY KEY,
      item_name VARCHAR(255) NOT NULL,
      description TEXT,
      price DECIMAL(10,2) NOT NULL,
      category VARCHAR(100),
      created_at TIMESTAMP DEFAULT NOW()
    )`)
    const result = await query('SELECT * FROM pricelist ORDER BY category, item_name ASC')
    return NextResponse.json(result.rows)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json()
    const result = await query(
      'INSERT INTO pricelist (item_name, description, price, category) VALUES ($1,$2,$3,$4) RETURNING *',
      [data.item_name, data.description || null, data.price, data.category || 'General']
    )
    return NextResponse.json(result.rows[0])
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const data = await req.json()
    const result = await query(
      'UPDATE pricelist SET item_name=$1, description=$2, price=$3, category=$4 WHERE id=$5 RETURNING *',
      [data.item_name, data.description, data.price, data.category, data.id]
    )
    return NextResponse.json(result.rows[0])
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    await query('DELETE FROM pricelist WHERE id = $1', [searchParams.get('id')])
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
