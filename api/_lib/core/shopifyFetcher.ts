import { norm } from './utils.js'
import type { Row } from './feedProcessor.js'

const MAX_PAGES = 50
const PAGE_SIZE = 250

const RECOMMENDED_SHOPIFY = new Set([
  'title', 'id', 'item group id', 'price', 'sale price',
  'availability', 'condition', 'brand', 'product type',
  'color', 'size', 'material', 'image link', 'additional image link', 'link', 'tags',
])

const CORE_COLUMNS = new Set([
  'id', 'item group id', 'title', 'description', 'price', 'sale price',
  'availability', 'condition', 'brand', 'product type', 'link',
  'image link', 'additional image link', 'tags',
  'shopify product id', 'shopify variant id', 'weight kg', 'published at',
])

const COLOUR_TOKENS = new Set(['colour', 'color', 'fabric', 'finish', 'upholstery', 'colourway', 'colourways'])
const SIZE_TOKENS = new Set(['size', 'sizeoption', 'sizeoptions', 'sizes'])
const MATERIAL_TOKENS = new Set(['material', 'materials'])

function optionColName(raw: string): string {
  const n = norm(raw)
  if (COLOUR_TOKENS.has(n) || [...COLOUR_TOKENS].some(t => n.includes(t))) return 'color'
  if (SIZE_TOKENS.has(n) || [...SIZE_TOKENS].some(t => n.includes(t))) return 'size'
  if (MATERIAL_TOKENS.has(n) || [...MATERIAL_TOKENS].some(t => n.includes(t))) return 'material'
  return raw.trim().toLowerCase()
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function detectCurrency(storeUrl: string): string {
  const host = storeUrl.toLowerCase()
  if (host.includes('.co.uk') || host.endsWith('.uk')) return 'GBP'
  if (host.includes('.com.au')) return 'AUD'
  if (host.includes('.ca') && !host.includes('.com')) return 'CAD'
  if (host.includes('.eu')) return 'EUR'
  return 'USD'
}

function fmtPrice(raw: string | number | null | undefined, currency: string): string {
  if (raw == null || raw === '') return ''
  const n = parseFloat(String(raw))
  if (isNaN(n) || n < 0) return ''
  return `${n.toFixed(2)} ${currency}`
}

function normaliseUrl(storeUrl: string): string {
  let url = storeUrl.trim().replace(/\/$/, '')
  if (!url.startsWith('http')) url = 'https://' + url
  return url
}

async function fetchPage(storeUrl: string, page: number): Promise<Record<string, unknown>[]> {
  const url = `${storeUrl}/products.json?limit=${PAGE_SIZE}&page=${page}`
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'MerchantMapper/1.0', Accept: 'application/json' },
  })
  if (resp.status === 401) throw new Error('Store is password-protected — products are not publicly accessible.')
  if (resp.status === 404) throw new Error(`No products catalogue found at ${storeUrl}. Check the URL.`)
  if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching ${storeUrl}`)
  const data = await resp.json() as { products?: unknown[] }
  if (!Array.isArray(data.products)) throw new Error('Response did not contain a products array — is this a Shopify store?')
  return data.products as Record<string, unknown>[]
}

export async function fetchShopifyProducts(storeUrl: string): Promise<Row[]> {
  storeUrl = normaliseUrl(storeUrl)
  const currency = detectCurrency(storeUrl)
  const allProducts: Record<string, unknown>[] = []

  for (let page = 1; page <= MAX_PAGES; page++) {
    const products = await fetchPage(storeUrl, page)
    allProducts.push(...products)
    if (products.length < PAGE_SIZE) break
  }

  if (!allProducts.length) throw new Error(`No products found at ${storeUrl}.`)

  const rows: Row[] = []

  for (const product of allProducts) {
    const productId = String(product.id ?? '')
    const handle = String(product.handle || productId)
    const title = String(product.title ?? '')
    const description = stripHtml(String(product.body_html ?? ''))
    const vendor = String(product.vendor ?? '')
    const productType = String(product.product_type ?? '')
    const tagsRaw = product.tags
    const tags = Array.isArray(tagsRaw) ? tagsRaw.join(', ') : String(tagsRaw ?? '')
    const publishedAt = String(product.published_at ?? '')

    const images = (product.images as Record<string, unknown>[] | null) ?? []
    const imageLink = images[0] ? String((images[0] as Record<string, unknown>).src ?? '') : ''
    const additionalImageLink = images.slice(1).map(i => String((i as Record<string, unknown>).src ?? '')).filter(Boolean).join(',')

    const optionMap = new Map<number, string>()
    for (const opt of (product.options as Record<string, unknown>[] | null) ?? []) {
      const pos = (parseInt(String(opt.position ?? 1)) || 1) - 1
      optionMap.set(pos, optionColName(String(opt.name ?? '')))
    }

    for (const variant of (product.variants as Record<string, unknown>[] | null) ?? []) {
      const variantId = String(variant.id ?? '')
      const sku = String(variant.sku ?? '').trim() || `${handle}_${variantId}`
      const variantTitle = String(variant.title ?? '')
      const fullTitle = variantTitle && variantTitle.toLowerCase() !== 'default title'
        ? `${title} - ${variantTitle}` : title

      const rawPrice = String(variant.price ?? '')
      const rawCompare = String(variant.compare_at_price ?? '')
      const p = parseFloat(rawPrice) || 0
      const c = parseFloat(rawCompare) || 0
      const priceStr = c && c > p ? fmtPrice(c, currency) : fmtPrice(p, currency)
      const salePriceStr = c && c > p ? fmtPrice(p, currency) : ''

      const availability = variant.available ? 'in stock' : 'out of stock'
      const grams = parseFloat(String(variant.grams ?? variant.weight_grams ?? 0)) || 0
      const weightKg = grams / 1000

      const row: Row = {
        id: sku, 'item group id': handle, title: fullTitle, description,
        price: priceStr, 'sale price': salePriceStr, availability, condition: 'new',
        brand: vendor, 'product type': productType,
        link: `${storeUrl}/products/${handle}?variant=${variantId}`,
        'image link': imageLink, 'additional image link': additionalImageLink, tags,
        'shopify product id': productId, 'shopify variant id': variantId,
        'weight kg': weightKg > 0 ? weightKg.toFixed(2) : '',
        'published at': publishedAt,
      }

      for (const [pos, colName] of optionMap) {
        if (CORE_COLUMNS.has(colName)) continue
        row[colName] = String(variant[`option${pos + 1}`] ?? '')
      }

      rows.push(row)
    }
  }

  return rows
}

export function shopifyKeepMap(columns: string[]): Record<string, boolean> {
  const recNorm = new Set([...RECOMMENDED_SHOPIFY].map(norm))
  return Object.fromEntries(columns.map(c => [c, recNorm.has(norm(c))]))
}
