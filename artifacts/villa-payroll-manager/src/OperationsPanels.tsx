import { useEffect, useMemo, useRef, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react';
import ExcelJS from 'exceljs';
import { Archive, BedDouble, CalendarDays, Check, Download, FileSpreadsheet, Plus, RotateCcw, Save, Trash2, Upload, X } from 'lucide-react';
import type { AppData, Booking, ReservationStatus, Villa } from './operations';
import { archiveRoom, archiveVilla, getMonthDayCount, hasReservationConflict, monthReservationSpan, removeVilla, renameRoom, updateVillaDetails } from './operations';

type Props = {
  data: AppData;
  setData: Dispatch<SetStateAction<AppData>>;
  lang: 'en' | 'ar';
  monthId: string;
  section: 'dashboard'|'inventory';
  onEditBooking: (booking: Booking) => void;
  onNewBooking: (villaId: string, from: string) => void;
  onNotice: (type: 'ok' | 'error', text: string) => void;
};
const headers = ['Villa Name','Room/Unit','Guest Name','Phone','Check-In','Check-Out','Total Amount','Deposit Paid','Remaining Balance','Status'];
const statusColors: Record<ReservationStatus,string> = {
  confirmed:'bg-sky-100 text-sky-900 border-sky-200',
  'checked-in':'bg-emerald-100 text-emerald-900 border-emerald-200',
  'checked-out':'bg-stone-200 text-stone-800 border-stone-300',
  blocked:'bg-rose-100 text-rose-900 border-rose-200',
};
const statusLabel = (status: ReservationStatus, ar:boolean) => ({
  confirmed:ar?'مؤكد':'Confirmed','checked-in':ar?'تم الوصول':'Checked in','checked-out':ar?'تم المغادرة':'Checked out',blocked:ar?'محجوب':'Blocked',
}[status]);
const tFor = (ar:boolean) => ar ? {
  dashboard:'لوحة التشغيل', inventory:'المخزون', month:'الشهر', villas:'الفيلات والغرف', addVilla:'إضافة فيلا', identifier:'المعرّف', arabicName:'الاسم بالعربية', englishName:'الاسم بالإنجليزية', save:'حفظ', cancel:'إلغاء', rooms:'الغرف والوحدات', addRoom:'إضافة غرفة', rename:'إعادة تسمية', archive:'أرشفة', reactivate:'إعادة تفعيل', archived:'مؤرشف', noRooms:'لا توجد غرف نشطة', unit:'الوحدة', guest:'النزيل', status:'الحالة', new:'حجز جديد', upload:'استيراد', export:'تصدير', template:'قالب', monthlyExport:'تصدير حجوزات الشهر', csv:'CSV', excel:'Excel (.xlsx)', reservationTemplate:'قالب الحجوزات', roomTemplate:'قالب الغرف', importReservations:'استيراد الحجوزات', importRooms:'استيراد قائمة الغرف', errors:'تعذر استيراد الملف', imported:'تم الاستيراد', records:'سجلات', roomsAdded:'غرف مضافة', conflict:'تعارض في مواعيد الغرفة', missingVilla:'الفيلا غير موجودة', invalidStatus:'حالة غير صحيحة', invalidDate:'تاريخ غير صالح', required:'بيانات مطلوبة غير مكتملة', usedArchive:'توجد حجوزات محفوظة؛ تمت الأرشفة للحفاظ على السجل.', removeVilla:'حذف الفيلا', restore:'إعادة تفعيل', empty:'لا توجد حجوزات لهذا الشهر', day:'اليوم', roomList:'قائمة الغرف', chooseFile:'اختر ملفاً', duplicate:'موجودة مسبقاً', saved:'تم الحفظ', confirm:'تأكيد', delete:'حذف', bookingEdit:'تعديل الحجز',
} : {
  dashboard:'Operations Dashboard', inventory:'Inventory', month:'Month', villas:'Villas & rooms', addVilla:'Add villa', identifier:'Identifier', arabicName:'Arabic name', englishName:'English name', save:'Save', cancel:'Cancel', rooms:'Rooms & units', addRoom:'Add room', rename:'Rename', archive:'Archive', reactivate:'Reactivate', archived:'Archived', noRooms:'No active rooms', unit:'Unit', guest:'Guest', status:'Status', new:'New booking', upload:'Import', export:'Export', template:'Template', monthlyExport:'Export monthly reservations', csv:'CSV', excel:'Excel (.xlsx)', reservationTemplate:'Reservation template', roomTemplate:'Room-list template', importReservations:'Import reservations', importRooms:'Import room list', errors:'Import validation failed', imported:'Imported', records:'records', roomsAdded:'rooms added', conflict:'Room date conflict', missingVilla:'Villa not found', invalidStatus:'Invalid status', invalidDate:'Invalid date', required:'Required fields are missing', usedArchive:'Reservations exist; archived to preserve history.', removeVilla:'Delete villa', restore:'Reactivate', empty:'No reservations in this month', day:'Day', roomList:'Room list', chooseFile:'Choose file', duplicate:'Already exists', saved:'Saved', confirm:'Confirm', delete:'Delete', bookingEdit:'Edit reservation',
};

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function csvText(rows: unknown[][]) {
  return rows.map(row => row.map(value => `"${String(value ?? '').replace(/"/g,'""')}"`).join(',')).join('\r\n');
}
function toDateCell(value: unknown): string {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0,10);
  if (typeof value === 'number') {
    const date = new Date(Date.UTC(1899,11,30) + value * 86400000);
    return Number.isFinite(date.getTime()) ? date.toISOString().slice(0,10) : '';
  }
  const text = String(value ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text) && !Number.isNaN(Date.parse(`${text}T00:00:00`))) return text;
  const parsed = new Date(text);
  return text && Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0,10) : '';
}
function parseCsv(text:string): unknown[][] {
  const rows: unknown[][] = []; let row: string[] = [], cell = '', quoted = false;
  for (let i=0;i<text.length;i++) {
    const c=text[i];
    if(c==='"' && quoted && text[i+1]==='"'){cell+='"';i++;}
    else if(c==='"') quoted=!quoted;
    else if(c===',' && !quoted){row.push(cell.trim());cell='';}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell.trim());if(row.some(v=>v!==''))rows.push(row);row=[];cell='';}
    else cell+=c;
  }
  if(cell||row.length){row.push(cell.trim());rows.push(row);}
  return rows;
}
async function workbookRows(file:File):Promise<unknown[][]> {
  if(file.name.toLowerCase().endsWith('.csv')) return parseCsv(await file.text());
  const workbook=new ExcelJS.Workbook(); await workbook.xlsx.load(await file.arrayBuffer());
  const sheet=workbook.worksheets[0]; if(!sheet) return [];
  const rows:unknown[][]=[];
  sheet.eachRow({includeEmpty:false}, r=>{const values=r.values as unknown[];rows.push(values.slice(1).map((v:unknown)=>typeof v==='object'&&v&&'text' in v?(v as {text:string}).text:v));});
  return rows;
}
function makeCsvDownload(rows:unknown[][],name:string){downloadBlob(new Blob(['\ufeff'+csvText(rows)],{type:'text/csv;charset=utf-8'}),name);}
async function makeXlsxDownload(rows:unknown[][],name:string){
  const workbook=new ExcelJS.Workbook(); const sheet=workbook.addWorksheet('Reservations');
  sheet.addRows(rows as (string|number)[][]); sheet.getRow(1).font={bold:true,color:{argb:'FF253A45'}};
  sheet.views=[{state:'frozen',ySplit:1}]; sheet.columns=headers.map((header,i)=>({header,key:`c${i}`,width:Math.max(15,header.length+3)}));
  const buffer=await workbook.xlsx.writeBuffer(); downloadBlob(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),name);
}
export function OperationsPanels({data,setData,lang,monthId,section,onEditBooking,onNewBooking,onNotice}:Props){
  const ar=lang==='ar', t=tFor(ar), [view,setView]=useState<'dashboard'|'inventory'>(section);
  useEffect(()=>setView(section),[section]);
  const [gridMonth,setGridMonth]=useState(monthId);
  const [villaDraft,setVillaDraft]=useState<Villa|null>(null),[villaEditingId,setVillaEditingId]=useState<string|null>(null),[newRoom,setNewRoom]=useState<Record<string,string>>({});
  const [roomEdit,setRoomEdit]=useState<{villaId:string;oldName:string;name:string}|null>(null);
  const [fileTarget,setFileTarget]=useState<'bookings'|'rooms'|null>(null);
  const fileRef=useRef<HTMLInputElement>(null);
  const days=getMonthDayCount(gridMonth);
  const monthBookings=useMemo(()=>data.bookings.filter(b=>monthReservationSpan(b,gridMonth)).sort((a,b)=>a.villaId.localeCompare(b.villaId)||a.roomName.localeCompare(b.roomName)||a.from.localeCompare(b.from)),[data.bookings,gridMonth]);
  const activeVillas=data.villas.filter(v=>!v.archived);
  const updateVilla=(ev:FormEvent)=>{
    ev.preventDefault(); if(!villaDraft)return;
    if(!villaDraft.id.trim()||!villaDraft.name.trim()||!villaDraft.nameEn.trim())return;
    if(villaDraft.id!==villaEditingId && data.villas.some(v=>v.id===villaDraft.id)){onNotice('error',ar?'المعرّف مستخدم بالفعل':'That identifier is already in use');return;}
    setData(prev=>villaEditingId
      ? updateVillaDetails(prev,villaEditingId,{id:villaDraft.id,name:villaDraft.name,nameEn:villaDraft.nameEn})
      : {...prev,villas:[...prev.villas,villaDraft]});
    setVillaDraft(null);setVillaEditingId(null); onNotice('ok',t.saved);
  };
  const saveRoom=(villaId:string)=>{
    if(!roomEdit || !roomEdit.name.trim())return;
    const result=renameRoom(data,villaId,roomEdit.oldName,roomEdit.name);
    if(result===data){onNotice('error',ar?'اسم الغرفة مستخدم أو غير صالح':'Room name is already used or invalid');return;}
    setData(result); setRoomEdit(null); onNotice('ok',t.saved);
  };
  const rowsForMonth=()=>[headers,...monthBookings.map(b=>[data.villas.find(v=>v.id===b.villaId)?.nameEn||b.villaId,b.roomName,b.guestName,b.phone,b.from,b.to,b.totalAmount,b.advance,b.remaining,b.status])];
  const exportMonth=(format:'csv'|'xlsx')=>{const rows=rowsForMonth(); if(format==='csv')makeCsvDownload(rows,`reservations-${gridMonth}.csv`);else void makeXlsxDownload(rows,`reservations-${gridMonth}.xlsx`);};
  const template=(kind:'bookings'|'rooms',format:'csv'|'xlsx')=>{
    const rows=kind==='bookings'?[headers]:[['Villa ID','Room/Unit']];
    const name=`${kind==='bookings'?'reservation':'room-list'}-template`;
    if(format==='csv')makeCsvDownload(rows,name+'.csv');else void makeXlsxDownload(rows,name+'.xlsx');
  };
  const importFile=async(file?:File)=>{
    if(!file||!fileTarget)return;
    try{
      const rows=await workbookRows(file); if(rows.length<2)throw new Error(ar?'لا توجد صفوف بيانات':'No data rows found');
      const head=rows[0].map(v=>String(v??'').trim().toLowerCase());
      const index=(name:string)=>head.indexOf(name.toLowerCase());
      if(fileTarget==='bookings'){
        const required=headers.map(index);
        if(required.some(i=>i<0))throw new Error(ar?'عناوين الأعمدة غير مكتملة':'Required reservation headers are missing');
        const errors:string[]=[], imported:Booking[]=[];
        rows.slice(1).forEach((r,offset)=>{
          const rowNumber=offset+2, val=(name:string)=>r[index(name)];
          const villaRaw=String(val('Villa Name')??'').trim();
          const villa=data.villas.find(v=>v.id===villaRaw||v.name===villaRaw||v.nameEn===villaRaw);
          const roomName=String(val('Room/Unit')??'').trim(), guestName=String(val('Guest Name')??'').trim();
          const from=toDateCell(val('Check-In')),to=toDateCell(val('Check-Out'));
          const rawStatus=String(val('Status')??'confirmed').trim().toLowerCase();
          const status=rawStatus as ReservationStatus;
          const nums=['Total Amount','Deposit Paid','Remaining Balance'].map(h=>Number(val(h)));
          const reason:string[]=[];
          if(!villa||villa.archived)reason.push(t.missingVilla);
          if(!roomName||!guestName||!String(val('Phone')??'').trim())reason.push(t.required);
          if(villa&&!villa.rooms.includes(roomName))reason.push(ar?'الغرفة غير موجودة في الفيلا':'Room not found in villa');
          if(!from||!to||to<=from)reason.push(t.invalidDate);
          if(!['confirmed','checked-in','checked-out','blocked'].includes(status))reason.push(t.invalidStatus);
          if(nums.some(n=>!Number.isFinite(n)||n<0))reason.push(ar?'المبالغ يجب أن تكون أرقاماً غير سالبة':'Amounts must be valid non-negative numbers');
          if(reason.length){errors.push(`${ar?'الصف':'Row'} ${rowNumber}: ${reason.join(' · ')}`);return;}
          imported.push({id:`booking-import-${Date.now()}-${rowNumber}`,villaId:villa!.id,roomName,guestName,phone:String(val('Phone')).trim(),from,to,totalAmount:nums[0],advance:nums[1],remaining:nums[2],status});
        });
        const candidate=[...data.bookings,...imported];
        imported.forEach(b=>{if(hasReservationConflict(candidate,b,b.id))errors.push(`${ar?'الصف':'Row'} ${rows.findIndex(r=>r[index('Guest Name')]===b.guestName)+1}: ${t.conflict} (${b.villaId} / ${b.roomName})`);});
        if(errors.length)throw new Error(errors.slice(0,12).join('\n'));
        setData(prev=>({...prev,bookings:[...imported,...prev.bookings]})); onNotice('ok',`${imported.length} ${t.imported} ${t.records}`);
      }else{
        const villaIndex=index('Villa ID'), roomIndex=index('Room/Unit');
        if(villaIndex<0||roomIndex<0)throw new Error(ar?'مطلوب عمودا Villa ID وRoom/Unit':'Villa ID and Room/Unit headers are required');
        let added=0; const invalid:string[]=[];
        const next={...data,villas:data.villas.map(v=>({...v,rooms:[...v.rooms]}))};
        rows.slice(1).forEach((r,i)=>{
          const villa=next.villas.find(v=>v.id===String(r[villaIndex]??'').trim()&&!v.archived),room=String(r[roomIndex]??'').trim();
          if(!villa||!room){invalid.push(`${ar?'الصف':'Row'} ${i+2}: ${t.required}`);return;}
          if(villa.rooms.some(existing=>existing.toLocaleLowerCase()===room.toLocaleLowerCase()))return;
          villa.rooms.push(room); added++;
        });
        if(invalid.length)throw new Error(invalid.slice(0,12).join('\n'));
        setData(next); onNotice('ok',`${added} ${t.roomsAdded} · ${rows.length-1-added} ${t.duplicate}`);
      }
    }catch(error){onNotice('error',`${t.errors}\n${error instanceof Error?error.message:String(error)}`);}
    finally{setFileTarget(null);if(fileRef.current)fileRef.current.value='';}
  };
  const input='w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary';
  const button='inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-xs font-semibold transition hover:bg-muted active:translate-y-px';
  const labelFor=(v:Villa)=>ar?v.name:v.nameEn;
  return <section className="mt-7 fade-in" data-testid="operations-feature">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex gap-2 rounded-lg border border-border bg-card p-1">
        <button data-testid="tab-operations-dashboard" className={`${button} ${view==='dashboard'?'border-sidebar bg-sidebar text-white':''}`} onClick={()=>setView('dashboard')}><CalendarDays size={14}/>{t.dashboard}</button>
        <button data-testid="tab-inventory" className={`${button} ${view==='inventory'?'border-sidebar bg-sidebar text-white':''}`} onClick={()=>setView('inventory')}><BedDouble size={14}/>{t.inventory}</button>
      </div>
      {view==='dashboard'&&<div className="flex flex-wrap gap-2">
        <button data-testid="button-export-month-csv" className={button} onClick={()=>exportMonth('csv')}><Download size={14}/>{t.csv}</button>
        <button data-testid="button-export-month-xlsx" className={button} onClick={()=>exportMonth('xlsx')}><FileSpreadsheet size={14}/>{t.excel}</button>
        <button data-testid="button-import-reservations" className={button} onClick={()=>{setFileTarget('bookings');fileRef.current?.click()}}><Upload size={14}/>{t.importReservations}</button>
        <button data-testid="button-template-reservations" className={button} onClick={()=>template('bookings','xlsx')}><FileSpreadsheet size={14}/>{t.reservationTemplate}</button>
      </div>}
      {view==='inventory'&&<button data-testid="button-add-villa" className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-bold text-primary-foreground" onClick={()=>setVillaDraft({id:'',name:'',nameEn:'',rooms:[],archivedRooms:[]})}><Plus size={15}/>{t.addVilla}</button>}
      <input ref={fileRef} data-testid="input-operations-import" type="file" accept=".csv,.xlsx" className="hidden" onChange={e=>void importFile(e.target.files?.[0])}/>
    </div>
    {view==='dashboard' ? <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3"><div><h2 className="text-sm font-bold">{t.dashboard}</h2><p className="mt-1 text-xs text-muted-foreground">{gridMonth} · {days} {ar?'يوماً':'days'} · {monthBookings.length} {ar?'حجزاً':'reservations'}</p></div><div className="flex items-center gap-3"><label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">{t.month}<input data-testid="input-dashboard-month" type="month" className="rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs text-foreground" value={gridMonth} onChange={e=>setGridMonth(e.target.value)}/></label><span className="text-[10px] font-semibold text-muted-foreground">{ar?'المغادرة لا تُحتسب كيوم إقامة':'Checkout day is exclusive'}</span></div></div>
      <div className="soft-scroll overflow-x-auto">
        <div className="min-w-[1050px]">
          <div className="sticky top-0 z-[1] grid bg-muted/80" style={{gridTemplateColumns:`190px repeat(${days}, minmax(36px,1fr))`}}>
            <div className="sticky start-0 z-[2] border-e border-border bg-muted px-3 py-2 text-xs font-bold">{ar?'الفيلا / الغرفة':'Villa / room'}</div>
            {Array.from({length:days},(_,i)=><div key={i} data-testid={`grid-day-${i+1}`} className={`border-e border-border px-1 py-2 text-center text-[10px] font-mono ${[5,6].includes(new Date(Number(gridMonth.slice(0,4)),Number(gridMonth.slice(5,7))-1,i+1).getDay())?'bg-primary/5':''}`}>{String(i+1).padStart(2,'0')}</div>)}
          </div>
          {activeVillas.flatMap(v=>v.rooms.map((room,ri)=>{
            const inUnit=monthBookings.filter(b=>b.villaId===v.id&&b.roomName===room);
            return <div key={`${v.id}-${room}`} data-testid={`row-operations-${v.id}-${room}`} className="grid min-h-[50px] border-b border-border/80" style={{gridTemplateColumns:`190px repeat(${days}, minmax(36px,1fr))`}}>
              <div className="sticky start-0 z-[1] flex items-center gap-2 border-e border-border bg-card px-3"><span className="min-w-0 truncate text-[11px] font-semibold">{ri===0&&<span className="me-1 text-primary">{labelFor(v)} ·</span>}{room}</span></div>
              {Array.from({length:days},(_,i)=>{
              const day=i+1, date=`${gridMonth}-${String(day).padStart(2,'0')}`;
                const booking=inUnit.find(b=>b.from<=date&&b.to>date);
                return booking ? <div key={day} className="min-h-[46px] border-e border-border/50" aria-hidden="true"/> : <button key={day} data-testid={`grid-empty-${v.id}-${room}-${day}`} aria-label={`${t.new} ${labelFor(v)} ${room} ${date}`} onClick={()=>onNewBooking(v.id,date)} className="min-h-[46px] border-e border-border/50 transition hover:bg-primary/10 focus-visible:bg-primary/10"/>;
              })}
              {inUnit.map(b=>{const span=monthReservationSpan(b,gridMonth);if(!span)return null;return <button key={b.id} data-testid={`grid-booking-${b.id}`} title={`${b.guestName} · ${statusLabel(b.status,ar)}`} onClick={()=>onEditBooking(b)} className={`z-[2] -my-0.5 mx-0.5 flex min-h-[34px] items-center self-center overflow-hidden rounded-md border px-1.5 text-start text-[9px] font-bold transition hover:brightness-95 ${statusColors[b.status]}`} style={{gridColumn:`${span.startDay+1} / ${span.endDayExclusive+1}`,gridRow:1}}><span className="truncate">{b.guestName} · {statusLabel(b.status,ar)}</span></button>})}
            </div>;
          }))}
        </div>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-border px-4 py-3">{(['confirmed','checked-in','checked-out','blocked'] as ReservationStatus[]).map(s=><span key={s} data-testid={`legend-status-${s}`} className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground"><i className={`h-2.5 w-2.5 rounded-sm border ${statusColors[s]}`}/>{statusLabel(s,ar)}</span>)}</div>
      {monthBookings.length===0&&<div className="px-4 pb-4 text-center text-xs text-muted-foreground">{t.empty}</div>}
    </div> :
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4"><div><h2 className="text-sm font-bold">{t.villas}</h2><p className="mt-1 text-xs text-muted-foreground">{ar?'تغييرات المعرّفات والأسماء تُحدّث الحجوزات القديمة تلقائياً.':'Identifier and room edits cascade to reservation history.'}</p></div><div className="flex gap-2"><button data-testid="button-import-rooms" className={button} onClick={()=>{setFileTarget('rooms');fileRef.current?.click()}}><Upload size={14}/>{t.importRooms}</button><button data-testid="button-template-rooms" className={button} onClick={()=>template('rooms','xlsx')}><FileSpreadsheet size={14}/>{t.roomTemplate}</button></div></div>
      {villaDraft&&<form onSubmit={updateVilla} data-testid="form-villa" className="grid gap-3 rounded-xl border border-primary/30 bg-card p-4 md:grid-cols-4">
        <label className="text-xs font-semibold">{t.identifier}<input data-testid="input-villa-id" required className={`${input} mt-1`} value={villaDraft.id} onChange={e=>setVillaDraft({...villaDraft,id:e.target.value})}/></label>
        <label className="text-xs font-semibold">{t.arabicName}<input data-testid="input-villa-arabic-name" required className={`${input} mt-1`} dir="rtl" value={villaDraft.name} onChange={e=>setVillaDraft({...villaDraft,name:e.target.value})}/></label>
        <label className="text-xs font-semibold">{t.englishName}<input data-testid="input-villa-english-name" required className={`${input} mt-1`} value={villaDraft.nameEn} onChange={e=>setVillaDraft({...villaDraft,nameEn:e.target.value})}/></label>
        <div className="flex items-end gap-2"><button data-testid="button-save-villa" className="inline-flex flex-1 items-center justify-center gap-1 rounded-md bg-primary px-3 py-2 text-xs font-bold text-primary-foreground"><Save size={14}/>{t.save}</button><button data-testid="button-cancel-villa" type="button" className={button} onClick={()=>setVillaDraft(null)}><X size={14}/>{t.cancel}</button></div>
      </form>}
      {[...activeVillas,...data.villas.filter(v=>v.archived)].map(v=><article data-testid={`card-inventory-villa-${v.id}`} key={v.id} className={`rounded-xl border border-border bg-card ${v.archived?'opacity-75':''}`}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3"><div><div className="flex items-center gap-2"><h3 className="text-sm font-bold">{labelFor(v)}</h3><code className="rounded bg-muted px-1.5 py-0.5 text-[10px]">{v.id}</code>{v.archived&&<span className="rounded bg-muted px-2 py-1 text-[10px]">{t.archived}</span>}</div><p className="mt-1 text-[11px] text-muted-foreground">{v.nameEn} · {v.name}</p></div><div className="flex gap-2">
          {v.archived?<button data-testid={`button-reactivate-villa-${v.id}`} className={button} onClick={()=>setData(prev=>({...prev,villas:prev.villas.map(x=>x.id===v.id?{...x,archived:false}:x)}))}><RotateCcw size={14}/>{t.reactivate}</button>:<button data-testid={`button-edit-villa-${v.id}`} className={button} onClick={()=>setVillaDraft({...v})}>{ar?'تعديل':'Edit'}</button>}
          {!v.archived&&<button data-testid={`button-archive-villa-${v.id}`} className={`${button} text-destructive`} onClick={()=>{const next=removeVilla(data,v.id);setData(next);if(data.bookings.some(b=>b.villaId===v.id))onNotice('ok',t.usedArchive)}}><Archive size={14}/>{t.removeVilla}</button>}
        </div></div>
        {!v.archived&&<div className="p-4"><div className="mb-3 flex items-center justify-between"><h4 className="text-xs font-bold">{t.rooms} <span className="font-mono text-muted-foreground">({v.rooms.length})</span></h4><form data-testid={`form-add-room-${v.id}`} className="flex gap-2" onSubmit={e=>{e.preventDefault();const room=(newRoom[v.id]||'').trim();if(!room)return;if(v.rooms.some(r=>r.toLowerCase()===room.toLowerCase())){onNotice('error',t.duplicate);return;}setData(prev=>({...prev,villas:prev.villas.map(x=>x.id===v.id?{...x,rooms:[...x.rooms,room]}:x)}));setNewRoom({...newRoom,[v.id]:''})}}><input data-testid={`input-new-room-${v.id}`} className="w-36 rounded-md border border-border bg-background px-2 py-1.5 text-xs" value={newRoom[v.id]||''} placeholder={t.unit} onChange={e=>setNewRoom({...newRoom,[v.id]:e.target.value})}/><button data-testid={`button-add-room-${v.id}`} className={button}><Plus size={13}/>{t.addRoom}</button></form></div>
          <div className="flex flex-wrap gap-2">{v.rooms.map(room=><div data-testid={`chip-room-${v.id}-${room}`} key={room} className="flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1">
            {roomEdit?.villaId===v.id&&roomEdit.oldName===room?<><input data-testid={`input-rename-room-${v.id}-${room}`} autoFocus className="w-28 bg-transparent text-xs outline-none" value={roomEdit.name} onChange={e=>setRoomEdit({...roomEdit,name:e.target.value})}/><button data-testid={`button-save-room-${v.id}`} onClick={()=>saveRoom(v.id)} aria-label={t.save}><Check size={13}/></button><button onClick={()=>setRoomEdit(null)} aria-label={t.cancel}><X size={13}/></button></>:<><span className="text-xs font-medium">{room}</span><button data-testid={`button-edit-room-${v.id}-${room}`} title={t.rename} onClick={()=>setRoomEdit({villaId:v.id,oldName:room,name:room})} className="ms-1 text-muted-foreground hover:text-primary">{ar?'تعديل':'Edit'}</button><button data-testid={`button-archive-room-${v.id}-${room}`} aria-label={`${t.archive} ${room}`} onClick={()=>{const used=data.bookings.some(b=>b.villaId===v.id&&b.roomName===room);setData(prev=>archiveRoom(prev,v.id,room));if(used)onNotice('ok',t.usedArchive)}} className="ms-1 text-muted-foreground hover:text-destructive"><Archive size={13}/></button></>}
          </div>)}</div>{v.rooms.length===0&&<p className="py-3 text-xs text-muted-foreground">{t.noRooms}</p>}
          {!!v.archivedRooms?.length&&<div className="mt-4 border-t border-border pt-3"><p className="mb-2 text-[10px] font-bold uppercase text-muted-foreground">{t.archived}</p><div className="flex flex-wrap gap-2">{v.archivedRooms.map(room=><button data-testid={`button-reactivate-room-${v.id}-${room}`} key={room} onClick={()=>setData(prev=>({...prev,villas:prev.villas.map(x=>x.id===v.id?{...x,rooms:[...x.rooms,room],archivedRooms:x.archivedRooms?.filter(r=>r!==room)}:x)}))} className={button}><RotateCcw size={12}/>{room} · {t.reactivate}</button>)}</div></div>}
        </div>}
      </article>)}
    </div>}
  </section>;
}
