/**
 * Quick smoke test: read a local TSV, run the parse pipeline, save to Neon.
 * Usage: npx tsx scripts/test-parse.ts [path-to-tsv]
 */
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import Papa from 'papaparse'
import { deriveAgeGenderSegment, defaultKeepMap, countProducts } from '../api/_lib/core/feedProcessor'
import { preferredCategoryColumn } from '../api/_lib/core/categoryExtraction'
import { getOrCreateSession, saveRows, loadRows } from '../api/_lib/sessionStore'
import type { Row } from '../api/_lib/core/feedProcessor'

const filePath = process.argv[2] ?? 'hobbs_products_2026-02-27_10_35_43.tsv'
console.log(`Reading: ${filePath}`)

const text = readFileSync(filePath, 'utf-8')
const fileHash = createHash('md5').update(text).digest('hex')
const filename = filePath.split(/[\\/]/).pop() ?? filePath
const delimiter = filename.endsWith('.tsv') || filename.endsWith('.txt') ? '\t' : ','

const { data, errors } = Papa.parse<Row>(text, {
  header: true,
  delimiter,
  skipEmptyLines: true,
  transformHeader: (h: string) => h.trim().replace(/\s+/g, ' '),
})

if (errors.length && !data.length) {
  console.error('Parse error:', errors[0].message)
  process.exit(1)
}

console.log(`Parsed ${data.length} rows, ${Object.keys(data[0] ?? {}).length} columns`)
console.log('Columns:', Object.keys(data[0] ?? {}).slice(0, 8).join(', '), '...')

let rows = data as Row[]
rows = deriveAgeGenderSegment(rows)

console.log('\nSaving to Neon...')
const sessionId = await getOrCreateSession(fileHash, filename)
console.log(`Session ID: ${sessionId}`)

const rawRef = await saveRows(sessionId, 'raw', rows)
console.log(`Saved raw rows → ${rawRef}`)

console.log('\nReading back from Neon...')
const loaded = await loadRows(rawRef)
console.log(`Loaded ${loaded.length} rows ✓`)

console.log(`Product count: ${countProducts(rows)}`)
console.log(`Preferred category column: ${preferredCategoryColumn(Object.keys(rows[0] ?? {}))}`)
console.log(`\n✓ All done`)
