import type { VercelRequest, VercelResponse } from '@vercel/node'
import ExcelJS from 'exceljs'
import { loadRows } from '../api/_lib/sessionStore.js'
import { getProcessedRows } from '../api/_lib/pipeline.js'
import { computeOpportunity, computeSalesOpportunity } from '../api/_lib/core/gadsOpportunity.js'
import type { Row } from '../api/_lib/core/feedProcessor.js'

type DownloadType = 'normalised' | 'keywords-combined' | 'gads-metrics' | 'sales-opportunity' | 'raw' | 'combined-report'
type DownloadFormat = 'csv' | 'xlsx'

function toCsvBytes(rows: Row[]): Buffer {
  if (!rows.length) return Buffer.from('\uFEFF')
  const cols = Object.keys(rows[0])
  const lines = [cols.join(','), ...rows.map(r => cols.map(c => `"${String(r[c] ?? '').replace(/"/g, '""')}"`).join(','))]
  return Buffer.from('\uFEFF' + lines.join('\n'), 'utf8')
}

const MONTH_ORDER = ['January','February','March','April','May','June','July','August','September','October','November','December']

// Column names (normalised: lowercase, non-alphanumeric stripped) that should be numeric cells.
const NUMERIC_COL_PATTERNS = [
  /price/, /quantity/, /clicks/, /searches/, /weight/,
  /count/, /salesvalue/, /opportunityscore/, /competitionindex/,
]

function normColName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function isNumericCol(col: string): boolean {
  const n = normColName(col)
  return NUMERIC_COL_PATTERNS.some(p => p.test(n))
}

function coerceCell(value: unknown, numeric: boolean): string | number {
  const str = String(value ?? '').trim()
  if (!numeric) return str
  // Strip trailing currency codes e.g. "149.00 USD"
  const num = parseFloat(str.replace(/[^0-9.\-]/g, ''))
  return isNaN(num) ? str : num
}

function addRowsToSheet(ws: ExcelJS.Worksheet, rows: Row[]): void {
  if (!rows.length) return
  const cols = Object.keys(rows[0])
  const numericFlags = cols.map(isNumericCol)
  ws.addRow(cols)
  for (const row of rows) ws.addRow(cols.map((c, i) => coerceCell(row[c], numericFlags[i])))
}

function buildTimeSeries(combined: Row[], gads: Row[]): {
  chronRows: Record<string, unknown>[]
  seasonRows: Record<string, unknown>[]
  lists: string[]
} {
  const gadsMap = new Map<string, Row[]>()
  for (const r of gads) {
    const kn = String(r.keyword_norm ?? '').toLowerCase().trim()
    if (!gadsMap.has(kn)) gadsMap.set(kn, [])
    gadsMap.get(kn)!.push(r)
  }

  const chronMap = new Map<string, Map<string, number>>() // list → dateKey → sum
  const seasonMap = new Map<string, Map<string, number>>() // list → monthName → sum
  const dateKeys = new Set<string>()
  const listNames = new Set<string>()

  for (const row of combined) {
    const kn = String(row.keyword ?? '').toLowerCase().trim()
    const ln = String(row.list_name ?? '')
    for (const gr of gadsMap.get(kn) ?? []) {
      const year = parseInt(String(gr.year ?? ''))
      const month = parseInt(String(gr.month ?? ''))
      const searches = parseFloat(String(gr.monthly_searches ?? ''))
      if (isNaN(year) || isNaN(month) || isNaN(searches)) continue
      const dateKey = `${year}-${String(month).padStart(2, '0')}`
      const monthName = MONTH_ORDER[month - 1] ?? 'January'
      listNames.add(ln)
      dateKeys.add(dateKey)
      if (!chronMap.has(ln)) chronMap.set(ln, new Map())
      chronMap.get(ln)!.set(dateKey, (chronMap.get(ln)!.get(dateKey) ?? 0) + searches)
      if (!seasonMap.has(ln)) seasonMap.set(ln, new Map())
      seasonMap.get(ln)!.set(monthName, (seasonMap.get(ln)!.get(monthName) ?? 0) + searches)
    }
  }

  const lists = [...listNames].sort()
  const sortedDates = [...dateKeys].sort()

  const chronRows = sortedDates.map(dk => {
    const [y, m] = dk.split('-')
    const row: Record<string, unknown> = { Date: `${y}-${m}-01` }
    for (const ln of lists) row[ln] = chronMap.get(ln)?.get(dk) ?? null
    return row
  })

  const seasonPeak = new Map(lists.map(ln => {
    const vals = [...(seasonMap.get(ln)?.values() ?? [])]
    return [ln, Math.max(...vals, 1)]
  }))

  const seasonRows = MONTH_ORDER.map(mn => {
    const row: Record<string, unknown> = { Month: mn }
    for (const ln of lists) {
      const v = seasonMap.get(ln)?.get(mn)
      row[ln] = v != null ? Math.round((v / seasonPeak.get(ln)!) * 1000) / 10 : null
    }
    return row
  })

  return { chronRows, seasonRows, lists }
}

function addRawTableToSheet(ws: ExcelJS.Worksheet, rows: Record<string, unknown>[], startRow = 1): number {
  if (!rows.length) return startRow
  const cols = Object.keys(rows[0])
  ws.getRow(startRow).values = ['', ...cols]
  let r = startRow + 1
  for (const row of rows) {
    ws.getRow(r).values = ['', ...cols.map(c => row[c] ?? null)]
    r++
  }
  return r
}

async function toXlsxBytes(rows: Row[], sheetName = 'Sheet1'): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(sheetName)
  addRowsToSheet(ws, rows)
  return Buffer.from(await wb.xlsx.writeBuffer())
}

async function toCombinedXlsxBytes(
  salesRows: Row[],
  gadsRows: Row[],
  combined: Row[],
  gads: Row[],
  normalisedRows: Row[],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()

  const wsSales = wb.addWorksheet('Sales Opportunity')
  addRowsToSheet(wsSales, salesRows)

  const wsGads = wb.addWorksheet('GAds Metrics')
  addRowsToSheet(wsGads, gadsRows)

  const wsVol = wb.addWorksheet('Volume')
  const { chronRows, seasonRows } = buildTimeSeries(combined, gads)
  wsVol.getRow(1).getCell(1).value = 'Chronological search volume'
  const afterChron = addRawTableToSheet(wsVol, chronRows, 2)
  wsVol.getRow(afterChron + 1).getCell(1).value = 'Seasonal search volume'
  addRawTableToSheet(wsVol, seasonRows, afterChron + 2)

  const wsNorm = wb.addWorksheet('Normalised Feed')
  addRowsToSheet(wsNorm, normalisedRows)

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
    } else if (dlType === 'combined-report' && rawDfUrl && combinedDfUrl && gadsDfBlobUrl) {
      const [rawRows, combined, gads] = await Promise.all([
        loadRows(rawDfUrl),
        loadRows(combinedDfUrl),
        loadRows(gadsDfBlobUrl),
      ])
      const opportunity = computeOpportunity(combined, gads)
      const salesRows = computeSalesOpportunity(opportunity)
      const normalisedRows = await getProcessedRows(rawRows, params)
      const buf = await toCombinedXlsxBytes(salesRows, opportunity, combined, gads, normalisedRows)
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      res.setHeader('Content-Disposition', 'attachment; filename="combined-report.xlsx"')
      return res.send(buf)
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
