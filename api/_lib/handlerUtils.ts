import type { VercelRequest, VercelResponse } from '@vercel/node'
import { findClicksCol } from './core/feedProcessor.js'
import type { Row } from './core/feedProcessor.js'

export function send(res: VercelResponse, status: number, body: unknown) {
  res.status(status).json(body)
}

export function sendError(res: VercelResponse, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err)
  res.status(500).json({ error: msg })
}

export function requireMethod(req: VercelRequest, res: VercelResponse, method: string): boolean {
  if (req.method !== method) {
    res.status(405).json({ error: `Method ${req.method} not allowed` })
    return false
  }
  return true
}

export function columnMeta(rows: Row[], keepMap: Record<string, boolean>) {
  if (!rows.length) return []
  const cols = Object.keys(rows[0])
  const clicksCol = findClicksCol(cols)
  const sampleRow = clicksCol
    ? [...rows].sort((a, b) => {
        const an = parseFloat(a[clicksCol] ?? '0') || 0
        const bn = parseFloat(b[clicksCol] ?? '0') || 0
        return bn - an
      })[0]
    : rows[0]

  return cols.map(col => ({
    column: col,
    keep: keepMap[col] ?? false,
    example: sampleRow[col] ?? '',
    unique: new Set(rows.map(r => r[col])).size,
  }))
}

export function records(rows: Row[], limit = 100): Row[] {
  return rows.slice(0, limit).map(row =>
    Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v ?? '']))
  )
}

export function clicksSortedPreview(rows: Row[], limit = 100): Row[] {
  const cols = rows.length ? Object.keys(rows[0]) : []
  const clicksCol = findClicksCol(cols)
  if (!clicksCol) return records(rows, limit)
  return [...rows]
    .sort((a, b) => (parseFloat(b[clicksCol] ?? '0') || 0) - (parseFloat(a[clicksCol] ?? '0') || 0))
    .slice(0, limit)
    .map(row => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v ?? ''])))
}
