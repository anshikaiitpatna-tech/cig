# AR Hand Motion Lab

AR Hand Motion Lab is a browser-local AR experiment that anchors a stylized ember and cigarette to a detected hand gesture, with motion telemetry and smoke effects.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/ar-hand-motion-lab run dev` — run the AR frontend
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/ar-hand-motion-lab/src/App.tsx` — camera lifecycle, MediaPipe hand results, gesture classification, telemetry, and canvas rendering
- `artifacts/ar-hand-motion-lab/src/index.css` — cinematic lab theme, typography, motion, and responsive layout
- `artifacts/ar-hand-motion-lab/index.html` — page metadata and browser-loaded MediaPipe Hands runtime
- `artifacts/api-server` — shared API scaffold; this app currently does not require a backend

## Architecture decisions

- Camera frames and hand landmarks stay in the browser; no video or gesture data is persisted or uploaded.
- Hand detection is separated from the requestAnimationFrame render loop so canvas effects can stay smooth while inference runs asynchronously.
- The anchor uses exponential smoothing plus velocity-aware smoke turbulence to prioritize stable hand attachment over raw landmark jitter.
- Pointer movement remains a fallback interaction when camera permission is unavailable or tracking is not active.

## Product

- Start and stop a mirrored webcam session locally.
- Detect a one-hand pinch/hold gesture and render an anchored virtual cigarette with ember and smoke.
- Toggle tracking debug landmarks and smoke effects.
- View live anchor position, movement velocity, and confidence telemetry.

## User preferences

- Keep the experience playful, minimal, cinematic, and clearly virtual.

## Gotchas

- Camera access requires a secure browser context and explicit permission.
- The browser loads the MediaPipe Hands runtime from jsDelivr in `index.html`; keep the runtime URL and `locateFile` path aligned if upgrading the tracker.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
