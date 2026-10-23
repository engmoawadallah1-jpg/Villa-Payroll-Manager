import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Redirect, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { ClerkProvider, SignIn, SignUp, useAuth, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import '@clerk/themes/shadcn.css';
import { Building2, CalendarDays, UsersRound, WalletCards, Plus, Trash2, Share2, Globe2, ShieldCheck, Download, Upload, ChevronDown, AlertTriangle, Check, CircleHelp, ArrowUpRight, X, BedDouble, FileText, LayoutGrid, Boxes, Pencil, LogOut } from 'lucide-react';
import { calculateNetPayout as calcNet, createEmployeeSnapshots as newSnapshot, isValidMonthId as validMonthId, updatePayrollEmployee } from './payroll';
import type { EmployeeSnapshot, PayrollEditableField, PayrollMonth, Staff } from './payroll';
import { migrateAppData, hasReservationConflict } from './operations';
import type { AppData, Booking, ReservationStatus, Villa } from './operations';
import { OperationsPanels } from './OperationsPanels';

const STORE_KEY = 'awadallah-ops-v1';
const APP_STATE_PATH = '/api/app-state';
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY.');
}

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || '/'
    : path;
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: '#c08a2e',
    colorForeground: '#25303d',
    colorMutedForeground: '#737b88',
    colorDanger: '#ba3c32',
    colorBackground: '#fffcf6',
    colorInput: '#ffffff',
    colorInputForeground: '#25303d',
    colorNeutral: '#ddd6ca',
    fontFamily: "'DM Sans', 'Noto Sans Arabic', sans-serif",
    borderRadius: '0.75rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#fffcf6] rounded-2xl w-[440px] max-w-full overflow-hidden border border-[#e4dccf] shadow-xl',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#25303d] font-bold',
    headerSubtitle: 'text-[#737b88]',
    formFieldLabel: 'text-[#25303d]',
    footerActionLink: 'text-[#9a6a19] hover:text-[#724e12]',
    footerActionText: 'text-[#737b88]',
    formButtonPrimary: 'bg-[#c08a2e] text-[#202a35] hover:bg-[#aa7622]',
    formFieldInput: 'border-[#ddd6ca] bg-white text-[#25303d]',
    alert: 'border-[#ead8d4] bg-[#fff5f3]',
  },
};

type SharedAppState = {
  initialized: boolean;
  revision: number;
  data?: AppData;
};

type SharedAppStateConflict = {
  error: string;
  current: SharedAppState;
};
const SEED_VILLAS: Villa[] = [
  { id:'190', name:'فيلا 190', nameEn:'Villa 190', rooms:['1','2','11','12','13','14','15','21','22','23','24','25','26','31'] },
  { id:'196', name:'فيلا 196', nameEn:'Villa 196', rooms:['كارما','فرستشي','تفاني','توكبو','هوجو','شقه 1','شقه 2'] },
  { id:'193', name:'فيلا 193', nameEn:'Villa 193', rooms:['روما','دبي','باريس','لندن','نيويورك','برلين','سيدني'] },
  { id:'40', name:'فيلا 40', nameEn:'Villa 40', rooms:['B1','B2','B3','B4','1','2','3','4','5','6','7','11','12','13','14','15','21','22','23','24','25'] },
];
const STAFF_NAMES = ['بشري','هاجر','حبيبه','فاطمه','مايسه','شيماء','سها','سلمي','اسماء','ايه','رحمه','حنه','زهرا','امال','شوشو','علاء','منه','سوزان 2','شيماء','ام باسم','مصطفى','حماده','ابو زياد','حسين','علاء','بستان','سيد'];
const SEED_STAFF: Staff[] = STAFF_NAMES.map((name, i) => ({ id:`staff-${i+1}`, name, salary:5000, workingDays:26, offDays:4 }));
const currentMonth = () => {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
};
const money = (n: number) => new Intl.NumberFormat('en-EG',{maximumFractionDigits:2}).format(Number.isFinite(n) ? n : 0);
function monthLabel(id: string, lang: string) {
  const [y,m] = id.split('-').map(Number);
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-GB', { month:'long', year:'numeric' }).format(new Date(y,m-1,1));
}
function readInitial(): AppData {
  try {
    const stored = localStorage.getItem(STORE_KEY);
    if (stored) {
      const parsed = migrateAppData(JSON.parse(stored));
      if (parsed) return parsed;
    }
  } catch { /* recover with legacy data and seed values */ }
  const legacy = (key: string) => { try { const val = localStorage.getItem(key); return val ? JSON.parse(val) : null; } catch { return null; } };
  const villas = legacy('villas') || SEED_VILLAS;
  const oldStaff = legacy('staff');
  const legacyStaff = Array.isArray(oldStaff) ? oldStaff : null;
  const staff: Staff[] = legacyStaff ? legacyStaff.map((s: any, i: number) => ({ id:String(s.id ?? `legacy-${i+1}`), name:String(s.name ?? ''), salary:Number(s.salary)||5000, workingDays:Number(s.workingDays ?? s.scheduledDays)||26, offDays:Number(s.offDays)||4 })) : SEED_STAFF;
  const oldBookings = legacy('bookings');
  const bookings: Booking[] = (Array.isArray(oldBookings) ? oldBookings : []).map((b: any, i: number) => ({ ...b, id:String(b.id ?? `legacy-booking-${i}`), phone:String(b.phone ?? ''), totalAmount:Number(b.totalAmount)||0, advance:Number(b.advance)||0, remaining:Number(b.remaining ?? ((Number(b.totalAmount)||0)-(Number(b.advance)||0))), status:b.status||'confirmed' }));
  const id = currentMonth();
  const employees = legacyStaff
    ? legacyStaff.map((s: any, i: number) => {
        const employee = {
          id:String(s.id ?? `legacy-${i+1}`),
          name:String(s.name ?? ''),
          baseSalary:Number(s.salary)||5000,
          scheduledDays:Number(s.workingDays ?? s.scheduledDays)||26,
          attendedDays:Number(s.attendedDays ?? s.workingDays ?? s.scheduledDays)||0,
          offDays:Number(s.offDays)||4,
          bonus:Number(s.bonus)||0,
          deductions:Number(s.deductions)||0,
        };
        return { ...employee, netPayout:calcNet(employee) };
      })
    : newSnapshot(staff);
  return migrateAppData({ version:1, villas, staff, bookings, payrollMonths:[{ id, employees }] })!;
}

