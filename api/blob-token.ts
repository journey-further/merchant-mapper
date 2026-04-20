import type { VercelRequest, VercelResponse } from '@vercel/node'

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { filename = 'upload' } = req.body as { filename?: string }
  const encoded = encodeURIComponent(filename)
  res.status(200).json({
    uploadUrl: `/api/blob-relay?name=${encoded}`,
    url: 'pending',
  })
}
