import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@journey-further/salient-ui/ui/table';

interface DataTableProps {
  rows: Record<string, string | number>[];
  columns?: string[]; // explicit column order; defaults to Object.keys(rows[0])
  maxHeight?: string;
}

export default function DataTable({ rows, columns, maxHeight = '360px' }: DataTableProps) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">No data.</p>;

  const cols = columns ?? Object.keys(rows[0]);

  return (
    <div className="overflow-auto rounded-md border" style={{ maxHeight }}>
      <Table>
        <TableHeader>
          <TableRow>
            {cols.map((c) => (
              <TableHead key={c} className="whitespace-nowrap text-xs">
                {c}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, i) => (
            <TableRow key={i}>
              {cols.map((c) => (
                <TableCell key={c} className="text-xs">
                  {String(row[c] ?? '')}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
