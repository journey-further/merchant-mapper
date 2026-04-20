import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getGroups } from '../../lib/api';
import { useWorkflowStore } from '../../store/workflowStore';
import SectionShell from '../shared/SectionShell';
import DataTable from '../shared/DataTable';

export default function ProductGroups() {
  const { sessionId, rawDfBlobUrl, filters, groupCol, setGroupCol } = useWorkflowStore();

  const query = useQuery({
    queryKey: ['groups', sessionId, rawDfBlobUrl, filters, groupCol],
    queryFn: () =>
      getGroups({
        session: sessionId!,
        rawDfUrl: rawDfBlobUrl!,
        filters,
        groupCol: groupCol ?? undefined,
      }),
    enabled: !!sessionId && !!rawDfBlobUrl,
  });

  useEffect(() => {
    if (query.data?.groupCol && query.data.groupCol !== groupCol) {
      setGroupCol(query.data.groupCol);
    }
  }, [groupCol, query.data?.groupCol, setGroupCol]);

  return (
    <SectionShell title="Product Groups" loading={query.isLoading} fetching={query.isFetching}>
      {query.error && <p className="text-sm text-destructive">Failed to load product groups.</p>}

      {query.data && (
        <div className="space-y-4">
          {!query.data.candidates.length ? (
            <p className="text-sm text-muted-foreground">No grouping columns were detected.</p>
          ) : (
            <>
              <label className="block space-y-2 text-sm">
                <span className="font-medium">Grouping column</span>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2"
                  value={query.data.groupCol}
                  onChange={(e) => setGroupCol(e.target.value)}
                >
                  {query.data.candidates.map((candidate) => (
                    <option key={candidate} value={candidate}>
                      {candidate}
                    </option>
                  ))}
                </select>
              </label>

              {!!query.data.stats?.length && (
                <div className="grid gap-3 md:grid-cols-3">
                  {query.data.stats.map((stat) => (
                    <div key={stat.column} className="rounded-md border p-3">
                      <p className="text-sm font-medium">{stat.column}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {stat.groupCount.toLocaleString()} groups across {stat.skuCount.toLocaleString()} SKUs
                      </p>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-2">
                <p className="text-sm font-medium">Feed label rollup</p>
                <DataTable rows={query.data.rollup} maxHeight="320px" />
              </div>
            </>
          )}
        </div>
      )}
    </SectionShell>
  );
}
