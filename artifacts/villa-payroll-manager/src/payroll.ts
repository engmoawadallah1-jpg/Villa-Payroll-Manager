export type Staff = {
  id: string;
  name: string;
  salary: number;
  workingDays: number;
  offDays: number;
};

export type EmployeeSnapshot = {
  id: string;
  name: string;
  baseSalary: number;
  scheduledDays: number;
  attendedDays: number;
  offDays: number;
  bonus: number;
  deductions: number;
  netPayout: number;
};

export type PayrollMonth = {
  id: string;
  employees: EmployeeSnapshot[];
};

export type PayrollEditableField =
  | 'baseSalary'
  | 'scheduledDays'
  | 'attendedDays'
  | 'offDays'
  | 'bonus'
  | 'deductions';

export function calculateNetPayout(
  employee: Omit<EmployeeSnapshot, 'netPayout'> | EmployeeSnapshot,
): number {
  const scheduledDays = Math.max(0, Number(employee.scheduledDays) || 0);
  const attendedDays = Math.max(
    0,
    Math.min(scheduledDays, Number(employee.attendedDays) || 0),
  );
  const proratedSalary =
    scheduledDays === 0
      ? 0
      : (Number(employee.baseSalary) || 0) * (attendedDays / scheduledDays);

  return (
    proratedSalary +
    (Number(employee.bonus) || 0) -
    (Number(employee.deductions) || 0)
  );
}

export function createEmployeeSnapshots(staff: Staff[]): EmployeeSnapshot[] {
  return staff.map((employee) => {
    const snapshot = {
      id: String(employee.id),
      name: employee.name,
      baseSalary: Number(employee.salary) || 0,
      scheduledDays: Number(employee.workingDays) || 0,
      attendedDays: Number(employee.workingDays) || 0,
      offDays: Number(employee.offDays) || 0,
      bonus: 0,
      deductions: 0,
    };
    return { ...snapshot, netPayout: calculateNetPayout(snapshot) };
  });
}

export function isValidMonthId(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function updatePayrollEmployee(
  months: PayrollMonth[],
  monthId: string,
  employeeId: string,
  field: PayrollEditableField,
  rawValue: string,
): PayrollMonth[] {
  const parsedValue = Number(rawValue);
  const value = Math.max(0, Number.isFinite(parsedValue) ? parsedValue : 0);

  return months.map((month) => {
    if (month.id !== monthId) return month;

    return {
      ...month,
      employees: month.employees.map((employee) => {
        if (employee.id !== employeeId) return employee;

        const updated = { ...employee, [field]: value };
        updated.attendedDays = Math.min(
          Math.max(0, updated.attendedDays),
          Math.max(0, updated.scheduledDays),
        );
        updated.netPayout = calculateNetPayout(updated);
        return updated;
      }),
    };
  });
}
