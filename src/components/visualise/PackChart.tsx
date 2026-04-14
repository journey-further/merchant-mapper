import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as d3h from 'd3-hierarchy';
import { Badge } from '@journey-further/salient-ui/ui/badge';
import { Skeleton } from '@journey-further/salient-ui/ui/skeleton';
import { useWorkflowStore } from '../../store/workflowStore';
import { getBubbleData } from '../../lib/api';
import PackControls from './PackControls';

const PALETTE = ['#4C6A92', '#6F8F72', '#B97A57', '#8C6C99', '#C4A46B', '#5B7C99', '#9E6E6E'];

interface DataNode {
  title?: string;
  clicks?: number;
  category?: string;
  name?: string;
  children?: DataNode[];
}

interface TooltipState {
  x: number;
  y: number;
  title: string;
  clicks: number;
}

export default function PackChart() {
  const { sessionId, rawDfBlobUrl, catSrcCol } = useWorkflowStore();
  const [n, setN] = useState(500);
  const [useCategory, setUseCategory] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  // Track container width and recompute pack on resize
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const { width } = entries[0].contentRect;
      if (width > 0) {
        setSize({ width, height: Math.max(500, Math.round(width * 0.75)) });
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const { data, isLoading, error } = useQuery({
    queryKey: ['bubble-data', sessionId, n, useCategory ? catSrcCol : null],
    queryFn: () =>
      getBubbleData({
        session: sessionId!,
        rawDfUrl: rawDfBlobUrl!,
        n,
        catSrcCol: useCategory && catSrcCol ? catSrcCol : undefined,
      }),
    enabled: !!sessionId && !!rawDfBlobUrl,
    staleTime: 60_000,
  });

  const { productCircles, categoryCircles } = useMemo(() => {
    if (!data?.items.length) return { productCircles: [], categoryCircles: [] };
    const { width, height } = size;
    const items = data.items;
    const hierarchical = useCategory && !!catSrcCol;

    let root: d3h.HierarchyCircularNode<DataNode>;

    if (hierarchical) {
      const grouped = new Map<string, typeof items>();
      for (const item of items) {
        const cat = item.category || 'Uncategorised';
        if (!grouped.has(cat)) grouped.set(cat, []);
        grouped.get(cat)!.push(item);
      }
      const treeData: DataNode = {
        name: 'root',
        children: [...grouped].map(([cat, kids]) => ({
          name: cat,
          children: kids as DataNode[],
        })),
      };
      root = d3h
        .pack<DataNode>()
        .size([width, height])
        .padding(6)(
          d3h.hierarchy(treeData).sum((d) => Math.max((d as { clicks?: number }).clicks ?? 0, 1))
        );
    } else {
      const treeData: DataNode = { children: items as DataNode[] };
      root = d3h
        .pack<DataNode>()
        .size([width, height])
        .padding(2)(
          d3h.hierarchy(treeData).sum((d) => Math.max((d as { clicks?: number }).clicks ?? 0, 1))
        );
    }

    const all = root.descendants();
    return {
      productCircles: all.filter((node) => node.depth === (hierarchical ? 2 : 1)),
      categoryCircles: hierarchical ? all.filter((node) => node.depth === 1) : [],
    };
  }, [data, size, useCategory, catSrcCol]);

  // Build category → colour map from category circles
  const catColorMap = useMemo(() => {
    const map = new Map<string, string>();
    let i = 0;
    for (const c of categoryCircles) {
      const name = (c.data as DataNode).name ?? '';
      if (!map.has(name)) {
        map.set(name, PALETTE[i % PALETTE.length]);
        i++;
      }
    }
    return map;
  }, [categoryCircles]);

  if (!sessionId || !rawDfBlobUrl) {
    return (
      <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
        Upload a feed to see the product visualisation.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls row */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <PackControls
          n={n}
          total={data?.total ?? 0}
          useCategory={useCategory}
          hasCatSrcCol={!!catSrcCol}
          onNChange={setN}
          onUseCategoryChange={setUseCategory}
        />
        {data && (
          <Badge variant="secondary">
            Showing {data.items.length.toLocaleString()} of {data.total.toLocaleString()}
          </Badge>
        )}
      </div>

      {/* Chart */}
      <div ref={containerRef} className="relative w-full">
        {isLoading && <Skeleton className="h-[600px] w-full rounded-lg" />}

        {error && (
          <div className="flex h-[400px] items-center justify-center text-sm text-destructive">
            Failed to load chart data.
          </div>
        )}

        {!isLoading && !error && data && (
          <svg
            width={size.width}
            height={size.height}
            style={{ display: 'block' }}
            onMouseLeave={() => setTooltip(null)}
          >
            {/* Category circles (semi-transparent background) */}
            {categoryCircles.map((c, i) => {
              const name = (c.data as DataNode).name ?? '';
              const color = catColorMap.get(name) ?? PALETTE[0];
              return (
                <g key={`cat-${i}`}>
                  <circle
                    cx={c.x}
                    cy={c.y}
                    r={c.r}
                    fill={color}
                    fillOpacity={0.12}
                    stroke={color}
                    strokeWidth={1.5}
                  />
                  {c.r > 30 && (
                    <text
                      x={c.x}
                      y={c.y - c.r + 14}
                      textAnchor="middle"
                      fontSize={11}
                      fill={color}
                      fontWeight={600}
                    >
                      {name}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Product circles */}
            {productCircles.map((c, i) => {
              const item = c.data as DataNode;
              const catName =
                useCategory && catSrcCol ? (item.category || 'Uncategorised') : null;
              const color = catName
                ? (catColorMap.get(catName) ?? PALETTE[0])
                : PALETTE[i % PALETTE.length];
              return (
                <circle
                  key={`prod-${i}`}
                  cx={c.x}
                  cy={c.y}
                  r={Math.max(c.r, 1)}
                  fill={color}
                  fillOpacity={0.85}
                  stroke="white"
                  strokeWidth={0.5}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={(e) =>
                    setTooltip({
                      x: e.clientX,
                      y: e.clientY,
                      title: item.title ?? '',
                      clicks: item.clicks ?? 0,
                    })
                  }
                  onMouseMove={(e) =>
                    setTooltip((prev) =>
                      prev ? { ...prev, x: e.clientX, y: e.clientY } : null
                    )
                  }
                  onMouseLeave={() => setTooltip(null)}
                />
              );
            })}
          </svg>
        )}

        {/* Floating tooltip */}
        {tooltip && (
          <div
            className="pointer-events-none fixed z-50 max-w-[220px] rounded border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md"
            style={{ left: tooltip.x + 14, top: tooltip.y - 10 }}
          >
            <div className="font-medium leading-tight">{tooltip.title}</div>
            <div className="mt-0.5 text-muted-foreground">
              {tooltip.clicks.toLocaleString()} clicks
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
