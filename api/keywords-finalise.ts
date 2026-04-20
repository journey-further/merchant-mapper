import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sendError, records } from '../api/_lib/handlerUtils.js'
import { loadRows, saveRows } from '../api/_lib/sessionStore.js'
import { getProcessedRows } from '../api/_lib/pipeline.js'
import { makeKeywords } from '../api/_lib/core/keywordBuilder.js'
import type { Combo } from '../api/_lib/presets.js'
import type { Row } from '../api/_lib/core/feedProcessor.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { rawDfUrl, session: sessionId, state = {}, combos = [] } = req.body as {
      rawDfUrl: string
      session: string
      state?: Record<string, unknown>
      combos: Combo[]
    }

    const raw = await loadRows(rawDfUrl)
    const processed = await getProcessedRows(raw, state as never)
    const allCols = Object.keys(processed[0] ?? {})

    const allRows: Row[] = []
    for (const combo of combos) {
      const fields = (combo.fields ?? []).filter(f => allCols.includes(f))
      const table = makeKeywords(processed, fields, Boolean(combo.splitAmpersand))
      const listName = combo.name || 'List'
      for (const row of table) allRows.push({ ...row, list_name: listName })
    }

    const combinedRef = await saveRows(sessionId, 'combined', allRows)

    res.status(200).json({
      combinedDfBlobUrl: combinedRef,
      preview: records(allRows),
      totalKeywords: allRows.length,
    })
  } catch (err) {
    sendError(res, err)
  }
}
