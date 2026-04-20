import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Skeleton } from '../../ui/skeleton';

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin text-muted-foreground"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-label="Loading"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}

interface SectionShellProps {
  title: string;
  /** Initial load — replaces content with skeleton lines. */
  loading?: boolean;
  /** Background refetch — dims existing content and shows a spinner; no layout shift. */
  fetching?: boolean;
  /** Reserve vertical space while showing the initial skeleton. */
  minHeight?: string;
  children: React.ReactNode;
}

export default function SectionShell({
  title,
  loading,
  fetching,
  minHeight = '80px',
  children,
}: SectionShellProps) {
  const showSpinner = fetching && !loading;

  return (
    <Card className="mb-4">
      <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">{title}</CardTitle>
        {showSpinner && <Spinner />}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div style={{ minHeight }} className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : (
          <div
            style={{
              opacity: showSpinner ? 0.45 : 1,
              transition: 'opacity 0.15s ease',
              pointerEvents: showSpinner ? 'none' : undefined,
              animation: !showSpinner ? 'fadeIn 0.15s ease-in' : undefined,
            }}
          >
            {children}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
