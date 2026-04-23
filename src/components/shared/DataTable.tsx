const MAX_CELL_LEN = 60;

// Columns whose values should never be abbreviated even if they look numeric.
const IDENTIFIER_COL = /\b(id|ids|mpn|gtin|sku|barcode|code|ref|number|num)\b/i;

function isIdentifierCol(col: string): boolean {
  return IDENTIFIER_COL.test(col);
}

/** Returns true only for plain numeric strings (integers or decimals, optional minus). */
function looksNumeric(val: string): boolean {
  return /^-?\d+(\.\d+)?$/.test(val.trim());
}

/** Format a numeric value with commas / k / m for readability. */
function formatNumber(val: string): string {
  const n = parseFloat(val);
  if (isNaN(n)) return val;
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000) {
    const formatted = (abs / 1_000_000).toFixed(1).replace(/\.0$/, '');
    return `${sign}${formatted}m`;
  }
  if (abs >= 10_000) {
    const formatted = (abs / 1_000).toFixed(1).replace(/\.0$/, '');
    return `${sign}${formatted}k`;
  }
  // 1,000–9,999: comma-separated, up to 2 decimal places
  return n.toLocaleString('en-GB', { maximumFractionDigits: 2 });
}

function truncate(val: string): { display: string; truncated: boolean } {
  if (val.length <= MAX_CELL_LEN) return { display: val, truncated: false };
  return { display: val.slice(0, MAX_CELL_LEN) + '…', truncated: true };
}

function isUrl(val: string): boolean {
  return val.startsWith('http://') || val.startsWith('https://');
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
                const numeric = looksNumeric(raw) && !isIdentifierCol(c);
                const formatted = numeric ? formatNumber(raw) : raw;
                const { display, truncated } = truncate(formatted);
                const url = !numeric && isUrl(raw);
                return (
                  <td
                    key={c}
                    title={truncated && !url ? raw : undefined}
                    style={{
                      padding: '6px 12px',
                      fontSize: '0.75rem',
                      verticalAlign: 'top',
                      maxWidth: '240px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      textAlign: numeric ? 'right' : 'left',
                    }}
                  >
                    {url ? (
                      <a
                        href={raw}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={raw}
                        style={{ color: 'var(--primary, #2563eb)', textDecoration: 'underline' }}
                      >
                        {display}
                      </a>
                    ) : (
                      display
                    )}
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
