import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs/promises'
import path from 'path'

const DATA_DIR = path.join(process.cwd(), 'data')
const FILE_PATH = path.join(DATA_DIR, 'test-cases.json')

export async function GET() {
  try {
    const data = await fs.readFile(FILE_PATH, 'utf-8')
    return NextResponse.json({ testCases: JSON.parse(data) })
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') {
      return NextResponse.json({ testCases: [] })
    }
    return NextResponse.json({ error: 'Failed to read test cases' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { testCases } = body

    if (!Array.isArray(testCases)) {
      return NextResponse.json({ error: 'testCases must be an array' }, { status: 400 })
    }

    await fs.mkdir(DATA_DIR, { recursive: true })
    await fs.writeFile(FILE_PATH, JSON.stringify(testCases, null, 2))

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to save test cases' }, { status: 500 })
  }
}
