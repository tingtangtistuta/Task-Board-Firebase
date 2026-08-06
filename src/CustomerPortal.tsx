import React, { useState, useEffect } from 'react';
// 🟢 [สำหรับโหมด Admin] เพิ่ม doc, updateDoc สำหรับการอัปเดตไฟล์ในฐานข้อมูล
import { collection, onSnapshot, query, orderBy, doc, updateDoc } from 'firebase/firestore';
// 🟢 [สำหรับโหมด Admin] เพิ่มคำสั่งเกี่ยวกับ Storage สำหรับอัปโหลดไฟล์
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
// 🟢 [สำหรับโหมด Admin] ดึง db และ storage มาใช้
import { db, storage } from './firebase'; 
import { 
  Package, FileText, Download, Clock, CheckCircle2, 
  Truck, LogOut, Search, FileCheck, ShieldAlert,
  CalendarDays, Zap, FileBox, 
  // 🟢 [สำหรับโหมด Admin] เพิ่มไอคอนถังขยะ และ ปุ่มอัปโหลด
  Trash2, UploadCloud 
} from 'lucide-react';

const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbxzakXzIAqfrSeStPJRRx0dl75R9gXif64LWdpYT1BcfQXujLXh3FDjWbCFxirPylot/exec';

const LOGISTICS_STEPS = [
  { label: 'รับออเดอร์ (กำลังตรวจสอบ)', icon: <CheckCircle2 className="w-4 h-4"/>, color: 'bg-slate-400' },
  { label: 'กำลังจัดเตรียมสินค้า', icon: <Package className="w-4 h-4"/>, color: 'bg-sky-500' },
  { label: 'กำลังจัดส่ง / รอคิวส่ง', icon: <Truck className="w-4 h-4"/>, color: 'bg-amber-500' },
  { label: 'จัดส่งสำเร็จ', icon: <CheckCircle2 className="w-4 h-4"/>, color: 'bg-green-500' }
];

const BILLING_STEPS = [
  { label: 'รอรับเรื่องเอกสาร', icon: <Clock className="w-4 h-4"/>, color: 'bg-slate-400' },
  { label: 'กำลังรวบรวมเอกสาร', icon: <FileBox className="w-4 h-4"/>, color: 'bg-sky-500' },
  { label: 'รอเอกสารบิลโรงงาน', icon: <Clock className="w-4 h-4"/>, color: 'bg-amber-500' },
  { label: 'เอกสารพร้อมดาวน์โหลด', icon: <FileCheck className="w-4 h-4"/>, color: 'bg-green-500' }
];

