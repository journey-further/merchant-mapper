# Merchant Mapper — Vercel migration plan

Handoff from a Cowork (desktop app) session. The goal is to get this app deployed onto Vercel under the `salient` team (https://vercel.com/salient), with the GitHub mirror at https://github.com/journey-further/merchant-mapper driving deploys.

This document captures the plan, decisions already made, and the open items that need resolving. It's intended to be picked up by Claude Code running at the parent of this repo so it can also read `../salient-template`.

## Current state of the project

- Frontend: React 19 + TS + Vite (vite 8), Tailwind v4, Zustand, React Query, Chart.js + d3 for the bubble pack chart, React Router. Single route `/` → `WorkflowPage`. Talks to backend via `/api/*` JSON and uploads parquet blobs via PUT.
- Backend: Python, **not yet Vercel-shaped**. `dev_server.py` is a monolithic `BaseHTTPRequestHandler` (a port of an older Flask app) serving ~17 endpoints. The actual domain logic lives in `api/_lib/core/` (pandas-heavy modules — all well factored).
- State: large dataframes round-tripped as parquet **blobs**. In dev, `tempfile.gettempdir()` + `/dev-blobs/<uuid>` served by the python server.
- Reference data: `api/_lib/core/colour_mapping.csv` and `api/_lib/gads_exports/{geo_target_countries,language_constants}.csv` are read from disk.
- Secrets: `.env` (gitignored) with Google Ads OAuth — developer token, client id/secret, refresh token, login CID. **Do not commit these.**
- `vercel.json` exists but has no function definitions — just a buildCommand, outputDirectory, and SPA rewrite. The `/api/*` passthrough doesn't match anything because there are no handler files under `api/` yet.
- The `api/` directory currently contains only `_lib/` + a package `__init__.py`. No routed handlers.

### API endpoints that need porting (from `dev_server.py`)

- POST `/api/parse`, `/api/fetch-shopify`
- POST `/api/columns`, `/api/filters`, `/api/groups`
- GET + POST `/api/colour-mapping`, POST `/api/colour-summary`
- POST `/api/categories`, `/api/normalised-feed`
- POST `/api/keywords`, `/api/keywords-finalise`
- GET `/api/gads-constants`; POST `/api/gads-fetch`, `/api/gads-upload`, `/api/gads-results`, `/api/gads-charts`
- GET `/api/bubble-data`, `/api/download`
- POST `/api/blob-token`, PUT/GET `/dev-blobs/*` — replaced by Vercel Blob (see Phase 2)

## Decisions already made

1. **Port the Python backend to Vercel Functions.** Keep pandas/gads logic in Python, split `dev_server.py`'s routes into per-file handlers under `api/`. `api/_lib/core/*` stays as-is.
2. **Use Vercel Blob** for uploaded feeds and intermediate parquet blobs. Replaces the tmpdir `/dev-blobs/*` pattern.
3. **salient-ui strategy — TBD, see Phase 0.** The default fallback is to vendor only the components actually used (`Button`, `Card`, `Tabs`, `Badge`, `Skeleton`, `Label`) plus `globals-css` into `src/ui/`. But first we should inspect how `salient-template` installs `@journey-further/salient-ui` and replicate that if possible.
4. **Target for the first session: plan + first (preview) deploy.** Full endpoint-by-endpoint smoke testing can span more than one session.
5. **Auth for the first deploy: Vercel Deployment Protection.** Gate the preview URL with the Vercel team SSO so the Google Ads API endpoints aren't wide open on the internet. Proper Salient SSO middleware is a follow-up phase.

## salient-ui — how it's used here

```
src/globals.css:     @import "@journey-further/salient-ui/globals-css"
WorkflowPage.tsx:    Tabs, TabsContent, TabsList, TabsTrigger, Badge, Skeleton
SectionShell.tsx:    Card, CardContent, CardHeader, CardTitle, Skeleton
PackControls.tsx:    Label
PackChart.tsx:       Badge, Skeleton
AppHeader.tsx:       Button
Multiple feed/keywords/gads components: Button
```

Subpath imports (`/ui/button`, `/ui/card`, etc.) — so the package exposes per-component entry points.

## Migration plan

### Phase 0 — Discovery (critical, ~15 min)

1. Read `../salient-template/package.json` — look at the `@journey-further/salient-ui` version spec.
2. Read `../salient-template/.npmrc` if present — this is where GitHub Packages auth or a private registry URL lives.
3. Read the `../salient-template/package-lock.json` (or `pnpm-lock.yaml`) entry for `salient-ui` — the `resolved` URL tells you the registry.
4. Read `../salient-template/middleware.ts` (or `.tsx`) — the template is Next.js 15, so its middleware pattern won't port 1:1 to this Vite SPA, but it tells us what the Salient ecosystem expects for auth (likely an SSO check against the Salient portal at https://vercel.com/salient/salient-portal).
5. On `vercel.com/salient`: confirm Vercel Blob is available / add it via `vercel integration add` if not.
6. Confirm push access to `github.com/journey-further/merchant-mapper`.

### Phase 1 — Make the frontend build on Vercel

1. Resolve the `@journey-further/salient-ui` dependency per Phase 0 findings.
   - If `salient-template` installs via private npm / GitHub Packages: replicate the `.npmrc` pattern here, set `NPM_TOKEN` (or equivalent) in Vercel project env vars.
   - If git URL: copy the `package.json` entry and configure any required deploy token.
   - If neither and no existing pattern: vendor the components we use into `src/ui/` (see salient-ui usage list above). Touch the ~15 import sites. Flag this as temporary in a code comment with a TODO to switch to the registry later.
2. `npm ci && npm run build` locally — confirm `dist/` builds cleanly.
3. Remove/relax the `resolve.alias` hacks in `vite.config.ts` if they're no longer needed (they exist to dedupe React when consuming a sibling `file:../salient-ui` package — irrelevant once the dep is a normal npm package).

### Phase 2 — Port the Python API to Vercel Functions

1. Don't touch `api/_lib/core/*` — it's already clean.
2. Create one handler file per endpoint under `api/`, following Vercel's Python runtime convention. Each handler imports from `api/_lib/core/*`. Routes to create:
   - `api/parse.py`, `api/fetch-shopify.py`
   - `api/columns.py`, `api/filters.py`, `api/groups.py`
   - `api/colour-mapping.py` (handle GET + POST), `api/colour-summary.py`
   - `api/categories.py`, `api/normalised-feed.py`
   - `api/keywords.py`, `api/keywords-finalise.py`
   - `api/gads-constants.py`, `api/gads-fetch.py`, `api/gads-upload.py`, `api/gads-results.py`, `api/gads-charts.py`
   - `api/bubble-data.py`, `api/download.py`
3. Replace the `/api/blob-token` + `/dev-blobs/*` pair with **Vercel Blob**.
   - Server: issue signed upload URLs via the `vercel_blob` Python SDK (or a Node function for this one endpoint, which is a small JSON call).
   - Client: `src/lib/blobUpload.ts` already speaks `{uploadUrl, url}` — minimal surgery, it just needs to point at a real Vercel Blob signed URL.
4. Extract a shared `api/_lib/blob_io.py` with `save_df_to_blob(df, label) -> url` and `load_df_from_blob(url) -> df`. Every handler swaps one line; the dev-server's tmpdir helpers go away.
5. Mark `dev_server.py` as legacy (or delete). For local dev, `vercel dev` now runs the real functions.

### Phase 3 — Vercel config (`vercel.json`)

```jsonc
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "regions": ["lhr1"],
  "functions": {
    "api/**/*.py": {
      "includeFiles": "api/_lib/**",
      "maxDuration": 60
    }
  },
  "rewrites": [
    { "source": "/((?!api/).*)", "destination": "/index.html" }
  ]
}
```

Notes:
- `includeFiles` bundles `_lib/*` (including the reference CSVs) with every Python handler.
- `maxDuration: 60` covers `gads-fetch`'s sleepy batched calls. Bump further via Fluid Compute if 60s isn't enough in practice.
- `regions: ["lhr1"]` for a UK-based team; revisit if data location dictates otherwise.
- The `/api/*` passthrough rewrite is removed — Vercel auto-routes `/api/**.py` to handler files, so the old rewrite was effectively a no-op.

Pin Python runtime and deps in `requirements.txt`. Add `vercel-blob` (Python SDK) alongside pandas / pyarrow / openpyxl / xlsxwriter / google-ads / pyyaml / python-dotenv.

### Phase 4 — Project + secrets wiring

1. `vercel link` into the `salient` team (select "Link to existing project" if one's already been pre-created, otherwise "Create new project").
2. In the Vercel dashboard → Git integration → connect `journey-further/merchant-mapper`. Production = `main`; other branches = previews.
3. Env vars (Production **and** Preview scope):
   - `GOOGLE_ADS_DEVELOPER_TOKEN`
   - `GOOGLE_ADS_CLIENT_ID`
   - `GOOGLE_ADS_CLIENT_SECRET`
   - `GOOGLE_ADS_REFRESH_TOKEN`
   - `GOOGLE_ADS_LOGIN_CUSTOMER_ID`
   - `BLOB_READ_WRITE_TOKEN` (auto-added when Vercel Blob is enabled on the project)
4. Turn on Deployment Protection (Vercel team SSO) so previews aren't publicly accessible.

### Phase 5 — First deploy + smoke test

1. Push the branch, watch the preview URL build.
2. Upload a small TSV (the repo has `hobbs_products_2026-02-27_10_35_43.tsv` handy) and walk the workflow end-to-end.
3. `vercel logs` for any handler that throws.
4. Hotspots likely to need attention:
   - Python bundle size on first cold start.
   - Vercel Blob URL shape vs. the frontend's `App.tsx` HEAD check on `rawDfBlobUrl`.
   - `download.py` streaming xlsx — confirm Vercel's response size limits cover typical exports.

## Known risks

1. **Python bundle size.** `pandas + pyarrow + google-ads` together can approach Vercel's per-function size limit. Mitigation if it blows up: split `gads-*` into its own function group so only those include `google-ads`; the rest stay lean on pandas+pyarrow.
2. **`google-ads.yaml` fallback** in `gads_client.py` is fine to keep for local runs; prod will always have env vars.
3. **Long-running keyword fetches.** `fetch_historical_metrics_gads` chunks + sleeps. If it exceeds `maxDuration` (even at 60s), we escalate to Vercel Workflows or a background job.
4. **App.tsx HEAD check** on mount — verify Vercel Blob supports HEAD on its signed URLs (it does for public blobs; confirm for private).
5. **Auth.** Today = Vercel Deployment Protection. Follow-up phase = port whatever middleware pattern `salient-template` uses, adapted for a Vite SPA + Python functions (the template is Next.js 15, so middleware won't port 1:1 — we'd need a client-side session guard for the SPA plus a server-side session check in each Python handler).
6. **Salient ecosystem integration.** If merchant-mapper is supposed to be a tile/tab inside `salient-portal`, we'll also need to agree on its hosted URL pattern (subdomain? sub-path? iframe?) — not in scope for today but flag early with whoever owns the portal.

## First moves for Claude Code to take

1. Read `../salient-template/package.json`, `.npmrc`, lockfile entry for `@journey-further/salient-ui`, and `middleware.ts` (if it exists).
2. Report findings back to the user.
3. Based on those findings, execute Phase 1 (salient-ui resolution + frontend build).
4. Then Phase 2 (Vercel-shaped Python handlers + Vercel Blob wiring).
5. Then Phase 3/4 (vercel.json, env vars, link project).
6. Deploy a preview and hand the URL back for smoke testing.

Do **not** commit the `.env` file. Do **not** paste its contents into any PR description or commit message.
