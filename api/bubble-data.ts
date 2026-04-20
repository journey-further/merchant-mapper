import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sendError } from '../api/_lib/handlerUtils.js'
import { loadRows } from '../api/_lib/sessionStore.js'
import { getProcessedRows } from '../api/_lib/pipeline.js'
import { findClicksCol } from '../api/_lib/core/feedProcessor.js'
import { norm, toNumber, isBlank } from '../api/_lib/core/utils.js'

const EXCLUDED_COLS = new Set(['price_currency', 'sale price_currency'])

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { rawDfUrl, n = 500, groupCol, state: params = {} } = req.body as {
      rawDfUrl: string
      n?: number
      groupCol?: string
      state?: Record<string, unknown>
    }

    const raw = await loadRows(rawDfUrl)
    const processed = await getProcessedRows(raw, params)

    const cols = Object.keys(processed[0] ?? {})
    const clicksCol = findClicksCol(cols)
    const priceCol = !clicksCol ? (cols.find(c => norm(c) === 'price') ?? null) : null
    const valueCol = clicksCol ?? priceCol
    const valueLabel = clicksCol ? 'clicks' : priceCol ? 'price' : ''
    const titleCol = cols.find(c => norm(c) === 'title') ?? null
    const candidates = cols.filter(c => !EXCLUDED_COLS.has(c))

    const topN = Number(n) || 500

    const items = processed
      .map(row => ({
        title: titleCol ? String(row[titleCol] ?? '') : '',
        value: valueCol ? (toNumber(row[valueCol]) || 0) : 0,
        category: groupCol ? String(row[groupCol] ?? '') : '',
      }))
      .filter(item => !isBlank(item.title))
      .sort((a, b) => b.value - a.value)
      .slice(0, topN)

    res.status(200).json({
      items,
      total: processed.length,
      groupCandidates: candidates,
      valueLabel,
    })
  } catch (err) {
    sendError(res, err)
  }
}