const queryClient = new QueryClient();
function PayrollWorkspace() {
  const [data, setData] = useState<AppData>(readInitial);
  const [lang, setLang] = useState<'en'|'ar'>('en');
  const [syncStatus, setSyncStatus] = useState<'loading'|'saved'|'saving'|'offline'|'conflict'>('loading');
  const [dataReady, setDataReady] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [retryVersion, setRetryVersion] = useState(0);
  const [conflictedRemote, setConflictedRemote] = useState<SharedAppState | null>(null);
  const [section, setSection] = useState<'bookings'|'dashboard'|'inventory'|'payroll'>('bookings');
  const [selectedVilla, setSelectedVilla] = useState('all');
  const [monthId, setMonthId] = useState(() => data.payrollMonths.some(m=>m.id===currentMonth()) ? currentMonth() : [...data.payrollMonths].sort((a,b)=>b.id.localeCompare(a.id))[0]?.id || currentMonth());
  const [monthDraft, setMonthDraft] = useState(currentMonth());
  const [notice, setNotice] = useState<{type:'ok'|'error'; text:string}|null>(null);
  const [bookingError, setBookingError] = useState('');
  const [form, setForm] = useState({ villaId:'190', roomName:'', guestName:'', phone:'', from:'', to:'', totalAmount:'', advance:'', status:'confirmed' as ReservationStatus });
  const [editingBooking, setEditingBooking] = useState<string|null>(null);
  const [newStaff, setNewStaff] = useState({ name:'', salary:'5000', workingDays:'26', offDays:'4' });
  const importRef = useRef<HTMLInputElement>(null);
  const dataRef = useRef(data);
  const revisionRef = useRef(0);
  const lastSyncedRef = useRef('');
  const conflictRef = useRef<SharedAppState | null>(null);
  const savingRef = useRef(false);
  const { signOut } = useClerk();
  const t = lang === 'ar' ? {
    bookings:'الحجوزات', payroll:'الرواتب', newBooking:'حجز جديد', villa:'الفيلا', room:'الغرفة', guest:'اسم النزيل', phone:'رقم الهاتف', arrival:'تاريخ الوصول', departure:'تاريخ المغادرة', total:'الإجمالي', advance:'المدفوع مقدماً', remaining:'المتبقي', save:'حفظ الحجز', all:'كل الفلل', emptyBookings:'لا توجد حجوزات في هذا العرض', share:'مشاركة واتساب', remove:'حذف', confirmDelete:'هل تريد حذف هذا الحجز؟', conflict:'الغرفة محجوزة بالفعل خلال هذه التواريخ. اختر غرفة أو موعداً آخر.', invalidDates:'يجب أن يكون تاريخ المغادرة بعد تاريخ الوصول.', month:'شهر الرواتب', createMonth:'إنشاء شهر', monthExists:'هذا الشهر موجود بالفعل.', staff:'الموظفون', salary:'الراتب الأساسي', scheduled:'أيام العمل المجدولة', attended:'أيام الحضور', daysOff:'الإجازات', bonus:'مكافأة', deductions:'خصومات', net:'صافي المستحق', totalPayout:'إجمالي المستحقات', attendance:'الحضور', employees:'موظف', addStaff:'إضافة موظف للطاقم', name:'اسم الموظف', saveStaff:'إضافة للطاقم', noStaff:'لا يوجد موظفون في القائمة الأساسية.', backup:'نسخة احتياطية', export:'تصدير JSON', import:'استيراد نسخة', replaceBackup:'استيراد هذه النسخة سيستبدل الحجوزات والطاقم وسجل الرواتب المشترك. هل تريد المتابعة؟', localNotice:'البيانات محفوظة بشكل مشترك وتتم مزامنتها بين الأجهزة المعتمدة. صدّر نسخة احتياطية بانتظام.', backupOk:'تم استيراد النسخة الاحتياطية بنجاح.', backupError:'ملف النسخة غير صالح أو لا يتوافق مع صيغة التطبيق.', bookingSaved:'تم حفظ الحجز.', staffAdded:'تمت إضافة الموظف إلى الطاقم. الأشهر السابقة لن تتغير.', deleteStaff:'حذف من الطاقم', noPhone:'لا يوجد رقم هاتف', bookingsCount:'حجوزات', allMonths:'سجل الرواتب مستقل لكل شهر', days:'يوم', notFound:'لا يوجد راتب لهذا الشهر.', calculated:'يُحسب الراتب بنسبة الحضور ضمن الأيام المجدولة.', noVillas:'لا توجد فلل مضافة.'
  } : {
    bookings:'Bookings', payroll:'Payroll', newBooking:'New reservation', villa:'Villa', room:'Room', guest:'Guest name', phone:'Phone number', arrival:'Check-in', departure:'Check-out', total:'Total amount', advance:'Deposit paid', remaining:'Remaining', save:'Save booking', all:'All villas', emptyBookings:'No bookings in this view', share:'Share via WhatsApp', remove:'Delete', confirmDelete:'Delete this booking?', conflict:'This room is already booked during those dates. Choose another room or date range.', invalidDates:'Check-out must be after check-in.', month:'Payroll month', createMonth:'Create month', monthExists:'That month already exists.', staff:'Employees', salary:'Base salary', scheduled:'Scheduled days', attended:'Days attended', daysOff:'Days off', bonus:'Bonus', deductions:'Deductions', net:'Net payout', totalPayout:'Total payout', attendance:'Attendance', employees:'employees', addStaff:'Add to staff roster', name:'Employee name', saveStaff:'Add to roster', noStaff:'No employees in the base roster.', backup:'Data backup', export:'Export JSON', import:'Import backup', replaceBackup:'Importing this backup will replace the shared bookings, staff roster, and payroll records. Continue?', localNotice:'Shared records sync between approved devices. Export a backup regularly.', backupOk:'Backup imported successfully.', backupError:'This file is invalid or does not match the app format.', bookingSaved:'Booking saved.', staffAdded:'Employee added to roster. Past months remain unchanged.', deleteStaff:'Remove from roster', noPhone:'No phone number', bookingsCount:'bookings', allMonths:'Independent payroll records by month', days:'days', notFound:'No payroll for this month.', calculated:'Payout is prorated by attendance against scheduled days.', noVillas:'No villas added.'
  };
  const applySharedState = useCallback((remote: SharedAppState) => {
    if (!remote.initialized || !remote.data) return false;
    revisionRef.current = remote.revision;
    lastSyncedRef.current = JSON.stringify(remote.data);
    dataRef.current = remote.data;
    conflictRef.current = null;
    setConflictedRemote(null);
    setData(remote.data);
    setDataReady(true);
    setAccessDenied(false);
    setSessionExpired(false);
    setSyncStatus('saved');
    return true;
  }, []);
  const markConflict = useCallback((remote: SharedAppState) => {
    conflictRef.current = remote;
    setConflictedRemote(remote);
    setSyncStatus('conflict');
  }, []);
  const saveLatest = useCallback(async () => {
    if (savingRef.current || conflictRef.current) return;
    savingRef.current = true;
    setSyncStatus('saving');
    try {
      while (true) {
        const current = dataRef.current;
        const snapshot = JSON.stringify(current);
        if (snapshot === lastSyncedRef.current) break;

        const response = await fetch(APP_STATE_PATH, {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ revision: revisionRef.current, data: current }),
        });
        const result = await response.json().catch(() => null) as SharedAppState | SharedAppStateConflict | null;

        if (response.status === 409) {
          const conflict = result as SharedAppStateConflict | null;
          if (conflict?.current) markConflict(conflict.current);
          else setSyncStatus('offline');
          return;
        }
        if (response.status === 401) {
          setDataReady(false);
          setSessionExpired(true);
          return;
        }
        if (response.status === 403) {
          setDataReady(false);
          setAccessDenied(true);
          return;
        }

        const saved = result as SharedAppState | null;
        if (!response.ok || !saved?.initialized || !saved.data) {
          throw new Error('Shared records could not be saved.');
        }
        revisionRef.current = saved.revision;
        lastSyncedRef.current = JSON.stringify(saved.data);
        if (JSON.stringify(dataRef.current) === lastSyncedRef.current) break;
      }
      setSyncStatus('saved');
    } catch {
      setSyncStatus('offline');
    } finally {
      savingRef.current = false;
    }
  }, [markConflict]);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    let active = true;
    const initialize = async () => {
      setSyncStatus('loading');
      try {
        const response = await fetch(APP_STATE_PATH, { credentials: 'include' });
        if (response.status === 401) {
          if (active) { setDataReady(false); setSessionExpired(true); }
          return;
        }
        if (response.status === 403) {
          if (active) { setDataReady(false); setAccessDenied(true); }
          return;
        }
        if (!response.ok) throw new Error('Shared records could not be loaded.');
        const remote = await response.json() as SharedAppState;
        if (!active) return;
        if (remote.initialized) {
          if (!applySharedState(remote)) throw new Error('Shared records are incomplete.');
          return;
        }

        const firstSave = await fetch(APP_STATE_PATH, {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ revision: remote.revision, data: dataRef.current }),
        });
        const saved = await firstSave.json().catch(() => null) as SharedAppState | SharedAppStateConflict | null;
        if (!active) return;
        if (firstSave.status === 409) {
          const conflict = saved as SharedAppStateConflict | null;
          if (conflict?.current && applySharedState(conflict.current)) return;
          throw new Error('Shared records could not be initialized.');
        }
        if (firstSave.status === 401) {
          setDataReady(false); setSessionExpired(true); return;
        }
        if (firstSave.status === 403) {
          setDataReady(false); setAccessDenied(true); return;
        }
        if (!firstSave.ok || !applySharedState(saved as SharedAppState)) {
          throw new Error('Shared records could not be initialized.');
        }
      } catch {
        if (active) {
          setDataReady(false);
          setSyncStatus('offline');
        }
      }
    };

    void initialize();
    return () => { active = false; };
  }, [retryVersion, applySharedState]);

  useEffect(() => {
    if (!dataReady) return;
    const pollSharedData = async () => {
      if (savingRef.current || conflictRef.current) return;
      try {
        const response = await fetch(APP_STATE_PATH, { credentials: 'include' });
        if (response.status === 401) {
          setDataReady(false); setSessionExpired(true); return;
        }
        if (response.status === 403) {
          setDataReady(false); setAccessDenied(true); return;
        }
        if (!response.ok) throw new Error('Shared records could not be refreshed.');

        const remote = await response.json() as SharedAppState;
        const dirty = JSON.stringify(dataRef.current) !== lastSyncedRef.current;
        if (remote.revision > revisionRef.current) {
          if (dirty) {
            markConflict(remote);
            return;
          }
          if (!applySharedState(remote)) throw new Error('Shared records are incomplete.');
          return;
        }
        if (dirty) {
          void saveLatest();
          return;
        }
        setSyncStatus('saved');
      } catch {
        setSyncStatus('offline');
      }
    };

    const interval = window.setInterval(() => { void pollSharedData(); }, 3000);
    return () => window.clearInterval(interval);
  }, [dataReady, applySharedState, markConflict, saveLatest]);

  useEffect(() => {
    if (!dataReady || conflictedRemote) return;
    if (JSON.stringify(data) === lastSyncedRef.current) return;
    const timeout = window.setTimeout(() => { void saveLatest(); }, 450);
    return () => window.clearTimeout(timeout);
  }, [data, dataReady, conflictedRemote, saveLatest]);

  const activeMonth = data.payrollMonths.find(m => m.id === monthId);
  const sortedMonths = useMemo(() => [...data.payrollMonths].sort((a,b) => b.id.localeCompare(a.id)), [data.payrollMonths]);
  const visibleBookings = data.bookings.filter(b => selectedVilla === 'all' || b.villaId === selectedVilla).slice().sort((a,b) => b.from.localeCompare(a.from));
  const totalPayout = activeMonth?.employees.reduce((sum,e) => sum + e.netPayout,0) ?? 0;
  const changeEmployee = (id:string, field:PayrollEditableField, raw:string) =>
    setData(prev => ({ ...prev, payrollMonths:updatePayrollEmployee(prev.payrollMonths, monthId, id, field, raw) }));
  const createMonth = () => {
    const id = monthDraft.trim();
    if (!validMonthId(id)) { setNotice({type:'error',text:lang==='ar'?'أدخل الشهر بصيغة YYYY-MM.':'Enter the month as YYYY-MM.'}); return; }
    if (data.payrollMonths.some(m => m.id === id)) { setNotice({type:'error',text:t.monthExists}); setMonthId(id); return; }
    setData(prev => ({ ...prev, payrollMonths:[...prev.payrollMonths,{id,employees:newSnapshot(prev.staff)}] }));
    setMonthId(id); setNotice({type:'ok',text:lang==='ar'?'تم إنشاء سجل الشهر.':'Month record created.'});
  };
  const addBooking = (ev:FormEvent) => {
    ev.preventDefault(); setBookingError('');
    if (form.to <= form.from) { setBookingError(t.invalidDates); return; }
    const conflict = hasReservationConflict(data.bookings,{villaId:form.villaId,roomName:form.roomName,from:form.from,to:form.to},editingBooking||undefined);
    if (conflict) { setBookingError(t.conflict); return; }
    const totalAmount = Number(form.totalAmount)||0, advance = Number(form.advance)||0;
    const booking: Booking = { ...form, id:editingBooking||`booking-${Date.now()}-${Math.random().toString(36).slice(2,7)}`, totalAmount, advance, remaining:totalAmount-advance };
    setData(prev => ({...prev,bookings:editingBooking?prev.bookings.map(b=>b.id===editingBooking?booking:b):[booking,...prev.bookings]}));
    setForm({villaId:data.villas.find(v=>!v.archived)?.id||'',roomName:'',guestName:'',phone:'',from:'',to:'',totalAmount:'',advance:'',status:'confirmed'});
    setEditingBooking(null);
    setNotice({type:'ok',text:t.bookingSaved});
  };
  const editBooking = (booking:Booking) => {
    setForm({villaId:booking.villaId,roomName:booking.roomName,guestName:booking.guestName,phone:booking.phone,from:booking.from,to:booking.to,totalAmount:String(booking.totalAmount),advance:String(booking.advance),status:booking.status});
    setEditingBooking(booking.id); setSection('bookings'); setBookingError('');
    window.scrollTo({top:0,behavior:'smooth'});
  };
  const newBookingAt = (villaId:string, date:string) => {
    setForm({villaId,roomName:'',guestName:'',phone:'',from:date,to:'',totalAmount:'',advance:'',status:'confirmed'});
    setEditingBooking(null); setSection('bookings'); setBookingError('');
    window.scrollTo({top:0,behavior:'smooth'});
  };
  const deleteBooking = (id:string) => { if (window.confirm(t.confirmDelete)) setData(prev => ({...prev,bookings:prev.bookings.filter(b=>b.id!==id)})); };
  const addRosterStaff = (ev:FormEvent) => {
    ev.preventDefault();
    if (!newStaff.name.trim()) return;
    const employee:Staff = {id:`staff-${Date.now()}`,name:newStaff.name.trim(),salary:Number(newStaff.salary)||0,workingDays:Number(newStaff.workingDays)||0,offDays:Number(newStaff.offDays)||0};
    setData(prev => ({...prev,staff:[...prev.staff,employee]})); setNewStaff({name:'',salary:'5000',workingDays:'26',offDays:'4'}); setNotice({type:'ok',text:t.staffAdded});
  };
  const updateRoster = (id:string, field:keyof Staff, value:string) => setData(prev=>({...prev,staff:prev.staff.map(s=>s.id!==id?s:{...s,[field]:field==='name'?value:Math.max(0,Number(value)||0)})}));
  const exportBackup = () => {
    const blob = new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download=`awadallah-backup-${currentMonth()}.json`; a.click(); URL.revokeObjectURL(url);
    setNotice({type:'ok',text:lang==='ar'?'تم تنزيل النسخة الاحتياطية.':'Backup downloaded.'});
  };
  const importBackup = async (file?:File) => {
    if (!file) return;
    try {
      const candidate = JSON.parse(await file.text());
       const good = (candidate?.version===1||candidate?.version===2) && Array.isArray(candidate.villas) && candidate.villas.every((v: any)=>typeof v.id==='string'&&typeof v.name==='string'&&typeof v.nameEn==='string'&&Array.isArray(v.rooms)&&v.rooms.every((room:any)=>typeof room==='string')) &&
         Array.isArray(candidate.staff) && candidate.staff.every((s:any)=>typeof s.id==='string'&&typeof s.name==='string'&&['salary','workingDays','offDays'].every(k=>Number.isFinite(Number(s[k])))) &&
         Array.isArray(candidate.bookings) && candidate.bookings.every((b:any)=>typeof b.id==='string'&&typeof b.guestName==='string'&&typeof b.phone==='string'&&typeof b.villaId==='string'&&typeof b.roomName==='string'&&typeof b.from==='string'&&typeof b.to==='string'&&['totalAmount','advance','remaining'].every(k=>Number.isFinite(Number(b[k])))) &&
         Array.isArray(candidate.payrollMonths) && candidate.payrollMonths.length>0 && new Set(candidate.payrollMonths.map((m:any)=>m.id)).size===candidate.payrollMonths.length &&
         candidate.payrollMonths.every((m:any)=>validMonthId(m.id)&&Array.isArray(m.employees)&&m.employees.every((e:any)=>typeof e.id==='string'&&typeof e.name==='string'&&['baseSalary','scheduledDays','attendedDays','offDays','bonus','deductions','netPayout'].every(k=>Number.isFinite(Number(e[k])))));
      if (!good) throw new Error('invalid');
      if (!window.confirm(t.replaceBackup)) {
        if(importRef.current) importRef.current.value='';
        return;
      }
      const migrated=migrateAppData(candidate); if(!migrated) throw new Error('invalid');
      const cleaned:AppData = {...migrated,version:2,payrollMonths:migrated.payrollMonths.map((m:PayrollMonth)=>({...m,employees:m.employees.map(e=>({...e,netPayout:calcNet(e)}))}))};
      setData(cleaned); if(cleaned.payrollMonths.length) setMonthId([...cleaned.payrollMonths].sort((a,b)=>b.id.localeCompare(a.id))[0].id);
      setNotice({type:'ok',text:t.backupOk});
    } catch { setNotice({type:'error',text:t.backupError}); }
    if(importRef.current) importRef.current.value='';
  };
  const shareBooking = (b:Booking) => {
    const villa = data.villas.find(v=>v.id===b.villaId);
    const villaLabel = lang==='ar' ? villa?.name : villa?.nameEn;
    const message = lang==='ar'
      ? `عوض الله أوتيلز وفيلل — تأكيد حجز\nالعقار: ${villaLabel||b.villaId}، الغرفة: ${b.roomName}\nالنزيل: ${b.guestName}\nالوصول: ${b.from} | المغادرة: ${b.to}\nالإجمالي: ${money(b.totalAmount)} ج.م\nالمدفوع: ${money(b.advance)} ج.م | المتبقي: ${money(b.remaining)} ج.م`
      : `Awadallah Hotels & Villas — Booking confirmation\nProperty: ${villaLabel||b.villaId}, Room: ${b.roomName}\nGuest: ${b.guestName}\nCheck-in: ${b.from} | Check-out: ${b.to}\nTotal: EGP ${money(b.totalAmount)}\nPaid: EGP ${money(b.advance)} | Remaining: EGP ${money(b.remaining)}`;
    window.open(`https://wa.me/${b.phone.replace(/\D/g,'')}?text=${encodeURIComponent(message)}`,'_blank','noopener,noreferrer');
  };
  const inputClass = 'w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15';
  const smallInput = 'w-[5.8rem] rounded-md border border-border bg-background px-2 py-2 text-right font-mono text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15';
  const activeVillaLabel = (id:string) => { const v=data.villas.find(v=>v.id===id); return lang==='ar'?v?.name:v?.nameEn; };
  const syncLabels = lang === 'ar'
    ? { loading:'جارٍ تحميل السجلات المشتركة…', saved:'متزامن بين الأجهزة', saving:'جارٍ حفظ التغييرات…', offline:'غير متصل · ستتم إعادة المحاولة', conflict:'تعارض في المزامنة' }
    : { loading:'Loading shared records…', saved:'Synced across devices', saving:'Saving changes…', offline:'Offline · retrying', conflict:'Sync conflict' };
  const syncColors = {
    loading:'bg-amber-500',
    saved:'bg-emerald-600',
    saving:'bg-amber-500',
    offline:'bg-rose-600',
    conflict:'bg-rose-600',
  };
  if (!dataReady) {
    const title = accessDenied
      ? (lang==='ar'?'الحساب غير معتمد':'Account not approved')
      : sessionExpired
        ? (lang==='ar'?'انتهت الجلسة':'Sign-in required')
        : syncStatus === 'offline'
          ? (lang==='ar'?'تعذر الاتصال بالسجلات المشتركة':'Could not reach shared records')
          : (lang==='ar'?'جاري التحقق من الوصول':'Checking secure access');
    const detail = accessDenied
      ? (lang==='ar'?'استخدم بريداً إلكترونياً معتمداً ومفعّلاً للوصول إلى بيانات التشغيل.':'Use an approved, verified email address to access the staff records.')
      : sessionExpired
        ? (lang==='ar'?'سجّل الدخول مرة أخرى لمتابعة العمل.':'Sign in again to continue.')
        : syncStatus === 'offline'
          ? (lang==='ar'?'لم يتم عرض أي بيانات. تحقّق من الاتصال ثم أعد المحاولة.':'No payroll data is shown until the shared server is reachable.')
          : (lang==='ar'?'يتم تحميل البيانات المشتركة بأمان…':'Loading the shared records securely…');
    return <main className="flex min-h-[100dvh] items-center justify-center bg-background px-4 py-10 text-foreground">
      <section className="w-full max-w-md rounded-2xl border border-border bg-card p-7 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Building2 size={24}/></div>
        <p className="mt-4 text-xs font-bold tracking-[.18em] text-muted-foreground">AWADALLAH · HOTELS & VILLAS</p>
        <h1 className="mt-5 text-xl font-bold">{title}</h1>
        <p role="status" className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p>
        <div className="mt-6 flex justify-center gap-2">
          {accessDenied
            ? <button onClick={()=>void signOut({redirectUrl:basePath||'/'})} className="rounded-lg bg-sidebar px-4 py-2.5 text-sm font-bold text-sidebar-foreground">{lang==='ar'?'تسجيل الخروج':'Sign out'}</button>
            : sessionExpired
              ? <a href={`${basePath}/sign-in`} className="rounded-lg bg-sidebar px-4 py-2.5 text-sm font-bold text-sidebar-foreground">{lang==='ar'?'تسجيل الدخول':'Sign in'}</a>
              : syncStatus === 'offline'
                ? <button onClick={()=>{setAccessDenied(false);setSessionExpired(false);setRetryVersion(v=>v+1);}} className="rounded-lg bg-sidebar px-4 py-2.5 text-sm font-bold text-sidebar-foreground">{lang==='ar'?'إعادة المحاولة':'Try again'}</button>
                : <span className="text-xs text-muted-foreground">{syncLabels.loading}</span>}
        </div>
      </section>
    </main>;
  }
  return <div dir={lang==='ar'?'rtl':'ltr'} className="min-h-[100dvh] bg-background text-foreground">
    <div className="flex min-h-[100dvh] flex-col md:flex-row">
      <aside className="md:sticky md:top-0 md:flex md:h-[100dvh] md:w-[246px] md:shrink-0 md:flex-col bg-sidebar text-sidebar-foreground">
        <div className="flex items-center gap-3 px-5 py-6 border-b border-white/10">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Building2 size={22}/></div>
          <div><div className="text-sm font-bold tracking-tight">AWADALLAH</div><div className="mt-0.5 text-[10px] tracking-[.17em] text-sidebar-foreground/55">HOTELS & VILLAS</div></div>
        </div>
        <div className="px-4 pt-6 pb-2 text-[10px] font-bold uppercase tracking-[.18em] text-sidebar-foreground/40">{lang==='ar'?'العمليات':'Operations'}</div>
        <nav className="flex gap-1 px-3 md:flex-col">
          <button data-testid="nav-bookings" onClick={()=>setSection('bookings')} className={`flex flex-1 items-center gap-3 rounded-lg px-3 py-3 text-sm font-semibold transition md:flex-none ${section==='bookings'?'bg-sidebar-accent text-white':'text-sidebar-foreground/65 hover:bg-white/5 hover:text-white'}`}><CalendarDays size={17}/>{t.bookings}<span className="ms-auto rounded-full bg-white/10 px-2 py-0.5 text-[10px]">{data.bookings.length}</span></button>
          <button data-testid="nav-dashboard" onClick={()=>setSection('dashboard')} className={`flex flex-1 items-center gap-3 rounded-lg px-3 py-3 text-sm font-semibold transition md:flex-none ${section==='dashboard'?'bg-sidebar-accent text-white':'text-sidebar-foreground/65 hover:bg-white/5 hover:text-white'}`}><LayoutGrid size={17}/>{lang==='ar'?'لوحة التشغيل':'Operations dashboard'}</button>
          <button data-testid="nav-inventory" onClick={()=>setSection('inventory')} className={`flex flex-1 items-center gap-3 rounded-lg px-3 py-3 text-sm font-semibold transition md:flex-none ${section==='inventory'?'bg-sidebar-accent text-white':'text-sidebar-foreground/65 hover:bg-white/5 hover:text-white'}`}><Boxes size={17}/>{lang==='ar'?'المخزون':'Inventory'}</button>
          <button data-testid="nav-payroll" onClick={()=>setSection('payroll')} className={`flex flex-1 items-center gap-3 rounded-lg px-3 py-3 text-sm font-semibold transition md:flex-none ${section==='payroll'?'bg-sidebar-accent text-white':'text-sidebar-foreground/65 hover:bg-white/5 hover:text-white'}`}><WalletCards size={17}/>{t.payroll}</button>
        </nav>
        <div className="mt-auto hidden p-4 md:block">
          <div className="rounded-xl border border-white/10 bg-white/[.04] p-3.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-white"><ShieldCheck size={15} className="text-primary"/>{lang==='ar'?'السجلات المشتركة':'Shared records'}</div>
            <p className="mt-2 text-[11px] leading-relaxed text-sidebar-foreground/55">{t.localNotice}</p>
          </div>
          <div className="mt-4 text-[10px] text-sidebar-foreground/35">AWADALLAH · OPS DESK</div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex min-h-[68px] items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur md:px-8">
          <div className="min-w-0">
            <div className="text-xs font-medium text-muted-foreground">{lang==='ar'?'عوض الله أوتيلز وفيلل':'Awadallah Hotels & Villas'}</div>
            <div className="mt-0.5 truncate text-lg font-bold tracking-tight">{section==='bookings'?t.bookings:section==='payroll'?t.payroll:lang==='ar'?section==='dashboard'?'لوحة التشغيل':'المخزون':section==='dashboard'?'Operations dashboard':'Inventory'}</div>
          </div>
          <div className="flex items-center gap-2">
            <div aria-live="polite" className="hidden items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-[11px] font-medium text-muted-foreground sm:flex"><span className={`h-1.5 w-1.5 rounded-full ${syncColors[syncStatus]}`}/>{syncLabels[syncStatus]}</div>
            <button data-testid="button-language" onClick={()=>setLang(lang==='en'?'ar':'en')} className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold hover:bg-muted"><Globe2 size={15}/>{lang==='en'?'العربية':'English'}</button>
            <button onClick={()=>void signOut({redirectUrl:basePath||'/'})} title={lang==='ar'?'تسجيل الخروج':'Sign out'} aria-label={lang==='ar'?'تسجيل الخروج':'Sign out'} className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"><LogOut size={15}/></button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1500px] px-4 py-6 md:px-8 md:py-8">
          {conflictedRemote?.data && <div role="alert" className="mb-5 flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 sm:flex-row sm:items-center">
            <div className="flex-1"><div className="font-bold">{lang==='ar'?'تم حفظ تغييرات أحدث على جهاز آخر':'Newer changes were saved on another device'}</div><p className="mt-1 text-xs leading-5">{lang==='ar'?'لم تُحفظ تغييراتك المحلية. صدّر نسخة احتياطية إذا أردت الاحتفاظ بها قبل تحميل السجلات المشتركة الأحدث.':'Your local edits were not saved. Export a backup first if you need them, then load the latest shared records.'}</p></div>
            <button onClick={()=>{const latest=conflictRef.current;if(latest?.data&&window.confirm(lang==='ar'?'سيتم استبدال التغييرات المحلية بالسجلات المشتركة الأحدث. هل تريد المتابعة؟':'Loading the latest records will discard your unsaved local edits. Continue?'))applySharedState(latest);}} className="shrink-0 rounded-lg bg-rose-900 px-3 py-2 text-xs font-bold text-white hover:bg-rose-800">{lang==='ar'?'تحميل السجلات الأحدث':'Load latest records'}</button>
          </div>}
          {notice && <div data-testid="status-notice" className={`mb-5 flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${notice.type==='ok'?'border-emerald-200 bg-emerald-50 text-emerald-800':'border-rose-200 bg-rose-50 text-rose-800'}`}><span className="flex-1">{notice.text}</span><button data-testid="button-dismiss-notice" onClick={()=>setNotice(null)} aria-label="Dismiss"><X size={16}/></button></div>}
          {section==='bookings' ? <div className="fade-in">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
              <div><div className="text-xs font-bold uppercase tracking-[.16em] text-primary">{lang==='ar'?'الإقامة والضيافة':'STAYS & GUESTS'}</div><h1 className="mt-1 text-2xl font-bold tracking-tight">{lang==='ar'?'سجل الحجوزات':'Reservation ledger'}</h1><p className="mt-1 text-sm text-muted-foreground">{lang==='ar'?'مواعيد الإقامة، الغرف، والمدفوعات في مكان واحد':'Stay dates, room assignments and payments in one place'}</p></div>
              <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground"><BedDouble size={15}/><span data-testid="text-bookings-count">{visibleBookings.length} {t.bookingsCount}</span></div>
            </div>
            <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
              <section className="rounded-xl border border-border bg-card shadow-sm">
                <div className="flex items-center gap-3 border-b border-border px-5 py-4"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/12 text-primary"><Plus size={18}/></div><div><h2 className="text-sm font-bold">{editingBooking?(lang==='ar'?'تعديل الحجز':'Edit reservation'):t.newBooking}</h2><p className="text-xs text-muted-foreground">{lang==='ar'?'أدخل تفاصيل الضيف والإقامة':'Enter guest and stay details'}</p></div></div>
                <form onSubmit={addBooking} className="space-y-3.5 p-5">
                  <label className="block"><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">{t.villa}</span><select data-testid="select-booking-villa" className={inputClass} value={form.villaId} required onChange={e=>setForm({...form,villaId:e.target.value,roomName:''})}>{data.villas.filter(v=>!v.archived||v.id===form.villaId).map(v=><option key={v.id} value={v.id}>{lang==='ar'?v.name:v.nameEn}{v.archived?' · archived':''}</option>)}</select></label>
                  <label className="block"><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">{t.room}</span><select data-testid="select-booking-room" className={inputClass} value={form.roomName} required onChange={e=>setForm({...form,roomName:e.target.value})}><option value="">{lang==='ar'?'اختر الغرفة':'Select a room'}</option>{(data.villas.find(v=>v.id===form.villaId)?.rooms||[]).map(r=><option key={r} value={r}>{r}</option>)}</select></label>
                  <label className="block"><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">{t.guest}</span><input data-testid="input-guest-name" className={inputClass} required value={form.guestName} onChange={e=>setForm({...form,guestName:e.target.value})} placeholder={lang==='ar'?'اسم الضيف الكامل':'Guest full name'}/></label>
                  <label className="block"><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">{t.phone}</span><input data-testid="input-guest-phone" type="tel" className={inputClass} value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} placeholder="2010…"/></label>
                  <div className="grid grid-cols-2 gap-3">
                    <label><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">{t.arrival}</span><input data-testid="input-checkin-date" type="date" className={inputClass} required value={form.from} onChange={e=>setForm({...form,from:e.target.value})}/></label>
                    <label><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">{t.departure}</span><input data-testid="input-checkout-date" type="date" className={inputClass} required value={form.to} onChange={e=>setForm({...form,to:e.target.value})}/></label>
                  </div>
                  <label className="block"><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">{lang==='ar'?'حالة الحجز':'Reservation status'}</span><select data-testid="select-booking-status" className={inputClass} value={form.status} onChange={e=>setForm({...form,status:e.target.value as ReservationStatus})}>{(['confirmed','checked-in','checked-out','blocked'] as ReservationStatus[]).map(status=><option key={status} value={status}>{lang==='ar'?({confirmed:'مؤكد','checked-in':'تم الوصول','checked-out':'تم المغادرة',blocked:'محجوب'}[status]):({confirmed:'Confirmed','checked-in':'Checked in','checked-out':'Checked out',blocked:'Blocked'}[status])}</option>)}</select></label>
                  <div className="grid grid-cols-2 gap-3">
                    <label><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">{t.total}</span><input data-testid="input-booking-total" type="number" min="0" step="0.01" className={inputClass} value={form.totalAmount} onChange={e=>setForm({...form,totalAmount:e.target.value})} placeholder="0.00"/></label>
                    <label><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">{t.advance}</span><input data-testid="input-booking-advance" type="number" min="0" step="0.01" className={inputClass} value={form.advance} onChange={e=>setForm({...form,advance:e.target.value})} placeholder="0.00"/></label>
                  </div>
                  {bookingError && <div data-testid="status-booking-error" className="flex items-start gap-2 rounded-lg bg-rose-50 p-3 text-xs leading-relaxed text-rose-800"><AlertTriangle size={15} className="mt-0.5 shrink-0"/>{bookingError}</div>}
                  <div className="flex items-center justify-between border-t border-border pt-3 text-xs"><span className="text-muted-foreground">{t.remaining}</span><strong data-testid="text-booking-live-remaining" className="font-mono text-foreground">{money((Number(form.totalAmount)||0)-(Number(form.advance)||0))} EGP</strong></div>
                  <button data-testid="button-save-booking" type="submit" className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-bold text-primary-foreground transition hover:brightness-95"><Check size={16}/>{editingBooking?(lang==='ar'?'حفظ التعديلات':'Save changes'):t.save}</button>
                  {editingBooking&&<button data-testid="button-cancel-edit-booking" type="button" onClick={()=>{setEditingBooking(null);setForm({villaId:data.villas.find(v=>!v.archived)?.id||'',roomName:'',guestName:'',phone:'',from:'',to:'',totalAmount:'',advance:'',status:'confirmed'})}} className="w-full rounded-lg border border-border py-2 text-xs font-semibold">{lang==='ar'?'إلغاء التعديل':'Cancel editing'}</button>}
                </form>
              </section>
              <section className="min-w-0">
                <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="text-sm font-bold">{lang==='ar'?'الحجوزات الحالية والقادمة':'Current & upcoming stays'}</h2><p className="mt-1 text-xs text-muted-foreground">{lang==='ar'?'تُمنع الحجوزات المتداخلة للغرفة نفسها تلقائياً':'Overlapping dates for the same room are prevented'}</p></div><div className="relative"><select data-testid="select-villa-filter" value={selectedVilla} onChange={e=>setSelectedVilla(e.target.value)} className="appearance-none rounded-lg border border-border bg-card py-2 ps-3 pe-9 text-xs font-semibold outline-none focus:border-primary"><option value="all">{t.all}</option>{data.villas.map(v=><option key={v.id} value={v.id}>{lang==='ar'?v.name:v.nameEn}</option>)}</select><ChevronDown size={14} className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground"/></div></div>
                <div className="mb-3 flex gap-2 overflow-x-auto pb-1 soft-scroll"><button data-testid="filter-villa-all" onClick={()=>setSelectedVilla('all')} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${selectedVilla==='all'?'bg-sidebar text-white':'border border-border bg-card text-muted-foreground'}`}>{t.all}</button>{data.villas.map(v=><button data-testid={`filter-villa-${v.id}`} key={v.id} onClick={()=>setSelectedVilla(v.id)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${selectedVilla===v.id?'bg-sidebar text-white':'border border-border bg-card text-muted-foreground'}`}>{lang==='ar'?v.name:v.nameEn}</button>)}</div>
                {visibleBookings.length===0 ? <div data-testid="empty-bookings" className="flex min-h-[250px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/60 px-6 text-center"><div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground"><CalendarDays size={21}/></div><h3 className="text-sm font-bold">{t.emptyBookings}</h3><p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">{data.villas.length?t.newBooking:t.noVillas}</p></div>:
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {visibleBookings.map((b,i)=><article data-testid={`card-booking-${b.id}`} key={b.id} style={{animationDelay:`${Math.min(i,8)*35}ms`}} className="fade-in rounded-xl border border-border bg-card p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><span data-testid={`text-booking-property-${b.id}`} className="rounded-md bg-secondary px-2 py-1 text-[11px] font-bold text-secondary-foreground">{activeVillaLabel(b.villaId)||b.villaId}</span><span className="rounded-md bg-muted px-2 py-1 text-[11px] font-semibold text-muted-foreground">{t.room} {b.roomName}</span><span data-testid={`status-booking-${b.id}`} className={`rounded-md border px-2 py-1 text-[10px] font-bold ${b.status==='confirmed'?'border-sky-200 bg-sky-100 text-sky-900':b.status==='checked-in'?'border-emerald-200 bg-emerald-100 text-emerald-900':b.status==='checked-out'?'border-stone-300 bg-stone-200 text-stone-800':'border-rose-200 bg-rose-100 text-rose-900'}`}>{lang==='ar'?({confirmed:'مؤكد','checked-in':'تم الوصول','checked-out':'تم المغادرة',blocked:'محجوب'}[b.status]):({confirmed:'Confirmed','checked-in':'Checked in','checked-out':'Checked out',blocked:'Blocked'}[b.status])}</span></div><h3 data-testid={`text-booking-guest-${b.id}`} className="mt-3 text-base font-bold">{b.guestName}</h3><p className="mt-0.5 text-xs text-muted-foreground">{b.phone||t.noPhone}</p></div><div className="flex"><button data-testid={`button-edit-booking-${b.id}`} onClick={()=>editBooking(b)} title={lang==='ar'?'تعديل':'Edit'} className="rounded-md p-2 text-muted-foreground transition hover:bg-primary/10 hover:text-primary"><Pencil size={15}/></button><button data-testid={`button-delete-booking-${b.id}`} onClick={()=>deleteBooking(b.id)} title={t.remove} className="rounded-md p-2 text-muted-foreground transition hover:bg-rose-50 hover:text-destructive"><Trash2 size={16}/></button></div></div>
                    <div className="my-4 grid grid-cols-2 gap-3 border-y border-border py-3"><div><div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t.arrival}</div><div data-testid={`text-booking-from-${b.id}`} className="mt-1 font-mono text-xs">{b.from}</div></div><div><div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t.departure}</div><div data-testid={`text-booking-to-${b.id}`} className="mt-1 font-mono text-xs">{b.to}</div></div></div>
                    <div className="grid grid-cols-3 items-end gap-2"><div><div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t.total}</div><div data-testid={`text-booking-total-${b.id}`} className="mt-1 font-mono text-sm font-semibold">{money(b.totalAmount)} <span className="text-[10px] text-muted-foreground">EGP</span></div></div><div><div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t.advance}</div><div data-testid={`text-booking-advance-${b.id}`} className="mt-1 font-mono text-sm font-semibold">{money(b.advance)} <span className="text-[10px] text-muted-foreground">EGP</span></div></div><div className="text-end"><div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t.remaining}</div><div data-testid={`text-booking-remaining-${b.id}`} className={`mt-1 font-mono text-sm font-bold ${b.remaining>0?'text-primary':'text-emerald-700'}`}>{money(b.remaining)} <span className="text-[10px] text-muted-foreground">EGP</span></div></div></div>
                    <button data-testid={`button-share-booking-${b.id}`} onClick={()=>shareBooking(b)} className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-background py-2 text-xs font-bold transition hover:border-primary/40 hover:bg-primary/5"><Share2 size={14}/>{t.share}<ArrowUpRight size={13}/></button>
                  </article>)}
                </div>}
              </section>
            </div>
          </div> : section==='payroll' ? <div className="fade-in">
            <div className="mb-6 flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
              <div><div className="text-xs font-bold uppercase tracking-[.16em] text-primary">{lang==='ar'?'الموارد البشرية':'PEOPLE & PAY'}</div><h1 className="mt-1 text-2xl font-bold tracking-tight">{lang==='ar'?'سجل الرواتب الشهري':'Monthly payroll'}</h1><p className="mt-1 text-sm text-muted-foreground">{t.allMonths}</p></div>
              <div className="flex flex-wrap items-end gap-2">
                <label className="block"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t.month}</span><div className="relative"><select data-testid="select-payroll-month" value={monthId} onChange={e=>setMonthId(e.target.value)} className="min-w-[185px] appearance-none rounded-lg border border-border bg-card py-2.5 ps-3 pe-9 text-sm font-semibold outline-none focus:border-primary">{sortedMonths.map(m=><option key={m.id} value={m.id}>{monthLabel(m.id,lang)} · {m.id}</option>)}</select><ChevronDown size={14} className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground"/></div></label>
                <label className="block"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{lang==='ar'?'شهر جديد':'New month'}</span><input data-testid="input-new-month" type="month" value={monthDraft} onChange={e=>setMonthDraft(e.target.value)} className="rounded-lg border border-border bg-card px-3 py-2.5 text-sm outline-none focus:border-primary"/></label>
                <button data-testid="button-create-month" onClick={createMonth} className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2.5 text-xs font-bold text-primary-foreground transition hover:brightness-95"><Plus size={15}/>{t.createMonth}</button>
              </div>
            </div>
            <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-border bg-card px-4 py-3.5"><div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground"><UsersRound size={15}/>{t.employees}</div><div data-testid="text-payroll-headcount" className="mt-2 font-mono text-xl font-semibold">{activeMonth?.employees.length||0}<span className="ms-2 text-xs font-sans font-medium text-muted-foreground">{t.employees}</span></div></div>
              <div className="rounded-xl border border-border bg-card px-4 py-3.5"><div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground"><WalletCards size={15}/>{t.totalPayout}</div><div data-testid="text-payroll-total" className="mt-2 font-mono text-xl font-semibold">{money(totalPayout)}<span className="ms-2 text-xs font-sans font-medium text-muted-foreground">EGP</span></div></div>
              <div className="rounded-xl border border-border bg-card px-4 py-3.5"><div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground"><CalendarDays size={15}/>{t.month}</div><div data-testid="text-payroll-month" className="mt-2 text-lg font-bold">{monthLabel(monthId,lang)}</div></div>
            </div>
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3.5 md:px-5"><div><h2 className="text-sm font-bold">{activeMonth?monthLabel(monthId,lang):t.notFound}</h2><p className="mt-1 text-xs text-muted-foreground">{t.calculated}</p></div><span className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-bold text-secondary-foreground">{activeMonth?.employees.length||0} {t.employees}</span></div>
               {activeMonth && activeMonth.employees.length>0 ? <div className="soft-scroll overflow-x-auto"><table className="w-full min-w-[1030px] border-collapse text-sm"><thead><tr className="bg-muted/70 text-start text-[10px] font-bold uppercase tracking-wider text-muted-foreground"><th className="px-4 py-3 text-start">#</th><th className="px-4 py-3 text-start">{t.name}</th><th className="px-3 py-3 text-start">{t.salary}</th><th className="px-3 py-3 text-start">{t.scheduled}</th><th className="px-3 py-3 text-start">{t.attended}</th><th className="px-3 py-3 text-start">{t.daysOff}</th><th className="px-3 py-3 text-start">{t.bonus}</th><th className="px-3 py-3 text-start">{t.deductions}</th><th className="px-4 py-3 text-end">{t.net}</th></tr></thead><tbody className="divide-y divide-border">{activeMonth.employees.map((e,i)=><tr data-testid={`row-payroll-${e.id}`} key={`${monthId}-${e.id}`} className="transition hover:bg-muted/30"><td className="px-4 py-3 text-xs text-muted-foreground">{String(i+1).padStart(2,'0')}</td><td className="px-4 py-3"><span data-testid={`text-payroll-employee-${e.id}`} className="font-semibold">{e.name}</span><span className="mt-0.5 block text-[10px] text-muted-foreground">{lang==='ar'?'ملف شهري مستقل':'Monthly snapshot'}</span></td>{([['baseSalary','salary'],['scheduledDays','scheduled'],['attendedDays','attended'],['offDays','daysOff'],['bonus','bonus'],['deductions','deductions']] as [PayrollEditableField,string][]).map(([field])=><td key={field} className="px-3 py-3"><input data-testid={`input-payroll-${field}-${e.id}`} aria-label={`${String(field)} ${e.name}`} type="number" min="0" step={['scheduledDays','attendedDays','offDays'].includes(field)?1:0.01} max={field==='attendedDays'?e.scheduledDays:undefined} value={e[field]} onChange={ev=>changeEmployee(e.id,field,ev.target.value)} className={smallInput}/></td>)}<td className="px-4 py-3 text-end"><span data-testid={`text-net-payout-${e.id}`} className="font-mono text-sm font-bold text-emerald-800">{money(e.netPayout)}</span><span className="ms-1 text-[10px] text-muted-foreground">EGP</span></td></tr>)}</tbody><tfoot><tr className="bg-muted/60 font-bold"><td colSpan={8} className="px-4 py-3 text-end text-xs">{t.totalPayout}</td><td data-testid="text-payroll-footer-total" className="px-4 py-3 text-end font-mono text-sm">{money(totalPayout)} EGP</td></tr></tfoot></table></div> : <div data-testid="empty-payroll" className="flex min-h-[210px] flex-col items-center justify-center p-6 text-center"><div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground"><UsersRound size={21}/></div><h3 className="text-sm font-bold">{t.notFound}</h3><p className="mt-1 text-xs text-muted-foreground">{t.noStaff}</p></div>}
            </div>
            <section className="mt-5 rounded-xl border border-border bg-card p-4 md:p-5">
              <div className="mb-4 flex items-start gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground"><UsersRound size={17}/></div><div><h2 className="text-sm font-bold">{t.addStaff}</h2><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{lang==='ar'?'تؤثر تحديثات الطاقم على الأشهر الجديدة فقط.':'Roster changes seed new months only; existing snapshots remain untouched.'}</p></div></div>
              <form onSubmit={addRosterStaff} className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(180px,1fr)_140px_140px_120px_auto]">
                <input data-testid="input-roster-name" required value={newStaff.name} onChange={e=>setNewStaff({...newStaff,name:e.target.value})} className={inputClass} placeholder={t.name}/>
                <input data-testid="input-roster-salary" required type="number" min="0" value={newStaff.salary} onChange={e=>setNewStaff({...newStaff,salary:e.target.value})} className={inputClass} placeholder={t.salary}/>
                <input data-testid="input-roster-scheduled" required type="number" min="0" value={newStaff.workingDays} onChange={e=>setNewStaff({...newStaff,workingDays:e.target.value})} className={inputClass} placeholder={t.scheduled}/>
                <input data-testid="input-roster-offdays" required type="number" min="0" value={newStaff.offDays} onChange={e=>setNewStaff({...newStaff,offDays:e.target.value})} className={inputClass} placeholder={t.daysOff}/>
                <button data-testid="button-add-roster-staff" type="submit" className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-4 py-2.5 text-xs font-bold transition hover:bg-muted"><Plus size={15}/>{t.saveStaff}</button>
              </form>
              <div className="mt-4 divide-y divide-border border-t border-border">
                {data.staff.map((s,i)=><div data-testid={`row-roster-${s.id}`} key={s.id} className="grid grid-cols-[minmax(100px,1fr)_86px_72px_72px_36px] items-center gap-2 py-2.5 sm:grid-cols-[minmax(180px,1fr)_130px_115px_100px_40px]">
                  <input data-testid={`input-roster-edit-name-${s.id}`} aria-label={`${t.name} ${s.name}`} value={s.name} onChange={e=>updateRoster(s.id,'name',e.target.value)} className="min-w-0 rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm font-semibold outline-none hover:border-border focus:border-primary"/>
                  <input data-testid={`input-roster-edit-salary-${s.id}`} aria-label={`${t.salary} ${s.name}`} type="number" min="0" value={s.salary} onChange={e=>updateRoster(s.id,'salary',e.target.value)} className={smallInput+' w-full'}/>
                  <input data-testid={`input-roster-edit-days-${s.id}`} aria-label={`${t.scheduled} ${s.name}`} type="number" min="0" value={s.workingDays} onChange={e=>updateRoster(s.id,'workingDays',e.target.value)} className={smallInput+' w-full'}/>
                  <input data-testid={`input-roster-edit-offdays-${s.id}`} aria-label={`${t.daysOff} ${s.name}`} type="number" min="0" value={s.offDays} onChange={e=>updateRoster(s.id,'offDays',e.target.value)} className={smallInput+' w-full'}/>
                  <button data-testid={`button-delete-roster-${s.id}`} onClick={()=>setData(prev=>({...prev,staff:prev.staff.filter(st=>st.id!==s.id)}))} title={t.deleteStaff} className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-rose-50 hover:text-destructive"><Trash2 size={14}/></button>
                </div>)}
              </div>
            </section>
          </div> : null}
          {(section==='dashboard'||section==='inventory')&&<OperationsPanels data={data} setData={setData} lang={lang} monthId={monthId} section={section} onEditBooking={editBooking} onNewBooking={newBookingAt} onNotice={(type,text)=>setNotice({type,text})}/>}
          <div className="mt-7 flex flex-col gap-3 rounded-xl border border-border bg-card px-4 py-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-2.5"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-primary"/><div><div className="text-xs font-bold">{lang==='ar'?'السجلات متزامنة بين الأجهزة المعتمدة':'Shared records sync across approved devices'}</div><p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-muted-foreground">{t.localNotice} {lang==='ar'?'تتم المزامنة تلقائياً كل 3 ثوانٍ.':'Updates are checked every 3 seconds.'}</p></div></div>
            <div className="flex shrink-0 gap-2">
              <button data-testid="button-export-backup" onClick={exportBackup} className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-bold transition hover:bg-muted"><Download size={14}/>{t.export}</button>
              <button data-testid="button-import-backup" onClick={()=>importRef.current?.click()} className="flex items-center gap-1.5 rounded-lg bg-sidebar px-3 py-2 text-xs font-bold text-sidebar-foreground transition hover:opacity-90"><Upload size={14}/>{t.import}</button>
              <input data-testid="input-import-backup" ref={importRef} type="file" accept="application/json,.json" className="hidden" onChange={e=>void importBackup(e.target.files?.[0])}/>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground"><CircleHelp size={12}/>{lang==='ar'?'نسخ احتياطي JSON ينقل كل الحجوزات وسجل الرواتب والطاقم.':'JSON backup includes bookings, payroll history and the staff roster.'}<FileText size={12}/></div>
        </main>
      </div>
    </div>
  </div>;
}
function HomeRoute() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <AuthMessage message="Checking secure access…" />;
  return isSignedIn ? <Redirect to="/app" /> : <LandingPage />;
}

