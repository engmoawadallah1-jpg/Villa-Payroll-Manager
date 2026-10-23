import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateNetPayout,
  createEmployeeSnapshots,
  isValidMonthId,
  updatePayrollEmployee,
} from './payroll.ts';

const staff = [
  {
    id: 'staff-1',
    name: 'Sample employee',
    salary: 5200,
    workingDays: 26,
    offDays: 4,
  },
];

function sampleMonth(id: string) {
  return { id, employees: createEmployeeSnapshots(staff) };
}

test('net payout prorates base pay and applies bonus and deductions', () => {
  const employee = {
    id: 'staff-1',
    name: 'Sample employee',
    baseSalary: 5200,
    scheduledDays: 26,
    attendedDays: 22,
    offDays: 4,
    bonus: 200,
    deductions: 50,
  };

  assert.equal(calculateNetPayout(employee), 4550);
});

test('zero scheduled days do not prorate base salary', () => {
  const employee = {
    id: 'staff-1',
    name: 'Sample employee',
    baseSalary: 5200,
    scheduledDays: 0,
    attendedDays: 10,
    offDays: 0,
    bonus: 25,
    deductions: 5,
  };

  assert.equal(calculateNetPayout(employee), 20);
});

test('new month snapshots start at full scheduled attendance with no adjustments', () => {
  const [employee] = createEmployeeSnapshots(staff);

  assert.equal(employee.attendedDays, 26);
  assert.equal(employee.bonus, 0);
  assert.equal(employee.deductions, 0);
  assert.equal(employee.netPayout, 5200);
});

test('editing one month leaves every other month unchanged', () => {
  const months = [sampleMonth('2026-10'), sampleMonth('2026-11')];
  const novemberBefore = months[1];
  const updated = updatePayrollEmployee(
    months,
    '2026-10',
    'staff-1',
    'attendedDays',
    '20',
  );

  assert.equal(updated[0].employees[0].attendedDays, 20);
  assert.equal(updated[0].employees[0].netPayout, 4000);
  assert.strictEqual(updated[1], novemberBefore);
});

test('attendance cannot exceed scheduled days', () => {
  const updated = updatePayrollEmployee(
    [sampleMonth('2026-10')],
    '2026-10',
    'staff-1',
    'attendedDays',
    '30',
  );

  assert.equal(updated[0].employees[0].attendedDays, 26);
  assert.equal(updated[0].employees[0].netPayout, 5200);
});

test('month IDs accept valid YYYY-MM values only', () => {
  assert.equal(isValidMonthId('2026-10'), true);
  assert.equal(isValidMonthId('2026-13'), false);
  assert.equal(isValidMonthId('October 2026'), false);
});
