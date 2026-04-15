import { Button } from '@journey-further/salient-ui/ui/button';
import { useWorkflowStore } from '../../store/workflowStore';

const BalanceIcon = () => (
  <img src="/balance.svg" alt="" width={22} height={22} />
);

export default function AppHeader() {
  const { fileName, resetSession } = useWorkflowStore();

  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-screen-xl items-center justify-between px-6 py-3">
        <div className="flex items-center gap-3">
          <BalanceIcon />
          <span className="text-xl font-semibold tracking-tight">Merchant Mapper</span>
          {fileName && (
            <span className="text-sm text-muted-foreground truncate max-w-64">
              — {fileName}
            </span>
          )}
        </div>
        {fileName && (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              if (window.confirm('Clear session and start over?')) resetSession();
            }}
          >
            Clear session
          </Button>
        )}
      </div>
    </header>
  );
}
