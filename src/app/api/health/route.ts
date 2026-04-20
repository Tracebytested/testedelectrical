import { NextResponse } from 'next/server'
import { setupDatabase } from '@/lib/setup'

let dbReady = false

export async function GET() {
  if (!dbReady) {
    await setupDatabase()
    dbReady = true
  }
  return NextResponse.json({ status: 'ok', service: 'Tested Electrical Admin', db: 'ready' })
}
