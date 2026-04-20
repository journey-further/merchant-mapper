export const INVALIDS = new Set(['', 'nan', 'none', 'null', '<na>'])

export function norm(s: unknown): string {
  return String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function toNumber(v: unknown): number {
  const m = String(v ?? '').match(/[-+]?\d[\d,]*(?:\.\d+)?/)
  if (!m) return NaN
  return parseFloat(m[0].replace(/,/g, ''))
}

export function toCcy(v: unknown): string {
  const m = String(v ?? '').match(/\b([A-Z]{3})\b/)
  return m ? m[1] : ''
}

const CCY_SYMBOLS: Record<string, string> = {
  GBP: '£', EUR: '€', USD: '$', AUD: 'A$', CAD: 'C$', NZD: 'NZ$',
  JPY: '¥', CNY: '¥', CHF: 'Fr', SEK: 'kr', NOK: 'kr', DKK: 'kr',
  SGD: 'S$', HKD: 'HK$', MXN: 'MX$', BRL: 'R$', INR: '₹', ZAR: 'R',
  AED: 'د.إ', SAR: '﷼', KRW: '₩', TRY: '₺', PLN: 'zł', CZK: 'Kč', HUF: 'Ft',
}

export function currencySymbol(ccy: string): string {
  return CCY_SYMBOLS[ccy] ?? ccy
}

export function fmtInt(v: number): string {
  return Math.round(v).toLocaleString('en-GB')
}

export function fmtQty(v: number): string {
  return Number.isInteger(v) ? fmtInt(v) : v.toFixed(2)
}

export function fmtSales(v: number, ccy: string): string {
  return `${currencySymbol(ccy)}${fmtInt(v)}`
}

export function isBlank(v: unknown): boolean {
  return INVALIDS.has(String(v ?? '').toLowerCase().trim())
}
