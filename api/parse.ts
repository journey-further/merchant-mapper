import type { VercelRequest, VercelResponse } from '@vercel/node'
import crypto from 'node:crypto'
import Papa from 'papaparse'
import { sendError } from '../api/_lib/handlerUtils'
import { deriveAgeGenderSegment, defaultKeepMap, countProducts } from '../api/_lib/core/feedProcessor'
import { preferredCategoryColumn } from '../api/_lib/core/categoryExtraction'
import { columnMeta, clicksSortedPreview } from '../api/_lib/handlerUtils'
import { getOrCreateSession, saveRows } from '../api/_lib/sessionStore'
import type { Row } from '../api/_lib/core/feedProcessor'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { blobUrl, filename = 'file' } = req.body as { blobUrl: string; filename?: string }

    const token = process.env.BLOB_READ_WRITE_TOKEN ?? ''
    const resp = await fetch(blobUrl, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!resp.ok) throw new Error(`Failed to fetch blob: ${resp.status}`)
    const text = await resp.text()

    const fileHash = crypto.createHash('md5').update(text).digest('hex')

    const ext = String(filename).toLowerCase()
    const delimiter = ext.endsWith('.tsv') || ext.endsWith('.txt') ? '\t' : ','

    const { data, errors } = Papa.parse<Row>(text, {
      header: true,
      delimiter,
      skipEmptyLines: true,
      transformHeader: (h: string) => h.trim().replace(/\s+/g, ' '),
    })

    if (errors.length && !data.length) {
      throw new Error(`Parse error: ${errors[0].message}`)
    }

    let rows = data as Row[]
    rows = deriveAgeGenderSegment(rows)

    const sessionId = await getOrCreateSession(fileHash, filename)
    const rawRef = await saveRows(sessionId, 'raw', rows)

    const keepMap = defaultKeepMap(Object.keys(rows[0] ?? {}))
    const cols = Object.keys(rows[0] ?? {})

    res.status(200).json({
      rawDfBlobUrl: rawRef,
      sessionId,
      columns: columnMeta(rows, keepMap),
      productCount: countProducts(rows),
      fileName: filename,
      sheetName: null,
      sheets: null,
      fileHash,
      catSrcCol: preferredCategoryColumn(cols),
      preview: clicksSortedPreview(rows),
    })
  } catch (err) {
    sendError(res, err)
  }
}
