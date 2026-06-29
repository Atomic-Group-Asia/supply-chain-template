import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const BUCKET = 'commitment-attachments'

// GET /api/stock-commitments/attachments/[id]
// Returns the binary file behind our Basic Auth (rather than exposing
// the private storage URL). Use this as <img src> directly.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { data: row, error } = await supabaseAdmin
      .from('commitment_attachments').select('*').eq('id', id).single()
    if (error || !row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { data: blob, error: dlErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .download(row.file_path)
    if (dlErr || !blob) return NextResponse.json({ error: dlErr?.message || 'Download failed' }, { status: 500 })

    const buf = Buffer.from(await blob.arrayBuffer())
    return new Response(buf, {
      headers: {
        'Content-Type': row.content_type || 'application/octet-stream',
        'Cache-Control': 'private, max-age=300',
        'Content-Disposition': `inline; filename="${row.file_name.replace(/[^\w.-]/g, '_')}"`,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Fetch failed' }, { status: 500 })
  }
}

// DELETE /api/stock-commitments/attachments/[id]
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { data: row } = await supabaseAdmin
      .from('commitment_attachments').select('file_path').eq('id', id).single()
    if (row?.file_path) {
      await supabaseAdmin.storage.from(BUCKET).remove([row.file_path])
    }
    const { error } = await supabaseAdmin
      .from('commitment_attachments').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Delete failed' }, { status: 500 })
  }
}
