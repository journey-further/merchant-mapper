import { Tabs, TabsContent, TabsList, TabsTrigger } from '@journey-further/salient-ui/ui/tabs';
import { Badge } from '@journey-further/salient-ui/ui/badge';
import AppHeader from '../components/layout/AppHeader';
import UploadDropzone from '../components/feed/UploadDropzone';
import { useWorkflowStore } from '../store/workflowStore';

// Feed tab sections (lazy-imported to keep initial bundle small)
import { lazy, Suspense } from 'react';
import { Skeleton } from '@journey-further/salient-ui/ui/skeleton';

const ColumnPicker = lazy(() => import('../components/feed/ColumnPicker'));
const FiltersPanel = lazy(() => import('../components/feed/FiltersPanel'));
const ProductGroups = lazy(() => import('../components/feed/ProductGroups'));
const ColourSummary = lazy(() => import('../components/feed/ColourSummary'));
const ColourMapping = lazy(() => import('../components/feed/ColourMapping'));
const CategoryExtraction = lazy(() => import('../components/feed/CategoryExtraction'));
const NormalisedFeedPreview = lazy(() => import('../components/feed/NormalisedFeedPreview'));

const PackChart = lazy(() => import('../components/visualise/PackChart'));

const KeywordBuilder = lazy(() => import('../components/keywords/KeywordBuilder'));
const KeywordCombined = lazy(() => import('../components/keywords/KeywordCombined'));

const GadsConfig = lazy(() => import('../components/gads/GadsConfig'));
const GadsResults = lazy(() => import('../components/gads/GadsResults'));
const GadsCharts = lazy(() => import('../components/gads/GadsCharts'));

function SectionFallback() {
  return (
    <div className="space-y-2 p-4">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  );
}

export default function WorkflowPage() {
  const { rawDfBlobUrl, productCount, fileName, resetSession } = useWorkflowStore();
  const hasFile = !!rawDfBlobUrl;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <main className="mx-auto max-w-screen-xl px-6 py-6">
        {/* Upload area — always visible until a file is loaded */}
        {!hasFile && (
          <div className="mx-auto max-w-lg py-16">
            <h2 className="mb-2 text-center text-lg font-semibold">Get started</h2>
            <p className="mb-6 text-center text-sm text-muted-foreground">
              Export your product feed from Google Merchant Center, then upload it below.
            </p>
            <UploadDropzone />
          </div>
        )}

        {hasFile && (
          <>
            <div className="mb-4 flex items-center gap-3">
              <span className="text-sm text-muted-foreground">
                {fileName}
              </span>
              <Badge variant="secondary">
                {productCount.toLocaleString()} products
              </Badge>
              <button
                className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                onClick={() => {
                  resetSession();
                }}
              >
                Upload different file
              </button>
            </div>

            <Tabs defaultValue="feed">
              <TabsList className="mb-6">
                <TabsTrigger value="feed">Feed</TabsTrigger>
                <TabsTrigger value="visualise">Visualise</TabsTrigger>
                <TabsTrigger value="keywords">Keywords</TabsTrigger>
                <TabsTrigger value="gads">Google Ads</TabsTrigger>
              </TabsList>

              {/* ── Feed tab ───────────────────────────────────────────── */}
              <TabsContent value="feed">
                <Suspense fallback={<SectionFallback />}>
                  <ColumnPicker />
                </Suspense>
                <Suspense fallback={<SectionFallback />}>
                  <FiltersPanel />
                </Suspense>
                <Suspense fallback={<SectionFallback />}>
                  <ProductGroups />
                </Suspense>
                <Suspense fallback={<SectionFallback />}>
                  <ColourSummary />
                </Suspense>
                <Suspense fallback={<SectionFallback />}>
                  <ColourMapping />
                </Suspense>
                <Suspense fallback={<SectionFallback />}>
                  <CategoryExtraction />
                </Suspense>
                <Suspense fallback={<SectionFallback />}>
                  <NormalisedFeedPreview />
                </Suspense>
              </TabsContent>

              {/* ── Visualise tab ──────────────────────────────────────── */}
              <TabsContent value="visualise">
                <Suspense fallback={<SectionFallback />}>
                  <PackChart />
                </Suspense>
              </TabsContent>

              {/* ── Keywords tab ───────────────────────────────────────── */}
              <TabsContent value="keywords">
                <Suspense fallback={<SectionFallback />}>
                  <KeywordBuilder />
                </Suspense>
                <Suspense fallback={<SectionFallback />}>
                  <KeywordCombined />
                </Suspense>
              </TabsContent>

              {/* ── Google Ads tab ─────────────────────────────────────── */}
              <TabsContent value="gads">
                <Suspense fallback={<SectionFallback />}>
                  <GadsConfig />
                </Suspense>
                <Suspense fallback={<SectionFallback />}>
                  <GadsResults />
                </Suspense>
                <Suspense fallback={<SectionFallback />}>
                  <GadsCharts />
                </Suspense>
              </TabsContent>
            </Tabs>
          </>
        )}
      </main>
    </div>
  );
}
