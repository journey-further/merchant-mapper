import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sendError, records } from '../api/_lib/handlerUtils.js'
import { loadRows, saveRows } from '../api/_lib/sessionStore.js'
import { getGadsCredentials, fetchHistoricalMetrics } from '../api/_lib/core/gadsClient.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { combinedDfBlobUrl, sessionId, geoIds, languageId } = req.body as {
      combinedDfBlobUrl: string
      sessionId: string
      geoIds: string[]
      languageId: string
    }

    const combined = await loadRows(combinedDfBlobUrl)
    const keywords = [...new Set(combined.map(r => String(r.keyword ?? r.keyword_norm ?? '')).filter(Boolean))]

    const creds = getGadsCredentials()
    const gadsRows = await fetchHistoricalMetrics(creds, keywords, geoIds, languageId)
    const gadsDfRef = await saveRows(sessionId, 'gads', gadsRows)

    res.status(200).json({
      gadsDfBlobUrl: gadsDfRef,
      preview: records(gadsRows),
      rowCount: gadsRows.length,
    })
  } catch (err) {
    sendError(res, err)
  }
}
