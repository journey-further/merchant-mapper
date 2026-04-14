import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import Chart from 'chart.js/auto';
import { getGadsCharts } from '../../lib/api';
import { useWorkflowStore } from '../../store/workflowStore';
import SectionShell from '../shared/SectionShell';

export default function GadsCharts() {
  const { sessionId, combinedDfBlobUrl, gadsDfBlobUrl } = useWorkflowStore();

  const query = useQuery({
    queryKey: ['gads-charts', sessionId, combinedDfBlobUrl, gadsDfBlobUrl],
    queryFn: () =>
      getGadsCharts({
        session: sessionId!,
        combinedDfBlobUrl: combinedDfBlobUrl!,
        gadsDfBlobUrl: gadsDfBlobUrl!,
      }),
    enabled: !!sessionId && !!combinedDfBlobUrl && !!gadsDfBlobUrl,
  });

  return (
    <SectionShell title="Google Ads Charts" loading={query.isLoading}>
      {!combinedDfBlobUrl || !gadsDfBlobUrl ? (
        <p className="text-sm text-muted-foreground">
          Upload Google Ads metrics to render the search-volume charts.
        </p>
      ) : query.error ? (
        <p className="text-sm text-destructive">Failed to build the Google Ads charts.</p>
      ) : !query.data?.chronologicalSpec || !('data' in query.data.chronologicalSpec) ? (
        <p className="text-sm text-muted-foreground">No chart data is available yet.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Chronological Volume" spec={query.data.chronologicalSpec} />
          <ChartCard title="Seasonality" spec={query.data.seasonalitySpec} />
        </div>
      )}
    </SectionShell>
  );
}

function ChartCard({ title, spec }: { title: string; spec: object }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const chart = new Chart(canvas, spec as never);
    return () => chart.destroy();
  }, [spec]);

  return (
    <div className="rounded-md border p-4">
      <p className="mb-3 text-sm font-medium">{title}</p>
      <div className="h-80">
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}
