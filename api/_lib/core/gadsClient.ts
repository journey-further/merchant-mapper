import type { Row } from './feedProcessor.js'

const GADS_REST_BASE = 'https://googleads.googleapis.com/v23'
const QPS_SLEEP_MS = 1200
const MONTHS = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER']

export interface GadsCredentials {
  developerToken: string
  clientId: string
  clientSecret: string
  refreshToken: string
  loginCustomerId?: string
  customerId: string
}

function normId(x: string): string {
  return x.replace(/-/g, '').trim()
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function getAccessToken(creds: GadsCredentials): Promise<string> {
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      refresh_token: creds.refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  if (!resp.ok) throw new Error(`OAuth token exchange failed: ${resp.status}`)
  const data = await resp.json() as { access_token: string }
  return data.access_token
}

function buildHeaders(creds: GadsCredentials, accessToken: string): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'developer-token': creds.developerToken,
    'Content-Type': 'application/json',
  }
  if (creds.loginCustomerId) h['login-customer-id'] = normId(creds.loginCustomerId)
  return h
}

export function getGadsCredentials(): GadsCredentials {
  const env = process.env
  const developerToken = env.GOOGLE_ADS_DEVELOPER_TOKEN ?? ''
  const clientId = env.GOOGLE_ADS_CLIENT_ID ?? ''
  const clientSecret = env.GOOGLE_ADS_CLIENT_SECRET ?? ''
  const refreshToken = env.GOOGLE_ADS_REFRESH_TOKEN ?? ''
  const loginCustomerId = env.GOOGLE_ADS_LOGIN_CUSTOMER_ID
  const customerId = normId(env.GOOGLE_ADS_CLIENT_CUSTOMER_ID ?? env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? '')

  if (!developerToken || !clientId || !clientSecret || !refreshToken || !customerId) {
    throw new Error('Missing Google Ads credentials — set GOOGLE_ADS_* env vars')
  }
  return { developerToken, clientId, clientSecret, refreshToken, loginCustomerId, customerId }
}

function* batched<T>(items: T[], size: number): Generator<T[]> {
  for (let i = 0; i < items.length; i += size) yield items.slice(i, i + size)
}

export async function fetchHistoricalMetrics(
  creds: GadsCredentials,
  keywords: string[],
  geoIds: string[],
  languageId: string,
  batchSize = 700,
): Promise<Row[]> {
  if (!keywords.length) return []

  const url = `${GADS_REST_BASE}/customers/${creds.customerId}:generateKeywordHistoricalMetrics`
  const outRows: Row[] = []

  for (const chunk of batched(keywords, batchSize)) {
    await sleep(QPS_SLEEP_MS)
    let accessToken = await getAccessToken(creds)

    const body = {
      keywords: chunk,
      keywordPlanNetwork: 'GOOGLE_SEARCH',
      language: `languageConstants/${languageId}`,
      geoTargetConstants: geoIds.map(id => `geoTargetConstants/${id}`),
    }

    let attempts = 0
    let respData: { results?: unknown[] } = {}
    while (true) {
      const resp = await fetch(url, {
        method: 'POST',
        headers: buildHeaders(creds, accessToken),
        body: JSON.stringify(body),
      })

      if (resp.status === 429 || resp.status >= 500) {
        attempts++
        if (attempts > 8) throw new Error(`GAds rate limit after ${attempts} attempts`)
        await sleep(Math.min(60000, 4000 * Math.pow(2, attempts - 1)) + Math.random() * 1000)
        accessToken = await getAccessToken(creds)
        continue
      }
      if (!resp.ok) throw new Error(`GAds API error: ${resp.status} ${await resp.text()}`)
      respData = await resp.json() as typeof respData
      break
    }

    for (const r of (respData.results ?? []) as Record<string, unknown>[]) {
      const text = String(r.text ?? '').toLowerCase().trim()
      const closeVariants = (r.closeVariants as string[] | null) ?? []
      const km = (r.keywordMetrics ?? {}) as Record<string, unknown>
      const aliases = [text, ...closeVariants.map(v => v.toLowerCase().trim())]
      const avgMs = km.avgMonthlySearches != null ? parseInt(String(km.avgMonthlySearches)) : null
      const compIdx = km.competitionIndex != null ? parseInt(String(km.competitionIndex)) : null
      const monthlyVolumes = (km.monthlySearchVolumes as Record<string, unknown>[] | null) ?? []

      const base: Row = {
        canonical_keyword: text,
        close_variants: closeVariants.join(', '),
        avg_monthly_searches: avgMs != null ? String(avgMs) : '',
        competition_index: compIdx != null ? String(compIdx) : '',
        competition_level: String(km.competition ?? ''),
      }

      const rows = monthlyVolumes.length
        ? monthlyVolumes.map(mv => {
            const monthName = String(mv.month ?? 'JANUARY')
            const monthNum = MONTHS.indexOf(monthName) + 1
            return { ...base, year: String(mv.year ?? ''), month: String(monthNum), monthly_searches: String(mv.monthlySearches ?? '') }
          })
        : [{ ...base, year: '', month: '', monthly_searches: '' }]

      for (const row of rows) {
        for (const alias of aliases) {
          outRows.push({ ...row, keyword_norm: alias })
        }
      }
    }
  }

  return outRows
}
