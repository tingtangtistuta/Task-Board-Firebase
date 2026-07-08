import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase'; 
import { X, UploadCloud, Search, CheckCircle2, Clock, Info, Loader2, Code2, TableProperties } from 'lucide-react';

export default function BillingMatcher({ isOpen, onClose, showToast }: { isOpen: boolean, onClose: () => void, showToast: (msg: string) => void }) {
  const [deliveryNotes, setDeliveryNotes] = useState<any[]>([]);
  const [salesReports, setSalesReports] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [isUploadingDep, setIsUploadingDep] = useState(false);
  const [isUploadingSales, setIsUploadingSales] = useState(false);
  const [debugText, setDebugText] = useState<string>('');

  // 1. โหลดไลบรารี SheetJS สำหรับอ่าน Excel
  useEffect(() => {
    if (!isOpen) return;
    const loadScript = (src: string) => {
      if (document.querySelector(`script[src="${src}"]`)) return;
      const script = document.createElement('script'); script.src = src; script.async = true; document.body.appendChild(script);
    };
    loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const unsubDelivery = onSnapshot(collection(db, 'delivery_notes'), (snap) => {
      setDeliveryNotes(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const unsubSales = onSnapshot(collection(db, 'sales_reports'), (snap) => {
      setSalesReports(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => { unsubDelivery(); unsubSales(); };
  }, [isOpen]);

  // 🟢 ฟังก์ชันถอดรหัสจากตาราง Excel อย่างแม่นยำ
  const extractTextFromExcel = async (file: File) => {
    const arrayBuffer = await file.arrayBuffer();
    const XLSX = (window as any).XLSX;
    
    if (!XLSX) {
      showToast('⚠️ ระบบกำลังเตรียมเครื่องมืออ่าน Excel กรุณาลองใหม่อีกครั้งใน 2 วินาที');
      throw new Error("XLSX not ready");
    }
    
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    let allLines: string[] = [];

    // วนอ่านทุก Sheet เผื่อข้อมูลมีหลายหน้า
    workbook.SheetNames.forEach((sheetName: string) => {
      const worksheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
      
      rows.forEach((row: any[]) => {
        // นำข้อมูลทุกเซลล์ใน 1 บรรทัดมาต่อกันด้วยช่องว่าง (เพื่อส่งให้ Regex วิเคราะห์ต่อ)
        const lineStr = row.map(cell => String(cell).trim()).join(' ').replace(/\s+/g, ' ').trim();
        if (lineStr) allLines.push(lineStr);
      });
    });
    return allLines;
  };

  // 🟢 ฟังก์ชันวิเคราะห์คำแบบใหม่ (แยกชื่อลูกค้า กับ ยอดเงิน ขาดจากกันแบบ 100%)
  const parseDataLine = (line: string) => {
    // 1. หารหัสเอกสาร
    const idMatch = line.match(/(DEP\d{3,}|25\d{4}-\d{4})/);
    if (!idMatch) return null;
    const id = idMatch[1];

    // ตัดคำเอาเฉพาะส่วนหลังรหัสมาประมวลผล
    const textAfterId = line.substring(line.indexOf(id) + id.length).trim();
    const tokens = textAfterId.split(/\s+/); // หั่นทุกคำที่คั่นด้วยช่องว่าง
    
    if (tokens.length < 2) return null;

    // 2. รหัสลูกค้า คือคำแรกเสมอ
    const code = tokens.shift() || '-';
    
    // 3. ดึงยอดเงินจาก "ท้ายสุด" ย้อนกลับมา (ตัดปัญหาลูกค้าที่มีตัวเลขในชื่อ)
    let netAmount = 0;
    let foundAmounts = [];
    
    while (tokens.length > 0) {
      const lastToken = tokens[tokens.length - 1];
      // เช็คว่าเป็นกลุ่มตัวเลขหรือไม่ (เช่น 24,544.52 หรือ 100)
      if (/^[\d,\.]+$/.test(lastToken) && /\d/.test(lastToken)) {
        foundAmounts.push(tokens.pop()); // ดึงตัวเลขออกไปเก็บไว้
      } else {
        break; // ถ้าเจอตัวอักษร ให้หยุดดึง (แปลว่าถึงชื่อลูกค้าแล้ว)
      }
    }
    
    // ยอดเงินที่ดึงออกไปตัวแรกสุด (คือตัวที่อยู่ขวาสุดของบรรทัด) จะเป็นยอดสุทธิ
    if (foundAmounts.length > 0) {
      netAmount = parseFloat(foundAmounts[0]!.replace(/,/g, ''));
    }
    
    // 4. คำที่เหลือตรงกลางทั้งหมด คือ "ชื่อลูกค้า"
    let name = tokens.join(' ').trim();
    if (!name) name = "ไม่ระบุชื่อ";

    return { id, code, name, netAmount };
  };

  const handleUploadDelivery = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setIsUploadingDep(true); setDebugText('');
    try {
      const lines = await extractTextFromExcel(e.target.files[0]);
      const existingDeps = new Set(deliveryNotes.map(d => d.depNo));
      let addedCount = 0;

      for (const line of lines) {
        const parsed = parseDataLine(line);
        if (parsed && parsed.id.startsWith('DEP')) {
          if (!existingDeps.has(parsed.id)) {
            await addDoc(collection(db, 'delivery_notes'), {
              depNo: parsed.id, cusCode: parsed.code, cusName: parsed.name, amount: parsed.netAmount,
              status: 'PENDING', matchedWith: null, createdAt: serverTimestamp()
            });
            existingDeps.add(parsed.id);
            addedCount++;
          }
        }
      }

      if (addedCount > 0) showToast(`✅ นำเข้าใบส่งของสำเร็จ ${addedCount} รายการ`);
      else { 
        showToast(`⚠️ ไม่พบข้อมูลใหม่`); 
        setDebugText(lines.slice(0, 30).join('\n')); 
      }
    } catch (err) { showToast('❌ เกิดข้อผิดพลาดในการอ่านไฟล์ Excel'); } 
    finally { setIsUploadingDep(false); e.target.value = ''; }
  };

  const handleUploadSales = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setIsUploadingSales(true); setDebugText('');
    try {
      const lines = await extractTextFromExcel(e.target.files[0]);
      const existingInvs = new Set(salesReports.map(s => s.invNo));
      let addedCount = 0;
      
      const parsedSalesToUpload: any[] = [];
      let lastSaleObj: any = null; 

      for (const line of lines) {
        const parsed = parseDataLine(line);
        
        if (parsed && parsed.id.startsWith('25')) {
          if (!existingInvs.has(parsed.id)) {
            lastSaleObj = {
              invNo: parsed.id, cusCode: parsed.code, cusName: parsed.name, amount: parsed.netAmount,
              refDep: null, matchType: 'NONE', status: 'PENDING', createdAt: serverTimestamp()
            };
            parsedSalesToUpload.push(lastSaleObj);
            existingInvs.add(parsed.id);
            addedCount++;
          } else { lastSaleObj = null; }
        } 
        else if (!parsed && lastSaleObj) {
          const depRefMatch = line.match(/(DEP\d{3,})/);
          if (depRefMatch) {
            lastSaleObj.refDep = depRefMatch[1];
            lastSaleObj.matchType = 'EXPLICIT';
            lastSaleObj = null; 
          }
        }
      }

      for (const sale of parsedSalesToUpload) {
        await addDoc(collection(db, 'sales_reports'), sale);
      }

      if (addedCount > 0) showToast(`✅ นำรายงานขายสำเร็จ ${addedCount} บิล`);
      else { 
        showToast(`⚠️ ไม่พบข้อมูลใหม่`); 
        setDebugText(lines.slice(0, 30).join('\n')); 
      }
    } catch (err) { showToast('❌ เกิดข้อผิดพลาดในการอ่านไฟล์ Excel'); } 
    finally { setIsUploadingSales(false); e.target.value = ''; }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[500] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-50 w-full max-w-[98vw] h-[95vh] rounded-3xl shadow-2xl flex flex-col relative overflow-hidden">
        
        {/* Header */}
        <div className="bg-white px-6 py-4 border-b border-slate-200 flex justify-between items-center z-10 shrink-0">
          <div>
            <h1 className="text-2xl font-black text-blue-950 uppercase tracking-widest flex items-center gap-3">
              STP <span className="text-emerald-600">Billing Matcher</span>
              <span className="bg-emerald-100 text-emerald-800 text-[10px] px-2 py-1 rounded-full flex items-center gap-1"><TableProperties className="w-3 h-3"/> Phase 2: Excel Engine</span>
            </h1>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">อัปเดตเครื่องยนต์: เปลี่ยนระบบมาอ่านไฟล์ตาราง Excel / CSV ความเร็วสูง</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative hidden md:block">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"/>
              <input type="text" placeholder="ค้นหา เลขที่ / รหัส..." className="pl-9 pr-4 py-2 bg-slate-100 border-none rounded-xl text-sm font-bold w-64 outline-none" value={searchQuery} onChange={(e)=>setSearchQuery(e.target.value)} />
            </div>
            <button onClick={onClose} className="p-2 bg-slate-100 text-slate-500 rounded-full hover:bg-red-100 hover:text-red-600"><X className="w-5 h-5"/></button>
          </div>
        </div>

        {/* Debug Box */}
        {debugText && (
          <div className="absolute top-24 left-1/2 -translate-x-1/2 w-[90%] max-w-4xl bg-black text-emerald-400 p-6 rounded-2xl z-50 shadow-2xl border border-slate-700">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-black flex items-center gap-2"><Code2 className="w-5 h-5"/> ข้อมูลที่คอมพิวเตอร์อ่านได้จาก Excel</h3>
              <button onClick={() => setDebugText('')} className="bg-white/10 p-2 rounded hover:bg-red-500 text-white"><X className="w-4 h-4"/></button>
            </div>
            <textarea readOnly value={debugText} className="w-full h-64 bg-slate-900 text-emerald-300 font-mono text-xs p-4 rounded-xl outline-none" />
          </div>
        )}

        {/* Split Screen */}
        <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
          
          {/* ซ้าย: ใบส่งของ (DEP) */}
          <div className="flex-1 flex flex-col border-r border-slate-200 bg-slate-50/50 relative">
            <div className="p-4 border-b border-slate-200 bg-white flex justify-between items-center shadow-sm z-10">
              <h2 className="font-black text-slate-800 uppercase tracking-widest flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-red-500 animate-pulse"></span> ใบส่งของ (รอออกบิล)</h2>
              {/* 🟢 อัปเดต: เปลี่ยนประเภทไฟล์เป็น Excel */}
              <label className={`cursor-pointer ${isUploadingDep ? 'bg-slate-500' : 'bg-emerald-600 hover:bg-emerald-700'} text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-md`}>
                {isUploadingDep ? <Loader2 className="w-4 h-4 animate-spin"/> : <UploadCloud className="w-4 h-4"/>} อัปโหลด Excel (ใบส่งของ)
                <input type="file" accept=".xlsx, .xls, .csv" className="hidden" onChange={handleUploadDelivery} disabled={isUploadingDep} />
              </label>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {deliveryNotes.filter(n => n.depNo.includes(searchQuery) || n.cusName.includes(searchQuery)).length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 font-bold text-sm">ยังไม่มีข้อมูลใบส่งของ</div>
              ) : (
                deliveryNotes.filter(n => n.depNo.includes(searchQuery) || n.cusName.includes(searchQuery)).map(note => (
                  <div key={note.id} className="bg-white border-red-200 border-l-4 border-l-red-500 p-4 rounded-xl shadow-sm">
                    <div className="flex justify-between items-start mb-2">
                      <div className="font-mono font-black text-lg text-slate-800">{note.depNo}</div>
                      <span className="bg-red-100 text-red-600 px-2 py-1 rounded-md text-[9px] font-black uppercase flex items-center gap-1"><Clock className="w-3 h-3"/> รอระบบจับคู่</span>
                    </div>
                    <div className="text-xs font-bold text-slate-600 space-y-1">
                      <div className="flex justify-between"><span>รหัส: {note.cusCode}</span> <span className="text-slate-800">{note.cusName}</span></div>
                      <div className="flex justify-between items-end mt-2">
                        <span className="text-[10px] text-slate-400 uppercase font-black">ยอดสุทธิ</span>
                        <span className="text-lg font-black text-slate-800">฿{note.amount.toLocaleString('th-TH', {minimumFractionDigits: 2})}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* ขวา: รายงานขาย (บิล 25...) */}
          <div className="flex-1 flex flex-col bg-slate-100/50 relative">
            <div className="p-4 border-b border-slate-200 bg-white flex justify-between items-center shadow-sm z-10">
              <h2 className="font-black text-slate-800 uppercase tracking-widest flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-blue-500"></span> รายงานขาย (บิลที่ออกแล้ว)</h2>
              {/* 🟢 อัปเดต: เปลี่ยนประเภทไฟล์เป็น Excel */}
              <label className={`cursor-pointer ${isUploadingSales ? 'bg-blue-400' : 'bg-emerald-600 hover:bg-emerald-700'} text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-md`}>
                {isUploadingSales ? <Loader2 className="w-4 h-4 animate-spin"/> : <UploadCloud className="w-4 h-4"/>} อัปโหลด Excel (บิลขาย)
                <input type="file" accept=".xlsx, .xls, .csv" className="hidden" onChange={handleUploadSales} disabled={isUploadingSales} />
              </label>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {salesReports.filter(s => s.invNo.includes(searchQuery) || s.cusName.includes(searchQuery)).length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 font-bold text-sm">ยังไม่มีข้อมูลรายงานขาย</div>
              ) : (
                salesReports.filter(s => s.invNo.includes(searchQuery) || s.cusName.includes(searchQuery)).map(report => (
                  <div key={report.id} className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm">
                     <div className="flex justify-between items-start mb-2">
                      <div className="font-mono font-black text-lg text-blue-700">{report.invNo}</div>
                      {report.refDep ? (
                        <span className="bg-indigo-100 text-indigo-700 px-2 py-1 rounded-md text-[9px] font-black uppercase flex items-center gap-1">อ้างอิง: {report.refDep}</span>
                      ) : (
                        <span className="bg-slate-100 text-slate-500 px-2 py-1 rounded-md text-[9px] font-black uppercase flex items-center gap-1">ไม่มีอ้างอิง DEP</span>
                      )}
                    </div>
                    <div className="text-xs font-bold text-slate-600 space-y-1">
                      <div className="flex justify-between"><span>รหัส: {report.cusCode}</span> <span className="text-slate-800">{report.cusName}</span></div>
                      <div className="flex justify-between items-end mt-2">
                        <span className="text-[10px] text-slate-400 uppercase font-black">ยอดสุทธิ</span>
                        <span className="text-lg font-black text-slate-800">฿{report.amount.toLocaleString('th-TH', {minimumFractionDigits: 2})}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}