function WorkspaceRoute() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <AuthMessage message="Checking secure access…" />;
  return isSignedIn ? <PayrollWorkspace /> : <Redirect to="/sign-in" />;
}

function AuthMessage({ message }: { message: string }) {
  return <main className="flex min-h-[100dvh] items-center justify-center bg-background px-4 text-foreground">
    <p role="status" className="text-sm text-muted-foreground">{message}</p>
  </main>;
}

function BrandLockup() {
  return <div className="flex items-center gap-3">
    <img src={`${basePath}/logo.svg`} alt="" className="h-11 w-11 rounded-xl" />
    <div><div className="text-sm font-bold tracking-tight text-[#25303d]">AWADALLAH</div><div className="mt-0.5 text-[10px] tracking-[.17em] text-[#737b88]">HOTELS & VILLAS</div></div>
  </div>;
}

function LandingPage() {
  return <main className="min-h-[100dvh] bg-[#f7f5ef] text-[#25303d]">
    <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6">
      <BrandLockup />
      <a href={`${basePath}/sign-in`} className="rounded-lg border border-[#ddd6ca] bg-white px-4 py-2.5 text-sm font-semibold hover:bg-[#f1eee6]">Sign in</a>
    </header>
    <section className="mx-auto grid max-w-6xl gap-12 px-5 pb-16 pt-12 md:pt-20 lg:grid-cols-[1.1fr_.9fr] lg:items-center">
      <div>
        <div className="inline-flex items-center gap-2 rounded-full border border-[#e5dccb] bg-white/70 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[.15em] text-[#8f641e]"><ShieldCheck size={14}/> Staff workspace</div>
        <h1 className="mt-6 max-w-2xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl">Villa operations, shared with your team.</h1>
        <p className="mt-5 max-w-xl text-base leading-7 text-[#65707d]">Manage reservations, properties, staff and monthly payroll from one workspace. Records sync across approved devices.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a href={`${basePath}/sign-in`} className="rounded-lg bg-[#25303d] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#1c2530]">Sign in</a>
          <a href={`${basePath}/sign-up`} className="rounded-lg border border-[#ddd6ca] bg-white px-5 py-3 text-sm font-bold text-[#25303d] transition hover:bg-[#f1eee6]">Create staff account</a>
        </div>
        <p className="mt-5 text-xs text-[#737b88]">Access requires an approved, verified email address.</p>
      </div>
      <div className="rounded-2xl border border-[#e3dccf] bg-[#fffcf6] p-6 shadow-[0_20px_60px_-36px_rgba(37,48,61,.35)] sm:p-8">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#f2e8d4] text-[#8f641e]"><Building2 size={21}/></div>
          <div><div className="text-sm font-bold">Awadallah Hotels & Villas</div><div className="mt-1 text-xs text-[#737b88]">Operations desk</div></div>
        </div>
        <div className="my-6 h-px bg-[#e9e2d6]"/>
        <div className="space-y-4">
          {[['01','Bookings and guest stays'],['02','Staff and monthly payroll'],['03','Properties and inventory']].map(([number,label])=><div key={number} className="flex items-center gap-3 rounded-xl border border-[#eee8de] bg-white px-4 py-3.5"><span className="font-mono text-xs text-[#a47628]">{number}</span><span className="text-sm font-semibold">{label}</span></div>)}
        </div>
        <div className="mt-6 flex items-center gap-2 text-xs font-medium text-[#65707d]"><span className="h-2 w-2 rounded-full bg-emerald-600"/> Shared records refresh every 3 seconds</div>
      </div>
    </section>
  </main>;
}

