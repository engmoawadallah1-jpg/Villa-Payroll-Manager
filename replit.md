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
- Browser `localStorage` for app data; no database or API connection is required by this app

## Where things live

- `artifacts/villa-payroll-manager/src/App.tsx` — app interface and interactions
- `artifacts/villa-payroll-manager/src/payroll.ts` — payroll calculations and month records
- `artifacts/villa-payroll-manager/src/operations.ts` — booking, inventory, and data migration logic
- `artifacts/villa-payroll-manager/src/*.test.ts` — payroll and operations tests
- `artifacts/api-server` — shared API scaffold; not currently used by the app

## Architecture decisions

- Bookings, inventory, staff, and payroll records are saved in the current browser, with JSON export/import for backups.
- Payroll records are kept independently by month; changes to the staff roster do not rewrite past month snapshots.

## Product

- Manage villa reservations and prevent overlapping bookings for the same room.
- Track villa inventory and staff attendance, bonuses, deductions, and net payouts.
- Switch between Arabic and English.

## User preferences

No additional preferences recorded.

## Gotchas

- Data does not sync across browsers or devices. Export backups regularly; clearing browser storage can remove the local copy.
- The app has no account authentication. Do not use it for confidential payroll data on a shared device.
- Importing a backup replaces the current browser's saved bookings, roster, and payroll months.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
