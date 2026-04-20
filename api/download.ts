import type { VercelRequest, VercelResponse } from '@vercel/node'
import ExcelJS from 'exceljs'
import { loadRows } from '../api/_lib/sessionStore'
import { getProcessedRows } from '../api/_lib/pipeline'
import { computeOpportunity, computeSalesOpportunity } from '../api/_lib/core/gadsOpportunity'
import type { Row } from '../api/_lib/core/feedProcessor'

type DownloadType = 'normalised' | 'keywords-combined' | 'gads-metrics' | 'sales-opportunity' | 'raw'
type DownloadFormat = 'csv' | 'xlsx'

function toCsvBytes(rows: Row[]): Buffer {
  if (!rows.length) return Buffer.from('\uFEFF')
  const cols = Object.keys(rows[0])
  const lines = [cols.join(','), ...rows.map(r => cols.map(c => `"${String(r[c] ?? '').replace(/"/g, '""')}"`).join(','))]
  return Buffer.from('\uFEFF' + lines.join('\n'), 'utf8')
}

async function toXlsxBytes(rows: Row[], sheetName = 'Sheet1'): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(sheetName)
  if (!rows.length) return Buffer.from(await wb.xlsx.writeBuffer())
  const cols = Object.keys(rows[0])
  ws.addRow(cols)
  for (const row of rows) ws.addRow(cols.map(c => row[c] ?? ''))
  return Buffer.from(await wb.xlsx.writeBuffer())
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { type, format = 'csv', rawDfUrl, combinedDfUrl, gadsDfBlobUrl, state } = req.query as Record<string, string>
    const params = state ? JSON.parse(state) : {}
    const dlType = type as DownloadType
    const dlFormat = format as DownloadFormat

    let rows: Row[] = []
    let sheetName = 'Export'

    if (dlType === 'raw' && rawDfUrl) {
      rows = await loadRows(rawDfUrl)
      sheetName = 'Raw Feed'
    } else if (dlType === 'normalised' && rawDfUrl) {
      rows = await getProcessedRows(await loadRows(rawDfUrl), params)
      sheetName = 'Normalised Feed'
    } else if (dlType === 'keywords-combined' && combinedDfUrl) {
      rows = await loadRows(combinedDfUrl)
      sheetName = 'Keywords'
    } else if ((dlType === 'gads-metrics' || dlType === 'sales-opportunity') && combinedDfUrl && gadsDfBlobUrl) {
      const [combined, gads] = await Promise.all([loadRows(combinedDfUrl), loadRows(gadsDfBlobUrl)])
      rows = computeOpportunity(combined, gads)
      if (dlType === 'sales-opportunity') rows = computeSalesOpportunity(rows)
      sheetName = dlType === 'sales-opportunity' ? 'Sales Opportunity' : 'GAds Metrics'
    } else {
      return res.status(400).json({ error: 'Invalid download parameters' })
    }

    const filename = `${sheetName.toLowerCase().replace(/\s+/g, '-')}.${dlFormat}`

    if (dlFormat === 'xlsx') {
      const buf = await toXlsxBytes(rows, sheetName)
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
      return res.send(buf)
    }

    const buf = toCsvBytes(rows)
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    return res.send(buf)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
}
