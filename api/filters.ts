import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sendError, records } from '../api/_lib/handlerUtils.js'
import {
  applyColumnSelection, applyFilters, applyNumericFilters,
  filterOptions, numericFilterOptions,
} from '../api/_lib/core/feedProcessor.js'
import { loadRows } from '../api/_lib/sessionStore.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { rawDfUrl, keepMap, filters = {}, numericFilters = {} } = req.body as {
      rawDfUrl: string
      keepMap?: Record<string, boolean>
      filters?: Record<string, string[]>
      numericFilters?: Record<string, { gte?: number; lte?: number }>
    }

    let rows = await loadRows(rawDfUrl)
    if (keepMap) rows = applyColumnSelection(rows, keepMap)

    const numericOpts = numericFilterOptions(rows)
    const numericCols = new Set(Object.keys(numericOpts))
    const opts = filterOptions(rows, 200, numericCols)

    let filtered = rows
    if (Object.keys(filters).length) filtered = applyFilters(filtered, filters)
    if (Object.keys(numericFilters).length) filtered = applyNumericFilters(filtered, numericFilters)

    res.status(200).json({
      options: opts,
      numericOptions: numericOpts,
      filteredCount: filtered.length,
      totalCount: rows.length,
      preview: records(filtered),
    })
  } catch (err) {
    sendError(res, err)
  }
}
