import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useWorkflowStore } from '../../store/workflowStore';
import { getFilters } from '../../lib/api';
import SectionShell from '../shared/SectionShell';
import DataTable from '../shared/DataTable';
import type { NumericFilterOption } from '../../types/api';

export default function FiltersPanel() {
  const { sessionId, rawDfBlobUrl, keepMap, filters, numericFilters, setFilters, setNumericFilters } = useWorkflowStore();
  // Local input state so the store (and API refetch) only updates on blur/Enter
  const [localInputs, setLocalInputs] = useState<Record<string, { gte: string; lte: string }>>({});

  const query = useQuery({
    queryKey: ['filters', sessionId, rawDfBlobUrl, keepMap, filters, numericFilters],
    queryFn: () =>
      getFilters({
        session: sessionId!,
        rawDfUrl: rawDfBlobUrl!,
        keepMap,
        filters,
        numericFilters,
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

  function getLocalInput(column: string, bound: 'gte' | 'lte'): string {
    const local = localInputs[column]?.[bound];
    if (local !== undefined) return local;
    const stored = numericFilters[column]?.[bound];
    return stored !== undefined ? String(stored) : '';
  }

  function setLocalInput(column: string, bound: 'gte' | 'lte', value: string) {
    setLocalInputs(prev => ({ ...prev, [column]: { gte: getLocalInput(column, 'gte'), lte: getLocalInput(column, 'lte'), [bound]: value } }));
  }

  function commitNumericBound(column: string, bound: 'gte' | 'lte') {
    const raw = localInputs[column]?.[bound] ?? '';
    const val = raw === '' ? undefined : Number(raw);
    const current = numericFilters[column] ?? {};
    const next = { ...current, [bound]: val };
    if (next.gte === undefined && next.lte === undefined) {
      const updated = { ...numericFilters };
      delete updated[column];
      setNumericFilters(updated);
    } else {
      setNumericFilters({ ...numericFilters, [column]: next });
    }
  }

  function clearNumericFilter(column: string) {
    setLocalInputs(prev => { const n = { ...prev }; delete n[column]; return n; });
    const updated = { ...numericFilters };
    delete updated[column];
    setNumericFilters(updated);
  }

  return (
    <SectionShell title="Filters" loading={query.isLoading} fetching={query.isFetching}>
      {query.error && <p className="text-sm text-destructive">Failed to load filters.</p>}

      {query.data && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {query.data.filteredCount.toLocaleString()} of {query.data.totalCount.toLocaleString()} rows match the current filters.
          </p>

          <div className="space-y-2">
            {/* Numeric range filters */}
            {Object.entries(query.data.numericOptions ?? {}).map(([column, opt]: [string, NumericFilterOption]) => {
              const current = numericFilters[column] ?? {};
              const prefix = opt.type === 'price' ? '£' : '';
              return (
                <details key={column} className="rounded-md border p-3">
                  <summary className="cursor-pointer text-sm font-medium">
                    {column}
                    {(current.gte !== undefined || current.lte !== undefined) && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        ({current.gte !== undefined ? `≥ ${prefix}${current.gte}` : ''}
                        {current.gte !== undefined && current.lte !== undefined ? ' – ' : ''}
                        {current.lte !== undefined ? `≤ ${prefix}${current.lte}` : ''})
                      </span>
                    )}
                  </summary>
                  <div className="mt-3 space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Range in feed: {prefix}{opt.min.toLocaleString()} – {prefix}{opt.max.toLocaleString()}
                    </p>
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="flex items-center gap-2 text-sm">
                        <span className="w-24 text-muted-foreground">Greater than or equal to</span>
                        <input
                          type="number"
                          className="w-28 rounded-md border bg-background px-2 py-1 text-sm"
                          placeholder={String(opt.min)}
                          value={getLocalInput(column, 'gte')}
                          min={opt.min}
                          max={opt.max}
                          step="any"
                          onChange={(e) => setLocalInput(column, 'gte', e.target.value)}
                          onBlur={() => commitNumericBound(column, 'gte')}
                          onKeyDown={(e) => { if (e.key === 'Enter') commitNumericBound(column, 'gte') }}
                        />
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <span className="w-24 text-muted-foreground">Less than or equal to</span>
                        <input
                          type="number"
                          className="w-28 rounded-md border bg-background px-2 py-1 text-sm"
                          placeholder={String(opt.max)}
                          value={getLocalInput(column, 'lte')}
                          min={opt.min}
                          max={opt.max}
                          step="any"
                          onChange={(e) => setLocalInput(column, 'lte', e.target.value)}
                          onBlur={() => commitNumericBound(column, 'lte')}
                          onKeyDown={(e) => { if (e.key === 'Enter') commitNumericBound(column, 'lte') }}
                        />
                      </label>
                      {(current.gte !== undefined || current.lte !== undefined) && (
                        <button
                          className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                          onClick={() => clearNumericFilter(column)}
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                </details>
              );
            })}

            {/* Multi-select filters */}
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