// 🟢 [สำหรับโหมด Admin] รับ props ชื่อ isAdminView เพิ่มเข้ามา เพื่อเป็นบัตรผ่าน VIP
export default function CustomerPortal({ loggedInUser, onLogout, isAdminView = false }: { loggedInUser: any, onLogout: () => void, isAdminView?: boolean }) {
  const [tasks, setTasks] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>({ usersData: [] });
  const [activeTab, setActiveTab] = useState<'progress' | 'completed'>('progress');
  const [searchQuery, setSearchQuery] = useState('');
  
  // 🟢 [สำหรับโหมด Admin] สถานะตอนกำลังโหลดไฟล์
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    const fetchMasterData = async () => {
      try {
        const res = await fetch(WEB_APP_URL + '?nocache=' + new Date().getTime());
        const data = await res.json();
        if (data && data.settings) { setSettings(data.settings); }
      } catch (e) { console.error("Fetch settings failed"); }
    };
    fetchMasterData();
  }, []);

  useEffect(() => {
    if (!loggedInUser?.name) return;
    
    const q = query(collection(db, 'tasks'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const allTasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const myTasks = allTasks.filter(t => t.customerName === loggedInUser.name);
      setTasks(myTasks);
    });
    return () => unsub();
  }, [loggedInUser]);

  // 🟢 [สำหรับโหมด Admin] ฟังก์ชันอัปโหลดไฟล์ (ทำงานเฉพาะตอนเป็น Admin)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, task: any) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    setIsUploading(true);

    try {
      // 1. อัปโหลดไฟล์ขึ้น Storage
      const fileRef = ref(storage, `official_docs/${task.id}/${file.name}`);
      await uploadBytes(fileRef, file);
      const url = await getDownloadURL(fileRef);

      // 2. เตรียมข้อมูลไฟล์ใหม่
      const newDoc = {
        name: file.name,
        url: url,
        uploadedAt: new Date().toISOString()
      };

      // 3. เอาไฟล์ใหม่ไปต่อท้ายไฟล์เดิม
      const currentDocs = task.officialDocs || [];
      await updateDoc(doc(db, 'tasks', task.id), {
        officialDocs: [...currentDocs, newDoc]
      });

      alert('✅ อัปโหลดไฟล์สำเร็จ');
    } catch (error) {
      console.error(error);
      alert('❌ เกิดข้อผิดพลาดในการอัปโหลดไฟล์');
    } finally {
      setIsUploading(false);
      e.target.value = ''; // รีเซ็ตช่องเลือกไฟล์
    }
  };

  // 🟢 [สำหรับโหมด Admin] ฟังก์ชันลบไฟล์ (ทำงานเฉพาะตอนเป็น Admin)
  const handleDeleteFile = async (task: any, docItem: any) => {
    if (!window.confirm(`ต้องการลบไฟล์ "${docItem.name}" ใช่หรือไม่?`)) return;
    
    try {
      // คัดกรองเอาไฟล์ที่ต้องการลบออก
      const updatedDocs = (task.officialDocs || []).filter((d: any) => d.url !== docItem.url);
      
      // อัปเดตข้อมูลกลับไปที่ฐานข้อมูล
      await updateDoc(doc(db, 'tasks', task.id), {
        officialDocs: updatedDocs
      });
      
    } catch (error) {
      console.error(error);
      alert('❌ เกิดข้อผิดพลาดในการลบไฟล์');
    }
  };

  const getTrackSteps = (task: any) => {
    const persons = task.relatedPersons || [];
    const indStatus = task.individualStatus || {};
    
    let logisticSteps: number[] = [];
    let billingSteps: number[] = [];

    persons.forEach((pName: string) => {
      const userDef = settings.usersData.find((u: any) => u.name === pName);
      const dept = userDef?.department || '';
      const step = indStatus[pName] || 0;

      if (dept.includes('บัญชี')) {
        billingSteps.push(step);
      } else {
        logisticSteps.push(step);
      }
    });

    const logStep = logisticSteps.length > 0 ? Math.min(...logisticSteps) : 0;
    const billStep = billingSteps.length > 0 ? Math.min(...billingSteps) : 0;

    return { 
      logStep: Math.min(Math.max(logStep, 0), 3), 
      billStep: Math.min(Math.max(billStep, 0), 3), 
      hasBilling: billingSteps.length > 0 
    };
  };

  const isExpired = (taskDate: any) => {
    if (!taskDate?.toDate) return false;
    const taskTime = taskDate.toDate().getTime();
    const ninetyDaysAgo = new Date().getTime() - (90 * 24 * 60 * 60 * 1000);
    return taskTime < ninetyDaysAgo;
  };

  const filteredTasks = tasks.filter(t => {
    const safeTopic = (t.topic || '').toLowerCase();
    const safeDoc = (t.documentNo || '').toLowerCase();
    const q = searchQuery.toLowerCase();
    if (searchQuery && !safeTopic.includes(q) && !safeDoc.includes(q)) return false;
    
    if (activeTab === 'progress') return !t.isArchived;
    if (activeTab === 'completed') return t.isArchived;
    return true;
  });

  const renderProgressBar = (currentStep: number, stepsDef: any[], isComplete: boolean) => {
    return (
      <div className="mt-3">
        <div className="flex justify-between items-end mb-2">
          <span className={`text-xs font-black uppercase flex items-center gap-1 ${isComplete ? 'text-green-600 dark:text-lime-400' : 'text-blue-600 dark:text-blue-400'}`}>
            {stepsDef[currentStep].icon} {stepsDef[currentStep].label}
          </span>
        </div>
        <div className="flex gap-1">
          {[0, 1, 2, 3].map(i => {
            let color = i <= currentStep ? stepsDef[currentStep].color : 'bg-slate-200 dark:bg-slate-800';
            return <div key={i} className={`h-2 flex-1 rounded-full transition-all duration-500 ${color}`} />;
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 font-sans text-slate-800 dark:text-slate-200">
      <header className="bg-gradient-to-r from-cyan-700 to-blue-800 text-white p-4 shadow-lg sticky top-0 z-50">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 p-2 rounded-xl backdrop-blur-sm"><Zap className="w-6 h-6 text-cyan-300"/></div>
            <div>
              <h1 className="font-black italic tracking-tighter text-xl leading-none uppercase">
                STP <span className="text-cyan-300">Customer</span>
                {/* 🟢 [สำหรับโหมด Admin] โชว์ป้าย VIP ให้รู้ว่ากำลังแฮ็กระบบอยู่ */}
                {isAdminView && <span className="ml-2 text-[10px] bg-red-500 text-white px-2 py-0.5 rounded-full uppercase tracking-widest font-black animate-pulse">Admin Mode</span>}
              </h1>
              <span className="text-[10px] font-bold text-cyan-100 tracking-widest uppercase">หจก.แสงไทยพานิช(1992)</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <div className="text-[10px] font-black uppercase text-cyan-200 tracking-widest">ยินดีต้อนรับ</div>
              <div className="text-sm font-bold">{loggedInUser?.name}</div>
            </div>
            {/* 🟢 [สำหรับโหมด Admin] ซ่อนปุ่ม Logout ถ้านี่เป็นโหมดจำลอง (เพราะเรามีปุ่มออกจากการจำลองสีแดงด้านบนอยู่แล้ว) */}
            {!isAdminView && (
              <button onClick={onLogout} className="bg-white/10 p-2.5 rounded-xl hover:bg-red-500 transition-all text-white backdrop-blur-sm">
                <LogOut className="w-5 h-5"/>
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 py-8">
        
        <div className="mb-6 space-y-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
            <input type="text" placeholder="ค้นหาชื่อสินค้า หรือ เลขที่บิล..." className="w-full pl-12 pr-4 py-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-cyan-500 transition-all shadow-sm" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          </div>

          <div className="flex bg-slate-200/50 dark:bg-slate-900/50 p-1 rounded-xl">
            <button onClick={() => setActiveTab('progress')} className={`flex-1 py-3 text-sm font-black rounded-lg transition-all flex items-center justify-center gap-2 ${activeTab === 'progress' ? 'bg-white dark:bg-slate-800 text-cyan-600 dark:text-cyan-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
              <Truck className="w-4 h-4"/> กำลังดำเนินการ
            </button>
            <button onClick={() => setActiveTab('completed')} className={`flex-1 py-3 text-sm font-black rounded-lg transition-all flex items-center justify-center gap-2 ${activeTab === 'completed' ? 'bg-white dark:bg-slate-800 text-green-600 dark:text-lime-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
              <FileCheck className="w-4 h-4"/> ประวัติ & เอกสาร
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {filteredTasks.length === 0 ? (
            <div className="text-center py-20 text-slate-400">
              <Package className="w-16 h-16 mx-auto mb-4 opacity-20"/>
              <p className="font-black text-lg">ไม่พบข้อมูลออเดอร์</p>
              <p className="text-sm font-medium mt-1">ออเดอร์ของท่านจะแสดงที่นี่เมื่อมีการสั่งซื้อ</p>
            </div>
          ) : (
            filteredTasks.map(task => {
              const { logStep, billStep, hasBilling } = getTrackSteps(task);
              const isExpiredDoc = isExpired(task.createdAt);
              
              return (
                <div key={task.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-4 mb-4">
                    <div>
                      <h3 className="text-lg font-black text-slate-800 dark:text-white leading-tight mb-2">{task.topic}</h3>
                      <div className="flex flex-wrap gap-2 text-xs font-bold text-slate-500">
                        {task.documentNo && <span className="bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded border dark:border-slate-700">Ref: {task.documentNo}</span>}
                        <span className="bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded border dark:border-slate-700 flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5"/> สั่งเมื่อ: {task.createdAt?.toDate ? task.createdAt.toDate().toLocaleDateString('th-TH') : '-'}</span>
                      </div>
                    </div>
                    
                    {/* 🟢 แสดงรายการเอกสาร + ระบบ Admin VIP */}
                    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 w-full sm:w-auto">
                      <div className="flex items-center justify-between mb-2 gap-4">
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                          📄 เอกสารแนบจากทางร้าน
                        </div>
                        <div className="text-[9px] font-black text-red-500 bg-red-50 dark:bg-red-900/30 px-2 py-0.5 rounded-full border border-red-100 dark:border-red-800">
                          * ดาวน์โหลดได้ภายใน 45 วัน
                        </div>
                      </div>
                      
                      <div className="flex flex-col gap-2">
                        {(task.officialDocs || []).map((docItem: any, idx: number) => {
                          const uploadDate = new Date(docItem.uploadedAt || task.createdAt?.toDate() || Date.now());
                          const diffTime = Math.abs(new Date().getTime() - uploadDate.getTime());
                          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                          const isExpired = diffDays > 45;

                          return (
                            <div key={idx} className="flex items-center gap-2">
                              {isExpired ? (
                                <button disabled className="bg-slate-100 dark:bg-slate-800 text-slate-400 px-3 py-2 rounded-xl text-[10px] font-black flex items-center gap-1.5 border border-slate-200 dark:border-slate-700 cursor-not-allowed max-w-xs truncate w-full justify-between">
                                  <div className="flex items-center gap-1.5 truncate">
                                    <ShieldAlert className="w-3.5 h-3.5 shrink-0 text-red-400"/> 
                                    <span className="truncate">{docItem.name}</span>
                                  </div>
                                  <span className="shrink-0 text-red-400 ml-1">(หมดอายุ)</span>
                                </button>
                              ) : (
                                <a 
                                  href={docItem.url} 
                                  target="_blank" 
                                  rel="noreferrer" 
                                  className="bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-xl text-xs font-black flex items-center justify-between gap-2 shadow-sm transition-all max-w-xs truncate w-full"
                                >
                                  <div className="flex items-center gap-1.5 truncate">
                                    <FileText className="w-4 h-4 shrink-0"/> 
                                    <span className="truncate">{docItem.name}</span>
                                  </div>
                                  <Download className="w-4 h-4 shrink-0 opacity-80"/>
                                </a>
                              )}

                              {/* 🟢 [สำหรับโหมด Admin] ปุ่มลบเอกสาร (โผล่เฉพาะ Admin) */}
                              {isAdminView && (
                                <button 
                                  onClick={() => handleDeleteFile(task, docItem)}
                                  className="p-2 bg-red-100 hover:bg-red-200 text-red-600 rounded-xl transition-colors shrink-0"
                                  title="ลบเอกสารนี้"
                                >
                                  <Trash2 className="w-4 h-4"/>
                                </button>
                              )}
                            </div>
                          );
                        })}
                        
                        {/* 🟢 [สำหรับโหมด Admin] ปุ่มเพิ่มเอกสาร (โผล่เฉพาะ Admin) */}
                        {isAdminView && (
                          <label className={`cursor-pointer mt-2 text-xs font-black bg-purple-100 hover:bg-purple-200 text-purple-700 border border-purple-200 px-3 py-2 rounded-xl flex items-center justify-center gap-2 transition-all w-full sm:max-w-xs ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                            <UploadCloud className="w-4 h-4"/>
                            {isUploading ? 'กำลังอัปโหลด...' : '+ เพิ่มเอกสาร (โหมด Admin)'}
                            <input 
                              type="file" 
                              className="hidden" 
                              onChange={(e) => handleFileUpload(e, task)} 
                              disabled={isUploading}
                            />
                          </label>
                        )}
                        {(task.officialDocs || []).length === 0 && !isAdminView && (
                           <div className="text-[10px] text-slate-400 italic">ยังไม่มีเอกสารแนบ</div>
                        )}
                      </div>
                    </div> 
                  </div>

                  {!task.isArchived ? (
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-100 dark:border-slate-800/50 mt-4">
                       <div>
                         <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">🚚 สถานะสินค้า (Logistics)</div>
                         {renderProgressBar(logStep, LOGISTICS_STEPS, logStep === 3)}
                       </div>
                       
                       {hasBilling && (
                         <div>
                           <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">📄 สถานะเอกสาร (Billing)</div>
                           {renderProgressBar(billStep, BILLING_STEPS, billStep === 3)}
                         </div>
                       )}
                     </div>
                  ) : (
                    <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/50 rounded-xl flex items-center gap-3 text-green-700 dark:text-green-400">
                      <CheckCircle2 className="w-6 h-6 shrink-0"/>
                      <div>
                        <div className="font-black text-sm">การจัดส่งและเอกสารเสร็จสมบูรณ์</div>
                        <div className="text-xs font-bold opacity-80 mt-0.5">ออเดอร์นี้ได้ทำการส่งมอบสินค้าและเปิดบิลเรียบร้อยแล้ว ขอบคุณที่ไว้วางใจ หจก.แสงไทยพานิช(1992)</div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </main>
    </div>
  );
}