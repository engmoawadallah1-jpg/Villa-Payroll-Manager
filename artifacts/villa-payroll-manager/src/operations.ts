import type { PayrollMonth, Staff } from './payroll';

export type ReservationStatus =
  | 'confirmed'
  | 'checked-in'
  | 'checked-out'
  | 'blocked';

export type Villa = {
  id: string;
  name: string;
  nameEn: string;
  rooms: string[];
  archivedRooms?: string[];
  archived?: boolean;
};

export type Booking = {
  id: string;
  villaId: string;
  roomName: string;
  guestName: string;
  phone: string;
  from: string;
  to: string;
  totalAmount: number;
  advance: number;
  remaining: number;
  status: ReservationStatus;
};

export type AppData = {
  version: 2;
  villas: Villa[];
  staff: Staff[];
  bookings: Booking[];
  payrollMonths: PayrollMonth[];
};

const validStatuses = new Set<ReservationStatus>([
  'confirmed',
  'checked-in',
  'checked-out',
  'blocked',
]);

function asText(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asAmount(value: unknown): number {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

/**
 * Converts the original v1 browser data and current v2 backups into the
 * current shape without dropping reservations that refer to archived units.
 */
export function migrateAppData(value: unknown): AppData | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (
    (candidate.version !== 1 && candidate.version !== 2) ||
    !Array.isArray(candidate.villas) ||
    !Array.isArray(candidate.staff) ||
    !Array.isArray(candidate.bookings) ||
    !Array.isArray(candidate.payrollMonths)
  ) {
    return null;
  }

  const villas: Villa[] = candidate.villas.map((raw: any, index: number) => {
    const rooms = Array.isArray(raw?.rooms) ? raw.rooms : [];
    const archivedRooms: string[] = Array.isArray(raw?.archivedRooms)
      ? raw.archivedRooms.filter(
          (room: unknown): room is string => typeof room === 'string',
        )
      : [];
    return {
      id: asText(raw?.id, `villa-${index + 1}`),
      name: asText(raw?.name, `Villa ${index + 1}`),
      nameEn: asText(raw?.nameEn, asText(raw?.name, `Villa ${index + 1}`)),
      rooms: rooms
        .map((room: unknown) =>
          typeof room === 'string' ? room : asText((room as any)?.name),
        )
        .filter((room: string) => room.length > 0 && !archivedRooms.includes(room)),
      archivedRooms: [...new Set(archivedRooms)],
      archived: raw?.archived === true,
    };
  });

  const bookings: Booking[] = candidate.bookings.map((raw: any, index: number) => {
    const totalAmount = asAmount(raw?.totalAmount);
    const advance = asAmount(raw?.advance);
    const status = validStatuses.has(raw?.status)
      ? (raw.status as ReservationStatus)
      : 'confirmed';
    return {
      id: asText(raw?.id, `booking-${index + 1}`),
      villaId: asText(raw?.villaId),
      roomName: asText(raw?.roomName),
      guestName: asText(raw?.guestName),
      phone: asText(raw?.phone),
      from: asText(raw?.from),
      to: asText(raw?.to),
      totalAmount,
      advance,
      remaining: asAmount(raw?.remaining ?? totalAmount - advance),
      status,
    };
  });

  return {
    version: 2,
    villas,
    staff: candidate.staff as Staff[],
    bookings,
    payrollMonths: candidate.payrollMonths as PayrollMonth[],
  };
}

export function hasReservationConflict(
  bookings: Booking[],
  candidate: Pick<Booking, 'villaId' | 'roomName' | 'from' | 'to'>,
  ignoreId?: string,
): boolean {
  if (!candidate.from || !candidate.to || candidate.to <= candidate.from) return true;
  return bookings.some(
    (booking) =>
      booking.id !== ignoreId &&
      booking.villaId === candidate.villaId &&
      booking.roomName === candidate.roomName &&
      !(candidate.to <= booking.from || candidate.from >= booking.to),
  );
}

export function renameRoom(
  data: AppData,
  villaId: string,
  oldName: string,
  newName: string,
): AppData {
  const cleanName = newName.trim();
  if (!cleanName || cleanName === oldName) return data;
  const villa = data.villas.find((item) => item.id === villaId);
  if (!villa || villa.rooms.some((room) => room.toLocaleLowerCase() === cleanName.toLocaleLowerCase())) {
    return data;
  }
  return {
    ...data,
    villas: data.villas.map((item) =>
      item.id === villaId
        ? { ...item, rooms: item.rooms.map((room) => (room === oldName ? cleanName : room)) }
        : item,
    ),
    bookings: data.bookings.map((booking) =>
      booking.villaId === villaId && booking.roomName === oldName
        ? { ...booking, roomName: cleanName }
        : booking,
    ),
  };
}

export function updateVillaDetails(
  data: AppData,
  oldId: string,
  details: { id: string; name: string; nameEn: string },
): AppData {
  const id = details.id.trim();
  const name = details.name.trim();
  const nameEn = details.nameEn.trim();
  if (!id || !name || !nameEn || !data.villas.some((villa) => villa.id === oldId)) {
    return data;
  }
  if (id !== oldId && data.villas.some((villa) => villa.id === id)) return data;
  return {
    ...data,
    villas: data.villas.map((villa) =>
      villa.id === oldId ? { ...villa, id, name, nameEn } : villa,
    ),
    bookings: data.bookings.map((booking) =>
      booking.villaId === oldId ? { ...booking, villaId: id } : booking,
    ),
  };
}

export function archiveRoom(data: AppData, villaId: string, roomName: string): AppData {
  return {
    ...data,
    villas: data.villas.map((villa) => {
      if (villa.id !== villaId || !villa.rooms.includes(roomName)) return villa;
      const usedByReservation = data.bookings.some(
        (booking) => booking.villaId === villaId && booking.roomName === roomName,
      );
      if (usedByReservation) {
        return {
          ...villa,
          rooms: villa.rooms.filter((room) => room !== roomName),
          archivedRooms: [...new Set([...(villa.archivedRooms ?? []), roomName])],
        };
      }
      return { ...villa, rooms: villa.rooms.filter((room) => room !== roomName) };
    }),
  };
}

export function archiveVilla(data: AppData, villaId: string): AppData {
  return {
    ...data,
    villas: data.villas.map((villa) =>
      villa.id === villaId ? { ...villa, archived: true } : villa,
    ),
  };
}

export function removeVilla(data: AppData, villaId: string): AppData {
  const hasReservations = data.bookings.some((booking) => booking.villaId === villaId);
  return hasReservations
    ? archiveVilla(data, villaId)
    : { ...data, villas: data.villas.filter((villa) => villa.id !== villaId) };
}

export function getMonthDayCount(monthId: string): number {
  const [year, month] = monthId.split('-').map(Number);
  return new Date(year, month, 0).getDate();
}

export function monthReservationSpan(
  booking: Pick<Booking, 'from' | 'to'>,
  monthId: string,
): { startDay: number; endDayExclusive: number } | null {
  const [year, month] = monthId.split('-').map(Number);
  const monthStart = new Date(year, month - 1, 1);
  const nextMonth = new Date(year, month, 1);
  const checkIn = new Date(`${booking.from}T00:00:00`);
  const checkOut = new Date(`${booking.to}T00:00:00`);
  if (
    Number.isNaN(checkIn.getTime()) ||
    Number.isNaN(checkOut.getTime()) ||
    checkOut <= monthStart ||
    checkIn >= nextMonth
  ) {
    return null;
  }
  const dayStart = checkIn < monthStart ? 1 : checkIn.getDate();
  const dayEndExclusive =
    checkOut >= nextMonth ? getMonthDayCount(monthId) + 1 : checkOut.getDate();
  return { startDay: dayStart, endDayExclusive: dayEndExclusive };
}
