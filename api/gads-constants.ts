import type { VercelRequest, VercelResponse } from '@vercel/node'
import fs from 'node:fs'
import path from 'node:path'
import Papa from 'papaparse'

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const base = path.join(process.cwd(), 'api/_lib/gads_exports')
    const countriesPath = path.join(base, 'geo_target_countries.csv')
    const languagesPath = path.join(base, 'language_constants.csv')

    if (!fs.existsSync(countriesPath) || !fs.existsSync(languagesPath)) {
      return res.status(200).json({ countries: [], languages: [] })
    }

    const countriesRaw = fs.readFileSync(countriesPath, 'utf8')
    const languagesRaw = fs.readFileSync(languagesPath, 'utf8')

    const { data: allCountries } = Papa.parse<Record<string, string>>(countriesRaw, { header: true, skipEmptyLines: true })
    const { data: allLanguages } = Papa.parse<Record<string, string>>(languagesRaw, { header: true, skipEmptyLines: true })

    const countries = allCountries
      .filter(r => (r.status ?? '').toUpperCase() === 'ENABLED')
      .map(r => ({ criteriaId: r.id ?? r.criteria_id, countryCode: r.country_code, name: r.name }))

    const languages = allLanguages
      .map(r => ({ languageId: r.id ?? r.language_id, name: r.name, code: r.language_code ?? r.code }))

    res.status(200).json({ countries, languages })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
}
