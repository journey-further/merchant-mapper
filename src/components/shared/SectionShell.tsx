import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Skeleton } from '../../ui/skeleton';

interface SectionShellProps {
  title: string;
  loading?: boolean;
  /** Reserve vertical space while loading to prevent layout shifts. */
  minHeight?: string;
  children: React.ReactNode;
}

export default function SectionShell({ title, loading, minHeight = '80px', children }: SectionShellProps) {
  return (
    <Card className="mb-4">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div style={{ minHeight }}>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ) : (
            <div
              style={{
                animation: 'fadeIn 0.15s ease-in',
              }}
            >
              {children}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
