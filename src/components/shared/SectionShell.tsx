import { Card, CardContent, CardHeader, CardTitle } from '@journey-further/salient-ui/ui/card';
import { Skeleton } from '@journey-further/salient-ui/ui/skeleton';

interface SectionShellProps {
  title: string;
  loading?: boolean;
  children: React.ReactNode;
}

export default function SectionShell({ title, loading, children }: SectionShellProps) {
  return (
    <Card className="mb-4">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}
