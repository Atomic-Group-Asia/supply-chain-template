import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const BUCKET = 'commitment-attachments'

// GET /api/stock-commitments/group/[id]/attachments
// List all attachments for a commitment group.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { data, error } = await supabaseAdmin
    .from('commitment_attachments')
    .select('*')
    .eq('commitment_group_id', id)
    .order('uploaded_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ attachments: data || [] })
}

// POST /api/stock-commitments/group/[id]/attachments
// multipart form: file=<image/pdf>, uploaded_by=<name>
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const form = await req.formData()
    const file = form.get('file') as File | null
    const uploaded_by = (form.get('uploaded_by') as string | null)?.trim() || null
    if (!file) return NextResponse.json({ error: 'file is required' }, { status: 400 })

    // Generate a unique storage path so two files with the same name don't clash.
    const ext = (file.name.split('.').pop() || 'bin').toLowerCase().slice(0, 6)
    const filename = `${crypto.randomUUID()}.${ext}`
    const file_path = `${id}/${filename}`

    const buf = Buffer.from(await file.arrayBuffer())
    const { error: upErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(file_path, buf, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      })
    if (upErr) return NextResponse.json({ error: 'Upload failed: ' + upErr.message }, { status: 500 })

    const { data, error: dbErr } = await supabaseAdmin
      .from('commitment_attachments')
      .insert({
        commitment_group_id: id,
        file_path,
        file_name: file.name,
        content_type: file.type || null,
        size_bytes: buf.length,
        uploaded_by,
      })
      .select().single()
    if (dbErr) {
      // Roll back the storage upload so we don't orphan a file
      await supabaseAdmin.storage.from(BUCKET).remove([file_path])
      return NextResponse.json({ error: dbErr.message }, { status: 400 })
    }

    return NextResponse.json({ attachment: data })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Upload failed' }, { status: 500 })
  }
}
