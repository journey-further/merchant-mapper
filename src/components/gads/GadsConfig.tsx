import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '../../ui/button';
import { getGadsConstants, fetchGadsVolumes } from '../../lib/api';
import { useWorkflowStore } from '../../store/workflowStore';
import SectionShell from '../shared/SectionShell';

const UK_CRITERIA_ID = '2826';
const ENGLISH_LANGUAGE_ID = '1000';

export default function GadsConfig() {
  const {
    sessionId,
    combinedDfBlobUrl,
    geoIds,
    languageId,
    setGeoIds,
    setLanguageId,
    setGadsDfBlobUrl,
  } = useWorkflowStore();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const query = useQuery({
    queryKey: ['gads-constants'],
    queryFn: () => getGadsConstants(),
  });

  // Single country value (first entry or UK default)
  const selectedCountry = geoIds[0] ?? UK_CRITERIA_ID;

  async function onFetch() {
    if (!combinedDfBlobUrl || !sessionId) return;
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const result = await fetchGadsVolumes({
        combinedDfBlobUrl,
        sessionId,
        geoIds: [selectedCountry],
        languageId,
      });
      setGadsDfBlobUrl(result.gadsDfBlobUrl);
      setSuccess(`Fetched ${result.rowCount.toLocaleString()} volume rows.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch Google Ads volumes.');
    } finally {
      setLoading(false);
    }
  }

  // Sort countries A-Z, but keep UK at the top
  const sortedCountries = query.data
    ? [...query.data.countries].sort((a, b) => {
        if (a.criteriaId === UK_CRITERIA_ID) return -1;
        if (b.criteriaId === UK_CRITERIA_ID) return 1;
        return a.name.localeCompare(b.name);
      })
    : [];

  return (
    <SectionShell title="Google Ads Search Volumes" loading={query.isLoading} fetching={query.isFetching}>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Fetch seasonal search volume history. Defaults to United Kingdom and English.
        </p>

        {!combinedDfBlobUrl && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            No keyword combinations generated yet. Complete the Keywords tab first.
          </div>
        )}

        {query.data && (
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="font-medium">Country</span>
              <select
                className="block w-full rounded-md border bg-background px-3 py-2"
                value={selectedCountry}
                onChange={(e) => setGeoIds([e.target.value])}
              >
                {sortedCountries.map((country) => (
                  <option key={country.criteriaId} value={country.criteriaId}>
                    {country.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-sm">
              <span className="font-medium">Language</span>
              <select
                className="block w-full rounded-md border bg-background px-3 py-2"
                value={languageId || ENGLISH_LANGUAGE_ID}
                onChange={(e) => setLanguageId(e.target.value)}
              >
                {query.data.languages.map((language) => (
                  <option key={language.languageId} value={language.languageId}>
                    {language.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        <div className="flex items-center gap-3">
          <Button
            size="sm"
            onClick={() => void onFetch()}
            disabled={loading || !combinedDfBlobUrl || !sessionId}
          >
            {loading ? 'Fetching…' : 'Fetch Google Ads volumes'}
          </Button>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {success && <p className="text-sm text-green-700">{success}</p>}
      </div>
    </SectionShell>
  );
}
