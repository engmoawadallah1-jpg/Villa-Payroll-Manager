# Villa Payroll Manager

A bilingual Arabic/English tool for Awadallah Hotels & Villas. It manages villa bookings and keeps staff payroll in separate monthly records.

## Run in Replit

Open the artifact preview. Replit starts the app using its configured workflow.

## Run locally

Requirements:

- Node.js 24
- pnpm

From the project root:

```sh
pnpm install
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/villa-payroll-manager run dev
```

Open `http://localhost:5173`.

To create and serve a production build locally:

```sh
PORT=4173 BASE_PATH=/ pnpm --filter @workspace/villa-payroll-manager run build
PORT=4173 BASE_PATH=/ pnpm --filter @workspace/villa-payroll-manager run serve
```

## Check the project

From the project root:

```sh
pnpm --filter @workspace/villa-payroll-manager run test
pnpm --filter @workspace/villa-payroll-manager run typecheck
PORT=4173 BASE_PATH=/ pnpm --filter @workspace/villa-payroll-manager run build
```

The automated tests cover payroll calculations, attendance limits, valid month IDs, new-month defaults, and isolation between month records. Then verify the saved browser data in the app:

1. Select a month, change an employee's attended days, bonus, or deductions, and note the net payout.
2. Create another month and enter different values.
3. Switch between months and refresh the page. Each month should retain its own values and payouts.
4. Export a backup, then restore it and confirm the saved months return.
5. Try importing an invalid JSON file; it should be rejected without replacing saved data.

For bookings, create two reservations for the same room with overlapping dates and confirm the second is blocked. Non-overlapping dates should be accepted.

## Data and backups

Payroll, bookings, and month history are saved in the current browser's local storage. They do not automatically sync across devices or browsers. Export the JSON backup regularly and store it somewhere safe; import that file to restore or move the data. Clearing browser storage can remove the local copy.

This app does not provide account authentication or protect local browser data from other users of the same device. Do not use it on a shared device for confidential payroll data.
