import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sendError, records } from '../api/_lib/handlerUtils.js'
import { loadRows } from '../api/_lib/sessionStore.js'
import { computeOpportunity } from '../api/_lib/core/gadsOpportunity.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { combinedDfBlobUrl, gadsDfBlobUrl } = req.body as { combinedDfBlobUrl: string; gadsDfBlobUrl: string }

    const combined = await loadRows(combinedDfBlobUrl)
    const gads = await loadRows(gadsDfBlobUrl)
    const finalView = computeOpportunity(combined, gads)

    const withVolume = new Set(finalView.filter(r => r.monthly_searches).map(r => r.keyword))

    res.status(200).json({
      hasResults: finalView.length > 0,
      preview: records(finalView),
      totalRows: finalView.length,
      keywordsWithVolume: withVolume.size,
    })
  } catch (err) {
    sendError(res, err)
  }
}
