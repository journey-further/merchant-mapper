import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getColourSummary } from '../../lib/api';
import { useWorkflowStore } from '../../store/workflowStore';
import SectionShell from '../shared/SectionShell';
import DataTable from '../shared/DataTable';

export default function ColourSummary() {
  const { sessionId, rawDfBlobUrl, keepMap, filters, colourCol, setColourCol } = useWorkflowStore();

  const query = useQuery({
    queryKey: ['colour-summary', sessionId, rawDfBlobUrl, keepMap, filters, colourCol],
    queryFn: () =>
      getColourSummary({
        session: sessionId!,
        rawDfUrl: rawDfBlobUrl!,
        keepMap,
        filters,
        colourCol: colourCol ?? undefined,
      }),
    enabled: !!sessionId && !!rawDfBlobUrl,
  });

  useEffect(() => {
    if (query.data?.colourCol && query.data.colourCol !== colourCol) {
      setColourCol(query.data.colourCol);
    }
  }, [colourCol, query.data?.colourCol, setColourCol]);

  return (
    <SectionShell title="Colour Summary" loading={query.isLoading} fetching={query.isFetching}>
      {query.error && <p className="text-sm text-destructive">Failed to load colour summary.</p>}

      {query.data && (
        <div className="space-y-4">
          {!query.data.colourCandidates.length ? (
            <p className="text-sm text-muted-foreground">No colour-like columns were found in the filtered feed.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-4">
                <label className="space-y-2 text-sm">
                  <span className="font-medium">Source colour column</span>
                  <select
                    className="block rounded-md border bg-background px-3 py-2"
                    value={query.data.colourCol}
                    onChange={(e) => setColourCol(e.target.value)}
                  >
                    {query.data.colourCandidates.map((candidate) => (
                      <option key={candidate} value={candidate}>
                        {candidate}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="text-sm text-muted-foreground">
                  {query.data.nonEmpty.toLocaleString()} rows have a non-empty colour value.
                </p>
              </div>

              <DataTable rows={query.data.valueCounts} maxHeight="320px" />
            </>
          )}
        </div>
      )}
    </SectionShell>
  );
}
