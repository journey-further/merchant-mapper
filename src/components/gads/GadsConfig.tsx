import { useQuery } from '@tanstack/react-query';
import { Button } from '@journey-further/salient-ui/ui/button';
import { getGadsConstants, uploadGadsFile } from '../../lib/api';
import { uploadFileToBlob } from '../../lib/blobUpload';
import { useWorkflowStore } from '../../store/workflowStore';
import SectionShell from '../shared/SectionShell';

export default function GadsConfig() {
  const {
    sessionId,
    geoIds,
    languageId,
    setGeoIds,
    setLanguageId,
    setGadsDfBlobUrl,
  } = useWorkflowStore();

  const query = useQuery({
    queryKey: ['gads-constants'],
    queryFn: () => getGadsConstants(),
  });

  async function onFileChange(file: File) {
    const blobUrl = await uploadFileToBlob(file);
    const result = await uploadGadsFile({ blobUrl, filename: file.name });
    setGadsDfBlobUrl(result.gadsDfBlobUrl);
  }

  return (
    <SectionShell title="Google Ads Config" loading={query.isLoading}>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Upload a historical metrics export to power the Google Ads results and charts.
        </p>

        {query.data && (
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm">
              <span className="font-medium">Countries</span>
              <select
                multiple
                className="h-40 w-full rounded-md border bg-background px-3 py-2"
                value={geoIds}
                onChange={(e) =>
                  setGeoIds(Array.from(e.target.selectedOptions).map((option) => option.value))
                }
              >
                {query.data.countries.map((country) => (
                  <option key={country.criteriaId} value={country.criteriaId}>
                    {country.name} ({country.countryCode})
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2 text-sm">
              <span className="font-medium">Language</span>
              <select
                className="block w-full rounded-md border bg-background px-3 py-2"
                value={languageId}
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

        <div className="rounded-md border p-4">
          <label className="block text-sm font-medium">Metrics export</label>
          <p className="mt-1 text-sm text-muted-foreground">
            Expected columns are the same as the old Flask app’s `gads_df` export, including `keyword_norm`, `year`, `month`, and `monthly_searches`.
          </p>
          <div className="mt-3">
            <Button asChild size="sm" variant="outline" disabled={!sessionId}>
              <label>
                Upload metrics file
                <input
                  type="file"
                  className="hidden"
                  accept=".csv,.xlsx,.xls,.tsv,.txt"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void onFileChange(file);
                    e.target.value = '';
                  }}
                />
              </label>
            </Button>
          </div>
        </div>
      </div>
    </SectionShell>
  );
}
