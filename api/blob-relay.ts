import type { VercelRequest, VercelResponse } from '@vercel/node'
import { put } from '@vercel/blob'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' })

  const filename = String(req.query.name ?? 'upload')
  const contentType = req.headers['content-type'] ?? 'application/octet-stream'

  // vercel dev pre-parses the request body before the handler runs, consuming the
  // stream. Check req.body first; fall back to streaming only for production.
  let data: Buffer
  if (Buffer.isBuffer(req.body)) {
    data = req.body
  } else if (typeof req.body === 'string') {
    data = Buffer.from(req.body, 'utf8')
  } else if (req.body && typeof req.body === 'object') {
    data = Buffer.from(JSON.stringify(req.body))
  } else {
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(Buffer.from(chunk))
    data = Buffer.concat(chunks)
  }

  const blob = await put(`mm/uploads/${filename}`, data, {
    access: 'private',
    contentType: String(contentType),
    addRandomSuffix: true,
  })

  // downloadUrl is a time-limited signed URL — directly fetchable by parse.ts
  res.status(200).json({ url: blob.downloadUrl ?? blob.url })
}
