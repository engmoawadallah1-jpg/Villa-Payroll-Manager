import assert from 'node:assert/strict';
import test from 'node:test';
import {
  archiveRoom,
  hasReservationConflict,
  migrateAppData,
  monthReservationSpan,
  removeVilla,
  renameRoom,
  updateVillaDetails,
  type AppData,
} from './operations.ts';
import { createEmployeeSnapshots } from './payroll.ts';

const payrollStaff = [
  { id: 'staff-1', name: 'Employee', salary: 5000, workingDays: 26, offDays: 4 },
];

function sampleData(): AppData {
  return {
    version: 2,
    villas: [
      {
        id: 'villa-1',
        name: 'فيلا',
        nameEn: 'Villa',
        rooms: ['101', '102'],
      },
    ],
    staff: payrollStaff,
    bookings: [
      {
        id: 'booking-1',
        villaId: 'villa-1',
        roomName: '101',
        guestName: 'Guest',
        phone: '',
        from: '2026-10-10',
        to: '2026-10-13',
        totalAmount: 3000,
        advance: 1000,
        remaining: 2000,
        status: 'confirmed',
      },
    ],
    payrollMonths: [{ id: '2026-10', employees: createEmployeeSnapshots(payrollStaff) }],
  };
}

test('v1 local data migrates to v2 while preserving bookings and adding a default status', () => {
  const legacy = sampleData();
  const migrated = migrateAppData({ ...legacy, version: 1, bookings: [{ ...legacy.bookings[0], status: undefined }] });

  assert.equal(migrated?.version, 2);
  assert.equal(migrated?.bookings[0].status, 'confirmed');
  assert.equal(migrated?.bookings[0].remaining, 2000);
  assert.deepEqual(migrated?.villas[0].rooms, ['101', '102']);
});

test('room rename updates the inventory and all matching reservation references', () => {
  const renamed = renameRoom(sampleData(), 'villa-1', '101', 'Suite A');

  assert.deepEqual(renamed.villas[0].rooms, ['Suite A', '102']);
  assert.equal(renamed.bookings[0].roomName, 'Suite A');
});

test('archiving a room with reservation history keeps its reference safely', () => {
  const archived = archiveRoom(sampleData(), 'villa-1', '101');

  assert.deepEqual(archived.villas[0].rooms, ['102']);
  assert.deepEqual(archived.villas[0].archivedRooms, ['101']);
  assert.equal(archived.bookings[0].roomName, '101');
});

test('room deletion removes an unused room but preserves rooms with history', () => {
  const result = archiveRoom(sampleData(), 'villa-1', '102');

  assert.deepEqual(result.villas[0].rooms, ['101']);
  assert.equal(result.bookings.length, 1);
});

test('villa deletion archives the property when reservations still reference it', () => {
  const result = removeVilla(sampleData(), 'villa-1');

  assert.equal(result.villas.length, 1);
  assert.equal(result.villas[0].archived, true);
  assert.equal(result.bookings[0].villaId, 'villa-1');
});

test('editing a villa identifier keeps reservation references connected', () => {
  const result = updateVillaDetails(sampleData(), 'villa-1', {
    id: 'villa-main',
    name: 'فيلا محدثة',
    nameEn: 'Updated Villa',
  });

  assert.equal(result.villas[0].id, 'villa-main');
  assert.equal(result.villas[0].nameEn, 'Updated Villa');
  assert.equal(result.bookings[0].villaId, 'villa-main');
});

test('reservation conflicts treat checkout as exclusive and ignore edits to the same reservation', () => {
  const data = sampleData();
  const checkoutDay = { ...data.bookings[0], from: '2026-10-13', to: '2026-10-15' };
  const overlap = { ...data.bookings[0], from: '2026-10-12', to: '2026-10-15' };

  assert.equal(hasReservationConflict(data.bookings, checkoutDay), false);
  assert.equal(hasReservationConflict(data.bookings, overlap), true);
  assert.equal(hasReservationConflict(data.bookings, data.bookings[0], 'booking-1'), false);
});

test('month spans clip multi-month reservations to the selected month and exclude checkout day', () => {
  assert.deepEqual(
    monthReservationSpan({ from: '2026-10-30', to: '2026-11-03' }, '2026-10'),
    { startDay: 30, endDayExclusive: 32 },
  );
  assert.deepEqual(
    monthReservationSpan({ from: '2026-10-30', to: '2026-11-03' }, '2026-11'),
    { startDay: 1, endDayExclusive: 3 },
  );
  assert.equal(
    monthReservationSpan({ from: '2026-10-10', to: '2026-10-13' }, '2026-11'),
    null,
  );
});
