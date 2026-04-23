import type { VercelRequest, VercelResponse } from '@vercel/node'
import crypto from 'node:crypto'
import Papa from 'papaparse'
import { unzipSync } from 'fflate'
import { sendError } from '../api/_lib/handlerUtils.js'
import { deriveAgeGenderSegment, defaultKeepMap, countProducts } from '../api/_lib/core/feedProcessor.js'
import { preferredCategoryColumn } from '../api/_lib/core/categoryExtraction.js'
import { columnMeta, clicksSortedPreview } from '../api/_lib/handlerUtils.js'
import { getOrCreateSession, saveRows } from '../api/_lib/sessionStore.js'
import type { Row } from '../api/_lib/core/feedProcessor.js'

function extractFromZip(buffer: Uint8Array): { text: string; innerFilename: string } {
  const files = unzipSync(buffer)
  const entry = Object.entries(files).find(([name]) =>
    /\.(tsv|csv|txt)$/i.test(name)
  )
  if (!entry) throw new Error('No TSV/CSV file found inside ZIP')
  const [innerFilename, data] = entry
  return { text: new TextDecoder('utf-8').decode(data), innerFilename }
}

const ZIP_MAGIC = 0x504b0304

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { blobUrl, filename = 'file' } = req.body as { blobUrl: string; filename?: string }

    const token = process.env.BLOB_READ_WRITE_TOKEN ?? ''
    const resp = await fetch(blobUrl, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!resp.ok) throw new Error(`Failed to fetch blob: ${resp.status}`)

    const buffer = new Uint8Array(await resp.arrayBuffer())
    const isZip =
      String(filename).toLowerCase().endsWith('.zip') ||
      (buffer.length >= 4 &&
        (buffer[0] | (buffer[1] << 8) | (buffer[2] << 16) | (buffer[3] << 24)) >>> 0 === ZIP_MAGIC >>> 0)

    let text: string
    let effectiveFilename: string
    if (isZip) {
      const extracted = extractFromZip(buffer)
      text = extracted.text
      effectiveFilename = extracted.innerFilename
    } else {
      text = new TextDecoder('utf-8').decode(buffer)
      effectiveFilename = filename
    }

    const fileHash = crypto.createHash('md5').update(text).digest('hex')

    const ext = String(effectiveFilename).toLowerCase()
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
