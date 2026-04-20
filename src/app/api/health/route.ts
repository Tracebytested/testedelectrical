import { NextResponse } from 'next/server'
import { setupDatabase } from '@/lib/setup'

export async function GET() {
  await setupDatabase()
  return NextResponse.json({ status: 'ok', service: 'Tested Electrical Admin', db: 'ready' })
}
