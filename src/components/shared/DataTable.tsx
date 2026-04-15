const MAX_CELL_LEN = 60;

function truncate(val: string): { display: string; truncated: boolean } {
  if (val.length <= MAX_CELL_LEN) return { display: val, truncated: false };
  return { display: val.slice(0, MAX_CELL_LEN) + '…', truncated: true };
}

interface DataTableProps {
  rows: Record<string, string | number>[];
  columns?: string[];
  maxHeight?: string;
}

export default function DataTable({ rows, columns, maxHeight = '360px' }: DataTableProps) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">No data.</p>;

  const cols = columns ?? Object.keys(rows[0]);

  return (
    <div
      className="rounded-md border"
      style={{ maxHeight, overflowX: 'auto', overflowY: 'auto' }}
    >
      <table style={{ borderCollapse: 'collapse', whiteSpace: 'nowrap', width: 'max-content', minWidth: '100%' }}>
        <thead>
          <tr style={{ position: 'sticky', top: 0, zIndex: 1, background: 'var(--background, #fff)' }}>
            {cols.map((c) => (
              <th
                key={c}
                style={{
                  padding: '6px 12px',
                  textAlign: 'left',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  borderBottom: '1px solid var(--border, #e5e7eb)',
                  whiteSpace: 'nowrap',
                }}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              style={{ borderBottom: '1px solid var(--border, #e5e7eb)' }}
            >
              {cols.map((c) => {
                const raw = String(row[c] ?? '');
                const { display, truncated } = truncate(raw);
                return (
                  <td
                    key={c}
                    title={truncated ? raw : undefined}
                    style={{
                      padding: '6px 12px',
                      fontSize: '0.75rem',
                      verticalAlign: 'top',
                      maxWidth: '240px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {display}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
