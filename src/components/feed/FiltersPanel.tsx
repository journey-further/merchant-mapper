import { useQuery } from '@tanstack/react-query';
import { useWorkflowStore } from '../../store/workflowStore';
import { getFilters } from '../../lib/api';
import SectionShell from '../shared/SectionShell';
import DataTable from '../shared/DataTable';

export default function FiltersPanel() {
  const { sessionId, rawDfBlobUrl, keepMap, filters, setFilters } = useWorkflowStore();

  const query = useQuery({
    queryKey: ['filters', sessionId, rawDfBlobUrl, keepMap, filters],
    queryFn: () =>
      getFilters({
        session: sessionId!,
        rawDfUrl: rawDfBlobUrl!,
        keepMap,
        filters,
      }),
    enabled: !!sessionId && !!rawDfBlobUrl,
  });

  function toggleFilter(column: string, value: string, checked: boolean) {
    const current = filters[column] ?? [];
    const next = checked
      ? Array.from(new Set([...current, value]))
      : current.filter((item) => item !== value);
    const updated = { ...filters };
    if (next.length) updated[column] = next;
    else delete updated[column];
    setFilters(updated);
  }

  return (
    <SectionShell title="Filters" loading={query.isLoading}>
      {query.error && <p className="text-sm text-destructive">Failed to load filters.</p>}

      {query.data && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {query.data.filteredCount.toLocaleString()} of {query.data.totalCount.toLocaleString()} rows match the current filters.
          </p>

          <div className="space-y-2">
            {Object.entries(query.data.options).map(([column, values]) => (
              <details key={column} className="rounded-md border p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  {column}
                  {filters[column]?.length ? ` (${filters[column].length} selected)` : ''}
                </summary>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {values.map((value) => (
                    <label key={value} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={(filters[column] ?? []).includes(value)}
                        onChange={(e) => toggleFilter(column, value, e.target.checked)}
                      />
                      <span>{value}</span>
                    </label>
                  ))}
                </div>
              </details>
            ))}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Filtered preview</p>
            <DataTable rows={query.data.preview} maxHeight="320px" />
          </div>
        </div>
      )}
    </SectionShell>
  );
}
