import { useEffect, useMemo, useState } from 'react';
import { Button } from '@journey-further/salient-ui/ui/button';
import { applyColourMapping } from '../../lib/api';
import { useWorkflowStore } from '../../store/workflowStore';
import SectionShell from '../shared/SectionShell';

export default function ColourMapping() {
  const {
    sessionId,
    rawDfBlobUrl,
    keepMap,
    filters,
    colourCol,
    setColourMapBlobUrl,
  } = useWorkflowStore();
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Awaited<ReturnType<typeof applyColourMapping>> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const rows = useMemo(
    () => result?.unmapped ?? [],
    [result]
  );

  useEffect(() => {
    if (!rows.length) return;
    setOverrides((current) => {
      const next = { ...current };
      for (const row of rows) {
        if (!next[row.productColour] && row.suggestion) {
          next[row.productColour] = row.suggestion;
        }
      }
      return next;
    });
  }, [rows]);

  async function runMapping() {
    if (!sessionId || !rawDfBlobUrl || !colourCol) return;
    setLoading(true);
    setError('');
    try {
      const response = await applyColourMapping({
        session: sessionId,
        rawDfUrl: rawDfBlobUrl,
        keepMap,
        filters,
        colourCol,
        overrides: Object.entries(overrides).map(([productColour, genericColour]) => ({
          productColour,
          genericColour,
        })),
      });
      setResult(response);
      setColourMapBlobUrl(response.colourMapBlobUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to build colour mapping');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SectionShell title="Colour Mapping">
      {!colourCol ? (
        <p className="text-sm text-muted-foreground">
          Pick a colour column above to review and normalise colour values.
        </p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-muted-foreground">
              Normalise colours from <span className="font-medium text-foreground">{colourCol}</span>.
            </p>
            <Button size="sm" onClick={() => void runMapping()} disabled={loading}>
              {loading ? 'Running…' : result ? 'Rebuild mapping' : 'Analyse mapping'}
            </Button>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          {result && (
            <>
              <div className="grid gap-3 md:grid-cols-4">
                <Metric label="Eligible" value={result.breakdown.eligible} />
                <Metric label="Currently mapped" value={result.breakdown.currentlyMapped} />
                <Metric label="Newly mapped" value={result.breakdown.newlyMapped} />
                <Metric label="% mapped" value={`${result.breakdown.pctMapped}%`} />
              </div>

              {!!rows.length && (
                <div className="space-y-3">
                  <p className="text-sm font-medium">Unmapped colours</p>
                  <div className="space-y-2">
                    {rows.map((row) => (
                      <div key={row.productColour} className="grid gap-2 rounded-md border p-3 md:grid-cols-[1fr,220px] md:items-center">
                        <div>
                          <p className="text-sm font-medium">{row.productColour}</p>
                          {row.suggestion && (
                            <p className="text-xs text-muted-foreground">Suggestion: {row.suggestion}</p>
                          )}
                        </div>
                        <select
                          className="rounded-md border bg-background px-3 py-2 text-sm"
                          value={overrides[row.productColour] ?? ''}
                          onChange={(e) =>
                            setOverrides((current) => ({
                              ...current,
                              [row.productColour]: e.target.value,
                            }))
                          }
                        >
                          <option value="">Leave unmapped</option>
                          {result.allowedGeneric.map((choice) => (
                            <option key={choice} value={choice}>
                              {choice}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </SectionShell>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}