function SignInPage() {
  return <main className="min-h-[100dvh] bg-[#f7f5ef] px-4 py-8">
    <header className="mx-auto max-w-6xl"><a href={basePath || '/'}><BrandLockup /></a></header>
    <div className="mx-auto mt-12 max-w-xl text-center">
      <p className="text-xs font-bold uppercase tracking-[.16em] text-[#9a6a19]">Secure staff access</p>
      <p className="mt-2 text-sm text-[#737b88]">Sign in with an approved and verified email address.</p>
    </div>
    <div className="mt-6 flex justify-center">
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </div>
  </main>;
}

function SignUpPage() {
  return <main className="min-h-[100dvh] bg-[#f7f5ef] px-4 py-8">
    <header className="mx-auto max-w-6xl"><a href={basePath || '/'}><BrandLockup /></a></header>
    <div className="mx-auto mt-12 max-w-xl text-center">
      <p className="text-xs font-bold uppercase tracking-[.16em] text-[#9a6a19]">Staff account</p>
      <p className="mt-2 text-sm text-[#737b88]">Only approved, verified email addresses can open payroll records.</p>
    </div>
    <div className="mt-6 flex justify-center">
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </div>
  </main>;
}

function ApplicationRoutes() {
  return <RoutedErrorBoundary><Switch>
    <Route path="/sign-in/*?" component={SignInPage}/>
    <Route path="/sign-up/*?" component={SignUpPage}/>
    <Route path="/app" component={WorkspaceRoute}/>
    <Route path="/" component={HomeRoute}/>
    <Route component={NotFound}/>
  </Switch></RoutedErrorBoundary>;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();
  return <ClerkProvider
    publishableKey={clerkPubKey}
    proxyUrl={clerkProxyUrl}
    appearance={clerkAppearance}
    signInUrl={`${basePath}/sign-in`}
    signUpUrl={`${basePath}/sign-up`}
    localization={{
      signIn: { start: { title: 'Welcome back', subtitle: 'Sign in to access your team records' } },
      signUp: { start: { title: 'Create your account', subtitle: 'Access is limited to approved staff' } },
    }}
    routerPush={(to)=>setLocation(stripBase(to))}
    routerReplace={(to)=>setLocation(stripBase(to),{replace:true})}
  >
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ApplicationRoutes />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  </ClerkProvider>;
}

function RoutedErrorBoundary({children}:{children:ReactNode}) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}
function App() {
  return <WouterRouter base={basePath}><ClerkProviderWithRoutes /></WouterRouter>;
}
export default App;
