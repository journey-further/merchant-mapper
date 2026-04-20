import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sendError, records } from '../api/_lib/handlerUtils.js'
import { loadRows } from '../api/_lib/sessionStore.js'
import { getProcessedRows } from '../api/_lib/pipeline.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { rawDfUrl, state = {} } = req.body as { rawDfUrl: string; state?: Record<string, unknown> }
    const raw = await loadRows(rawDfUrl)
    const processed = await getProcessedRows(raw, state as never)

    res.status(200).json({
      preview: records(processed),
      rowCount: processed.length,
      colCount: Object.keys(processed[0] ?? {}).length,
    })
  } catch (err) {
    sendError(res, err)
  }
}
