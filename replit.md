# Villa Payroll Manager

A bilingual Arabic/English operations app for Awadallah Hotels & Villas, covering bookings, inventory, and monthly staff payroll.

## Run & Operate

- `pnpm --filter @workspace/villa-payroll-manager run dev` — run the app preview
- `pnpm --filter @workspace/villa-payroll-manager run test` — run payroll and operations tests
- `pnpm --filter @workspace/villa-payroll-manager run typecheck` — typecheck the app
- `PORT=23039 BASE_PATH=/ pnpm --filter @workspace/villa-payroll-manager run build` — build the app
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages

## Stack

- pnpm workspaces, React, Vite, TypeScript
- Clerk sign-in, an Express API, and PostgreSQL for shared app data
- Browser `localStorage` is retained only as a first-run migration source

## Where things live

- `artifacts/villa-payroll-manager/src/App.tsx` — app interface and interactions
- `artifacts/villa-payroll-manager/src/payroll.ts` — payroll calculations and month records
- `artifacts/villa-payroll-manager/src/operations.ts` — booking, inventory, and data migration logic
- `artifacts/villa-payroll-manager/src/*.test.ts` — payroll and operations tests
- `artifacts/api-server` — authenticated API and shared-state persistence
- `lib/db/src/schema/villa-app-state.ts` — PostgreSQL shared-state table
- `lib/api-spec/openapi.yaml` — API contract; regenerate with `pnpm --filter @workspace/api-spec run codegen`

## Architecture decisions

- Bookings, inventory, staff, and payroll records are stored together in one PostgreSQL JSONB document and polled every three seconds.
- Saves use a revision check; when another device has newer data, keep the local edits visible and ask the user before loading the newer shared copy.
- API access requires a Clerk session and a verified email listed in the `VILLA_PAYROLL_ALLOWED_EMAILS` environment variable. Never hardcode approved addresses.
- Payroll records are kept independently by month; changes to the staff roster do not rewrite past month snapshots.
- The first approved session initializes the shared record from that browser's migrated local data; afterward PostgreSQL is the source of truth.

## Product

- Manage villa reservations and prevent overlapping bookings for the same room.
- Track villa inventory and staff attendance, bonuses, deductions, and net payouts.
- Switch between Arabic and English.

## User preferences

No additional preferences recorded.

## Gotchas

- New accounts do not have data access unless their verified email is allowlisted by the server.
- Export JSON backups regularly. Importing a backup replaces the shared bookings, roster, inventory, and payroll records.
- A detected cross-device conflict is not auto-merged; export a backup of local edits before choosing to load the latest shared data.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
