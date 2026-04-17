import { useEffect, useMemo, useState } from 'react';
import { Button } from '../../ui/button';
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

  const rows = useMemo(() => result?.unmapped ?? [], [result]);

  // Auto-run the initial analysis whenever colourCol changes.
  useEffect(() => {
    if (!colourCol || !sessionId || !rawDfBlobUrl) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    setResult(null);
    setOverrides({});
    applyColourMapping({
      session: sessionId,
      rawDfUrl: rawDfBlobUrl,
      keepMap,
      filters,
      colourCol,
      overrides: [],
    })
      .then((response) => {
        if (cancelled) return;
        setResult(response);
        setColourMapBlobUrl(response.colourMapBlobUrl);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to build colour mapping');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  // keepMap and filters are intentionally excluded — they are stable within a
  // session and should not re-trigger a fresh analysis independently.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colourCol, sessionId, rawDfBlobUrl]);

  // Compute live progress stats as the user selects overrides — mirrors the
  // legacy JS renderPreview() logic from Product Eater.
  const progress = useMemo(() => {
    if (!result) return null;
    const { breakdown } = result;
    let pending = 0;
    for (const row of rows) {
      if (overrides[row.productColour]) {
        pending += row.productCount;
      }
    }
    const currently = breakdown.currentlyMapped;
    const newly = breakdown.newlyMapped + pending;
    const unmapped = Math.max(breakdown.unmapped - pending, 0);
    const eligible = breakdown.eligible;
    const pctC = eligible ? (currently / eligible) * 100 : 0;
    const pctN = eligible ? (newly / eligible) * 100 : 0;
    const pctU = eligible ? (unmapped / eligible) * 100 : 0;
    return {
      currently,
      newly,
      unmapped,
      eligible,
      pctMapped: pctC + pctN,
      pctCurrently: pctC,
      pctNewly: pctN,
      pctUnmapped: pctU,
    };
  }, [result, rows, overrides]);

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
        overrides: Object.entries(overrides)
          .filter(([, v]) => v)
          .map(([productColour, genericColour]) => ({ productColour, genericColour })),
      });
      setResult(response);
      setColourMapBlobUrl(response.colourMapBlobUrl);
      setOverrides({});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to build colour mapping');
    } finally {
      setLoading(false);
    }
  }

  function acceptAllSuggestions() {
    const next = { ...overrides };
    for (const row of rows) {
      if (row.suggestion) {
        next[row.productColour] = row.suggestion;
      }
    }
    setOverrides(next);
  }

  const fmt = (n: number) => n.toLocaleString('en-GB');

  return (
    <SectionShell title="Colour Mapping">
      <p className="text-sm text-muted-foreground">
        Group brand-specific colour names into generic colours. e.g. &ldquo;midnight panther&rdquo; &rarr; &ldquo;black&rdquo;.
      </p>

      {!colourCol ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Pick a colour column above to review and normalise colour values.
        </p>
      ) : loading && !result ? (
        <p className="mt-3 text-sm text-muted-foreground">Analysing colour mapping&hellip;</p>
      ) : error && !result ? (
        <p className="mt-3 text-sm text-destructive">{error}</p>
      ) : result ? (
        <div className="mt-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            Map high-volume unmapped colours using the dropdowns below, then click Save.
          </p>

          {rows.length === 0 ? (
            <p className="text-sm text-green-600 dark:text-green-400">All colours are mapped.</p>
          ) : (
            <div className="overflow-hidden rounded-md border">
              <div className="max-h-[440px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur-sm">
                    <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2 text-right font-medium">Product Count</th>
                      <th className="px-3 py-2 text-left font-medium">Colour</th>
                      <th className="px-3 py-2 text-left font-medium">Suggestion</th>
                      <th className="px-3 py-2 text-left font-medium">Map to generic colour</th>
                      <th className="px-3 py-2 text-left font-medium">Accept suggestion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.productColour} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="px-3 py-2 text-right tabular-nums">{fmt(row.productCount)}</td>
                        <td className="px-3 py-2">{row.productColour}</td>
                        <td className="px-3 py-2">
                          {row.suggestion ? (
                            <span className="inline-block rounded-full border border-green-500 px-2 py-0.5 text-xs text-green-700 dark:text-green-400">
                              {row.suggestion}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">None</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <select
                            className="rounded-md border bg-background px-2 py-1 text-sm"
                            value={overrides[row.productColour] ?? ''}
                            onChange={(e) =>
                              setOverrides((curr) => ({
                                ...curr,
                                [row.productColour]: e.target.value,
                              }))
                            }
                          >
                            <option value="">Unmapped</option>
                            {result.allowedGeneric.map((g) => (
                              <option key={g} value={g}>
                                {g}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            className="rounded-md border px-3 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 enabled:hover:bg-muted"
                            disabled={!row.suggestion}
                            onClick={() => {
                              if (row.suggestion) {
                                setOverrides((curr) => ({
                                  ...curr,
                                  [row.productColour]: row.suggestion,
                                }));
                              }
                            }}
                          >
                            Accept suggestion
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Progress bar */}
          {progress && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                {progress.pctMapped.toFixed(2)}% mapped ({fmt(progress.currently + progress.newly)} /{' '}
                {fmt(progress.eligible)} colour values)
              </p>
              <div className="flex h-4 w-full overflow-hidden rounded-sm bg-zinc-800">
                <div
                  className="bg-teal-700 transition-all duration-150"
                  style={{ width: `${progress.pctCurrently.toFixed(4)}%` }}
                />
                <div
                  className="bg-lime-400 transition-all duration-150"
                  style={{ width: `${progress.pctNewly.toFixed(4)}%` }}
                />
              </div>
              <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-3 w-3 flex-shrink-0 rounded-sm bg-teal-700" />
                  Currently mapped: {fmt(progress.currently)}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-3 w-3 flex-shrink-0 rounded-sm bg-lime-400" />
                  Newly mapped: {fmt(progress.newly)}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-3 w-3 flex-shrink-0 rounded-sm bg-zinc-800" />
                  Unmapped: {fmt(progress.unmapped)}
                </span>
              </div>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex items-center gap-3">
            <Button size="sm" onClick={() => void runMapping()} disabled={loading}>
              {loading ? 'Saving…' : 'Save colour mappings'}
            </Button>
            {rows.length > 0 && (
              <Button size="sm" variant="outline" onClick={acceptAllSuggestions}>
                Accept all suggestions
              </Button>
            )}
          </div>
        </div>
      ) : null}
    </SectionShell>
  );
}
