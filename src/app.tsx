import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, query, orderBy, deleteDoc, setDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from './firebase'; 
import { 
  Search, CheckCircle2, Clock, 
  Paperclip, Send, AlertTriangle, ArrowLeft,
  MessageSquare, User, Plus, Loader2, LogOut, X, Package, Archive, CalendarDays, Trash2, Users, Info, UserPlus, FileText, Filter,
  Settings, Flag, Zap, Sun, Moon, QrCode
} from 'lucide-react';

const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbym2Jl1qlXHqaNJq7S0TbhhsXegSDAPwIzf7h8_q08rOkkyY60G4UWy_NeHVsFIenCO/exec';

// --- 💳 ตั้งค่าบัญชีรับเงิน (QR Code) ---
const MAIN_ACCOUNT = {
  id: 'kbank_main',
  label: 'บัญชีกระแสรายวัน หจก. (กสิกรไทย)',
  promptpay: '0723535000789',
  bankName: 'ธ.กสิกรไทย (กระแสรายวัน)',
  accountNo: '2011030109'
};

const generatePromptPayPayload = (id: string, amount: any) => {
  const target = id.replace(/[^0-9]/g, '');
  let idTag = '';
  if (target.length === 10) idTag = '01' + ('0066' + target.substring(1)).length.toString().padStart(2, '0') + ('0066' + target.substring(1));
  else if (target.length === 13) idTag = '02' + target.length.toString().padStart(2, '0') + target;
  else return null;

  const merchantInfo = '0016A000000677010111' + idTag;
  let payload = '000201' + '010212' + '29' + merchantInfo.length.toString().padStart(2, '0') + merchantInfo + '5802TH' + '5303764'; 
  if (amount && amount > 0) {
    const amtStr = parseFloat(amount).toFixed(2).toString();
    payload += '54' + amtStr.length.toString().padStart(2, '0') + amtStr;
  }
  payload += '6304'; 
  let crc = 0xFFFF;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) crc = (crc << 1) ^ 0x1021;
      else crc = crc << 1;
    }
  }
  return payload + (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
};

const formatThaiDateTime = (timestamp: any) => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${(date.getFullYear() + 543).toString().slice(-2)} เวลา ${date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.`;
};

export default function App() {
  const [loggedInUser, setLoggedInUser] = useState<any>(null);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [isDarkMode, setIsDarkMode] = useState(false);

  // --- 📦 State ของระบบ QR Code ---
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [qrMerchantName] = useState('หจก.แสงไทยพานิช(1992)');
  const [isCustomBank, setIsCustomBank] = useState(false);
  const [customBank, setCustomBank] = useState({ promptpay: '', bankName: '', accountNo: '' });
  const [batchFiles, setBatchFiles] = useState<any[]>([]);
  const [expiryDate, setExpiryDate] = useState('');
  const [expiryTime, setExpiryTime] = useState('23:59');
  const [isQrProcessing, setIsQrProcessing] = useState(false);
  const [historyLogs, setHistoryLogs] = useState<any[]>([]);
  const [qrActiveTab, setQrActiveTab] = useState('generator');
  const [selectedCustomerBill, setSelectedCustomerBill] = useState<any>(null);
  const [showOnlyPending, setShowOnlyPending] = useState(false);
  const [displayLimit, setDisplayLimit] = useState(20);

  // โหลด Scripts สำหรับ QR Code และ PDF-lib
  useEffect(() => {
    const loadScript = (src: string) => {
      if (document.querySelector(`script[src="${src}"]`)) return;
      const script = document.createElement('script'); script.src = src; script.async = true; document.body.appendChild(script);
    };
    loadScript('https://cdn.jsdelivr.net/npm/qrcode@1.5.1/build/qrcode.min.js');
    loadScript('https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js');
    loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
  }, []);

  useEffect(() => {
    const savedTheme = localStorage.getItem('stp_theme');
    if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      setIsDarkMode(true); document.documentElement.classList.add('dark');
    } else {
      setIsDarkMode(false); document.documentElement.classList.remove('dark');
    }
  }, []);

  const toggleTheme = () => {
    if (isDarkMode) { document.documentElement.classList.remove('dark'); localStorage.setItem('stp_theme', 'light'); setIsDarkMode(false); } 
    else { document.documentElement.classList.add('dark'); localStorage.setItem('stp_theme', 'dark'); setIsDarkMode(true); }
  };

  const [confirmModal, setConfirmModal] = useState<{isOpen: boolean, title: string, text: string, type: 'danger' | 'warning' | 'info', onConfirm: () => void}>({ isOpen: false, title: '', text: '', type: 'info', onConfirm: () => {} });
  const [settings, setSettings] = useState({ users: [], topicMapping: {} });
  const [tasks, setTasks] = useState<any[]>([]);
  const [chats, setChats] = useState<any>({});
  const [userPresence, setUserPresence] = useState<any>({});
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const selectedTask = tasks.find(t => t.id === selectedTaskId) || null;
  const [chatInput, setChatInput] = useState('');
  const [chatFile, setChatFile] = useState<File | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filterRequester, setFilterRequester] = useState('All');
  const [filterPerson, setFilterPerson] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');
  const [sortBy, setSortBy] = useState('latest');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAddPersonModalOpen, setIsAddPersonModalOpen] = useState(false); 
  const [newTask, setNewTask] = useState({ topic: '', documentNo: '', details: '', relatedPersons: [] as string[], dueDate: '' });

  const steps = [
    { label: 'รอรับงาน', icon: <Clock className="w-3.5 h-3.5" />, color: 'bg-slate-400 dark:bg-slate-600 dark:shadow-[0_0_5px_#475569]', text: 'text-slate-500 dark:text-slate-400' },
    { label: 'รับเรื่องแล้ว', icon: <User className="w-3.5 h-3.5" />, color: 'bg-sky-500 dark:bg-cyan-500 dark:shadow-[0_0_10px_#06b6d4]', text: 'text-sky-600 dark:text-cyan-400' },
    { label: 'กำลังดำเนินการ', icon: <Settings className="w-3.5 h-3.5 animate-spin" />, color: 'bg-amber-500 dark:shadow-[0_0_10px_#f59e0b]', text: 'text-amber-600 dark:text-amber-400' },
    { label: 'เสร็จสิ้น', icon: <Flag className="w-3.5 h-3.5" />, color: 'bg-green-500 dark:bg-lime-500 dark:shadow-[0_0_12px_#84cc16]', text: 'text-green-600 dark:text-lime-400' }
  ];

  const allTopics = Object.values(settings?.topicMapping || {}).flat() as string[];
  const showToast = (msg: string) => { setToastMsg(msg); setTimeout(() => setToastMsg(''), 4000); };

  // --- ฟังก์ชันของ QR Code ---
  useEffect(() => {
    if (!loggedInUser || !isQrModalOpen) return;
    const unsub = onSnapshot(collection(db, 'qr_bills'), (snap) => {
      const logs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      logs.sort((a: any, b: any) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
      setHistoryLogs(logs);
    }, (err) => console.log("แจ้งเตือน: อ่านประวัติ QR ไม่ได้"));
    return () => unsub();
  }, [loggedInUser, isQrModalOpen]);

  useEffect(() => {
    if (batchFiles.length === 0 || historyLogs.length === 0) return;
    let hasChanges = false;
    const updatedBatch = batchFiles.map(item => {
      const matched = historyLogs.find(log => log.refNo === item.refNo && log.status === 'PAID');
      const newError = matched ? `⚠️ ชำระแล้วเมื่อ ${new Date(matched.paidAt).toLocaleDateString('th-TH')}` : null;
      if (item.error !== newError) { hasChanges = true; return { ...item, error: newError }; }
      return item;
    });
    if (hasChanges) setBatchFiles(updatedBatch);
  }, [batchFiles, historyLogs]);

  const getActiveAccount = () => isCustomBank ? customBank : MAIN_ACCOUNT;
  const handleFileUpload = (e: any) => {
    const files = Array.from(e.target.files);
    const newItems = files.map((f: any) => ({ id: Math.random().toString(36).substr(2, 9), file: f, refNo: f.name.replace(/\.pdf$/i, ''), amount: '', error: null }));
    setBatchFiles(prev => [...prev, ...newItems]); e.target.value = null;
  };
  const handleManualAdd = () => {
    const newItem = { id: Math.random().toString(36).substr(2, 9), file: null, refNo: `INV${new Date().getTime().toString().slice(-4)}`, amount: '', error: null };
    setBatchFiles(prev => [...prev, newItem]);
  };
  const removeBatchItem = (id: string) => setBatchFiles(prev => prev.filter(item => item.id !== id));
  const updateBatchItem = (id: string, field: string, value: any) => setBatchFiles(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));

  const createStampImage = async (qrBase64: string, amt: number, refNo: string, targetTime: number, activeAcc: any) => {
    const canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 400; const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#000000'; ctx.lineWidth = 4; ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);
    const img = new Image(); img.src = qrBase64; await new Promise(res => img.onload = res as any);
    const margin = 16, qrSize = 240, qrX = margin, qrY = canvas.height - qrSize - margin; 
    ctx.drawImage(img, qrX, qrY, qrSize, qrSize);
    ctx.fillStyle = '#000000'; ctx.textAlign = 'left';
    ctx.font = 'bold 36px sans-serif'; ctx.fillText(qrMerchantName, margin, 55, canvas.width - (margin * 2));
    ctx.font = '24px sans-serif'; ctx.fillText(`${activeAcc.bankName} : ${activeAcc.accountNo}`, margin, 100, canvas.width - (margin * 2));
    ctx.font = '24px sans-serif'; ctx.fillText(`Ref. No: ${refNo || '-'}`, margin, 135, canvas.width - (margin * 2));
    const textRightX = qrX + qrSize + 24, maxRightWidth = canvas.width - textRightX - margin;
    ctx.font = 'bold 52px sans-serif'; ctx.fillText(`ยอดชำระ: ${parseFloat(amt.toString()).toLocaleString('th-TH', { minimumFractionDigits: 2 })}`, textRightX, 235, maxRightWidth);
    if (targetTime) { ctx.font = 'bold 26px sans-serif'; ctx.fillText(`หมดอายุ: ${formatThaiDateTime(targetTime)}`, textRightX, 335, maxRightWidth); }
    return canvas.toDataURL('image/png');
  };

  const processQrBatchFiles = async () => {
    if (!loggedInUser) return showToast("❌ ปฏิเสธการเข้าถึง กรุณาล็อกอิน");
    if (batchFiles.length === 0 || !expiryDate || batchFiles.some(f => !f.amount || f.amount <= 0) || batchFiles.some(f => f.error)) {
      return showToast("⚠️ ข้อมูลไม่ครบถ้วน หรือยอดเงินไม่ถูกต้อง");
    }
    const activeAcc = getActiveAccount(); 
    if (!activeAcc.promptpay) return showToast("⚠️ ระบุ PromptPay ID ให้ถูกต้อง");
    const targetTime = new Date(`${expiryDate}T${expiryTime}`).getTime(); 
    if (targetTime <= new Date().getTime()) return showToast("⚠️ เวลาหมดอายุต้องมากกว่าปัจจุบัน");

    setIsQrProcessing(true);
    try {
      const zip = new (window as any).JSZip();
      for (const item of batchFiles) {
        const payload = generatePromptPayPayload(activeAcc.promptpay, item.amount);
        const qrBase64Url = await (window as any).QRCode.toDataURL(payload, { width: 400, margin: 1, color: { dark: '#000000', light: '#ffffff' }});
        const stampDataUrl = await createStampImage(qrBase64Url, item.amount, item.refNo, targetTime, activeAcc);
        
        let fileContent; let fileExt;
        if (item.file) {
          const pdfBytes = await item.file.arrayBuffer(); 
          const pdfDoc = await (window as any).PDFLib.PDFDocument.load(pdfBytes);
          const pngImage = await pdfDoc.embedPng(stampDataUrl);
          
          // 🟢 จุดแก้ไข: ตรวจสอบจำนวนหน้า และบังคับประทับตราที่หน้าสุดท้ายเสมอ
          const pages = pdfDoc.getPages();
          const lastPage = pages[pages.length - 1]; 
          
          lastPage.drawImage(pngImage, { x: 30, y: 30, width: 50 * 2.83465, height: 25 * 2.83465 });
          fileContent = await pdfDoc.save(); fileExt = 'pdf';
        } else {
          const response = await fetch(stampDataUrl); fileContent = await response.arrayBuffer(); fileExt = 'png';
        }

        const safeRef = item.refNo.replace(/[^a-zA-Z0-9_-]/g, '_');
        const filename = `${safeRef}_QR.${fileExt}`;
        zip.file(filename, fileContent);
        
        await addDoc(collection(db, 'qr_bills'), {
          refNo: item.refNo, amount: parseFloat(item.amount), bankName: activeAcc.bankName, accountNo: activeAcc.accountNo, 
          promptpay: activeAcc.promptpay, expireAt: targetTime, status: 'PENDING', qrPayload: payload, createdAt: serverTimestamp(), paidAt: null
        });
      }
      
      const content = batchFiles.length === 1 ? await zip.file(Object.keys(zip.files)[0]).async("blob") : await zip.generateAsync({ type: "blob" });
      const link = document.createElement('a'); link.href = URL.createObjectURL(content); 
      link.download = batchFiles.length === 1 ? Object.keys(zip.files)[0] : `Batch_Bills_QR_${new Date().toISOString().split('T')[0]}.zip`; 
      link.click();
      showToast(`✅ สร้าง QR สำเร็จ ${batchFiles.length} รายการ!`); setBatchFiles([]);
    } catch (err) { showToast("❌ เกิดข้อผิดพลาดตอนสร้าง PDF/QR"); } 
    finally { setIsQrProcessing(false); }
  };

  const handleSimulatePayment = async (billId: string) => {
    if (!loggedInUser) return;
    try {
      await updateDoc(doc(db, 'qr_bills', billId), { status: 'PAID', paidAt: new Date().getTime() });
      if (selectedCustomerBill?.id === billId) setSelectedCustomerBill((prev:any) => ({ ...prev, status: 'PAID', paidAt: new Date().getTime() }));
      showToast('✅ จำลองการโอนเงินสำเร็จ!');
    } catch (err) {}
  };

  const exportToCSV = () => {
    if (historyLogs.length === 0) return showToast("⚠️ ไม่มีข้อมูลประวัติ");
    const headers = ["วันที่สร้าง", "เลขที่เอกสาร (Ref)", "ยอดเงิน (บาท)", "ธนาคาร", "สถานะ", "วันที่ชำระเงิน"];
    const rows = historyLogs.map(log => [
      log.createdAt ? new Date(log.createdAt.toMillis()).toLocaleString('th-TH') : '', log.refNo, log.amount, log.bankName, log.status === 'PAID' ? 'ชำระแล้ว' : 'รอดำเนินการ', log.paidAt ? new Date(log.paidAt).toLocaleString('th-TH') : '-'
    ]);
    let csvContent = "\uFEFF" + [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob);
    link.download = `QR_Billing_History.csv`; link.click();
  };

  const filteredLogs = showOnlyPending ? historyLogs.filter(log => log.status === 'PENDING') : historyLogs;
  const displayedLogs = filteredLogs.slice(0, displayLimit);
  const totalPending = historyLogs.filter(l => l.status === 'PENDING').length;

  // --- Task Board Logic (เหมือนเดิมทุกอย่าง) ---
  useEffect(() => {
    if (selectedTaskId && loggedInUser?.name) { updateDoc(doc(db, 'tasks', selectedTaskId), { unreadBy: arrayRemove(loggedInUser.name) }).catch(() => {}); }
  }, [selectedTaskId, loggedInUser]);

  useEffect(() => {
    const fetchMasterData = async () => {
      try { const res = await fetch(WEB_APP_URL); const data = await res.json(); if (data && data.settings) setSettings({ users: data.settings.users || [], topicMapping: data.settings.topicMapping || {} }); } 
      catch (e) { setSettings({ users: ['อภิสิทธิ์', 'แอดมิน'], topicMapping: {} }); }
    };
    try { const savedUser = localStorage.getItem('stp_user_session'); if (savedUser) setLoggedInUser(JSON.parse(savedUser)); } catch (e) { localStorage.removeItem('stp_user_session'); }
    fetchMasterData();
  }, []);

  useEffect(() => {
    if (!loggedInUser?.name) return;
    const userRef = doc(db, 'presence', loggedInUser.name);
    setDoc(userRef, { isOnline: true, lastSeen: serverTimestamp() }, { merge: true }).catch(() => {});
    const handleBeforeUnload = () => { updateDoc(userRef, { isOnline: false, lastSeen: serverTimestamp() }).catch(() => {}); };
    window.addEventListener('beforeunload', handleBeforeUnload);
    const unsub = onSnapshot(collection(db, 'presence'), (snap) => { const pres: any = {}; snap.forEach(d => { pres[d.id] = d.data(); }); setUserPresence(pres); }, () => {});
    return () => { window.removeEventListener('beforeunload', handleBeforeUnload); updateDoc(userRef, { isOnline: false, lastSeen: serverTimestamp() }).catch(()=>{}); unsub(); };
  }, [loggedInUser]);

  useEffect(() => {
    if (!loggedInUser) return;
    return onSnapshot(query(collection(db, 'tasks'), orderBy('lastActivity', 'desc')), (snap) => setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() }))), () => {});
  }, [loggedInUser]);

  useEffect(() => {
    if (!selectedTaskId) return;
    return onSnapshot(query(collection(db, 'tasks', selectedTaskId, 'chats'), orderBy('timestamp', 'asc')), (snap) => setChats((prev: any) => ({ ...prev, [selectedTaskId]: snap.docs.map(d => ({ id: d.id, ...d.data() })) })), () => {});
  }, [selectedTaskId]);

  const handleLogin = async (e: any) => {
    e.preventDefault(); setIsLoading(true);
    try {
      const res = await fetch(WEB_APP_URL, { method: 'POST', body: JSON.stringify({ action: 'LOGIN', ...loginForm }) });
      const result = await res.json();
      if (result.status === 'success') { localStorage.setItem('stp_user_session', JSON.stringify(result.user)); setLoggedInUser(result.user); } 
      else showToast('❌ รหัสผ่านไม่ถูกต้อง');
    } catch { showToast('❌ เชื่อมต่อ Google Sheets ไม่ได้'); }
    setIsLoading(false);
  };

  const handleLogout = async () => {
    if (loggedInUser?.name) updateDoc(doc(db, 'presence', loggedInUser.name), { isOnline: false, lastSeen: serverTimestamp() }).catch(()=>{});
    localStorage.removeItem('stp_user_session'); setLoggedInUser(null);
  };

  const handleCreateTask = async (e: any) => {
    e.preventDefault();
    if (!newTask.topic || newTask.relatedPersons.length === 0 || !newTask.dueDate) return showToast('กรุณากรอกข้อมูลให้ครบถ้วน');
    setIsLoading(true);
    try {
      const individualStatus: any = {}; newTask.relatedPersons.forEach(p => { individualStatus[p] = 0; });
      const docRef = await addDoc(collection(db, 'tasks'), { 
        ...newTask, requester: loggedInUser.name, individualStatus, unreadBy: [...newTask.relatedPersons].filter(p => p !== loggedInUser.name), 
        currentStep: 0, hasIssue: false, issueReporter: null, isArchived: false, createdAt: serverTimestamp(), lastActivity: serverTimestamp() 
      });
      await addDoc(collection(db, 'tasks', docRef.id, 'chats'), { sender: 'System', text: `🆕 ภารกิจใหม่: ${newTask.topic}\n🔖 อ้างอิง: ${newTask.documentNo || '-'}\n📝 ข้อมูล: ${newTask.details || '-'}`, timestamp: serverTimestamp(), isSystem: true });
      showToast('✅ สตาร์ทภารกิจสำเร็จ!'); setIsModalOpen(false); setNewTask({ topic: '', documentNo: '', details: '', relatedPersons: [], dueDate: '' });
    } catch { showToast('❌ สร้างงานล้มเหลว'); }
    setIsLoading(false);
  };

  const handleSendMessage = async (e: any) => {
    e.preventDefault();
    if ((!chatInput.trim() && !chatFile) || !selectedTaskId || isUploading) return;
    setIsUploading(true);
    try {
      let fileUrl = null, fileName = null;
      if (chatFile) {
        const fileRef = ref(storage, `uploads/${selectedTaskId}/${Date.now()}_${chatFile.name}`);
        await uploadBytes(fileRef, chatFile); fileUrl = await getDownloadURL(fileRef); fileName = chatFile.name;
      }
      const txt = chatInput; setChatInput(''); setChatFile(null);
      await addDoc(collection(db, 'tasks', selectedTaskId, 'chats'), { sender: loggedInUser.name, text: txt, fileUrl, fileName, timestamp: serverTimestamp(), isSystem: false });
      const unreadList = [...(selectedTask?.relatedPersons || []), selectedTask?.requester].filter(p => p && p !== loggedInUser.name);
      updateDoc(doc(db, 'tasks', selectedTaskId), { lastActivity: serverTimestamp(), unreadBy: arrayUnion(...unreadList) }).catch(()=>{});
    } catch(err) { showToast('❌ ส่งข้อมูลล้มเหลว'); }
    setIsUploading(false);
  };

  const advanceMyStep = async () => {
    if (!selectedTask || !selectedTaskId || !loggedInUser?.name) return;
    const myCurrent = selectedTask.individualStatus?.[loggedInUser.name] || 0; if (myCurrent >= 3) return;
    const myNext = myCurrent + 1; const newInd = { ...(selectedTask.individualStatus || {}), [loggedInUser.name]: myNext };
    const allSteps = (selectedTask.relatedPersons || []).map((p: string) => newInd[p] || 0);
    const globalMin = allSteps.length > 0 ? Math.min(...allSteps) : 0;
    const updates: any = { individualStatus: newInd, lastActivity: serverTimestamp() };
    if (globalMin > (selectedTask.currentStep || 0)) { updates.currentStep = globalMin; updates.hasIssue = false; updates.issueReporter = null; }
    const unreadList = [...(selectedTask.relatedPersons || []), selectedTask.requester].filter(p => p && p !== loggedInUser.name);
    updates.unreadBy = arrayUnion(...unreadList);
    try {
      await updateDoc(doc(db, 'tasks', selectedTaskId), updates);
      await addDoc(collection(db, 'tasks', selectedTaskId, 'chats'), { sender: 'System', text: `🚀 ${loggedInUser.name} สับเกียร์เพิ่มเป็น: ${steps[myNext]?.label || 'ดำเนินการต่อ'}`, timestamp: serverTimestamp(), isSystem: true });
    } catch(e) {}
  };

  const reportIssue = async () => {
    if (!selectedTask || !selectedTaskId) return;
    try {
      await updateDoc(doc(db, 'tasks', selectedTaskId), { hasIssue: true, issueReporter: loggedInUser.name, lastActivity: serverTimestamp() });
      await addDoc(collection(db, 'tasks', selectedTaskId, 'chats'), { sender: 'System', text: `🚨 ${loggedInUser.name} แจ้งเหตุฉุกเฉิน (Pit Stop)!`, timestamp: serverTimestamp(), isSystem: true });
    } catch(e) {}
  };

  const resolveIssue = async () => {
    if (!selectedTask || !selectedTaskId) return;
    try {
      await updateDoc(doc(db, 'tasks', selectedTaskId), { hasIssue: false, issueReporter: null, lastActivity: serverTimestamp() });
      await addDoc(collection(db, 'tasks', selectedTaskId, 'chats'), { sender: 'System', text: `✅ ${loggedInUser.name} แจ้งแก้ไขปัญหาของ ${selectedTask.issueReporter || 'ทีมงาน'} เรียบร้อยแล้ว!`, timestamp: serverTimestamp(), isSystem: true });
    } catch(e) {}
  };

  const addPersonToTask = async (pName: string) => {
    if (!selectedTask || !selectedTaskId) return;
    const newRelated = [...(selectedTask.relatedPersons || []), pName];
    try {
      await updateDoc(doc(db, 'tasks', selectedTaskId), { relatedPersons: newRelated, individualStatus: { ...(selectedTask.individualStatus || {}), [pName]: 0 }, currentStep: 0, lastActivity: serverTimestamp(), unreadBy: arrayUnion(...newRelated) });
      await addDoc(collection(db, 'tasks', selectedTaskId, 'chats'), { sender: 'System', text: `➕ ${loggedInUser.name} ดึง "${pName}" เข้าสนาม`, timestamp: serverTimestamp(), isSystem: true });
    } catch(e) {}
  };

  const archiveTask = async () => {
    if (!selectedTask || !selectedTaskId) return;
    setConfirmModal({ isOpen: true, title: 'เข้าเส้นชัย', text: 'ยืนยันปิดงานนี้และส่งเข้าคลังประวัติ?', type: 'info', onConfirm: async () => {
      try { await updateDoc(doc(db, 'tasks', selectedTaskId), { isArchived: true, lastActivity: serverTimestamp() }); setSelectedTaskId(null); } catch(e) {}
    }});
  };

  const deleteTask = async (tId: string, e: any) => {
    e.stopPropagation(); if (loggedInUser?.role !== 'Admin') return showToast('❌ สิทธิ์เข้าถึงถูกปฏิเสธ');
    setConfirmModal({ isOpen: true, title: 'ลบข้อมูลถาวร', text: '🚨 ลบข้อมูลภารกิจนี้ทิ้งถาวร ยืนยันหรือไม่?', type: 'danger', onConfirm: async () => {
      try { await deleteDoc(doc(db, 'tasks', tId)); if (selectedTaskId === tId) setSelectedTaskId(null); } catch(e) {}
    }});
  };

  const renderGauge = (currentStep: number, hasIssue: boolean) => {
    const safeStep = (currentStep >= 0 && currentStep <= 3) ? currentStep : 0;
    return (
      <div className="flex gap-1.5 mt-3 mb-2">
        {[0, 1, 2, 3].map(i => {
          let color = i <= safeStep ? (steps[safeStep]?.color || 'bg-slate-400') : 'bg-slate-200 dark:bg-slate-800 dark:border dark:border-slate-700';
          if (hasIssue && i === safeStep) color = 'bg-red-500 dark:bg-rose-600 animate-pulse shadow-[0_0_8px_red] dark:shadow-[0_0_15px_#e11d48]';
          return <div key={i} className={`h-2 flex-1 rounded-sm transition-all duration-300 transform dark:skew-x-[-15deg] ${color}`} />;
        })}
      </div>
    );
  };

  const processedTasks = tasks.filter(t => {
    if (t.isArchived) return false;
    const isRelated = (t.relatedPersons || []).includes(loggedInUser?.name) || t.requester === loggedInUser?.name || loggedInUser?.role === 'Admin';
    if (!isRelated) return false; 
    const safeTopic = (t.topic || '').toString().toLowerCase(); const safeDocNo = (t.documentNo || '').toString().toLowerCase(); const q = searchQuery.toLowerCase();
    if (searchQuery && !(safeTopic.includes(q) || safeDocNo.includes(q))) return false;
    if (filterRequester !== 'All' && t.requester !== filterRequester) return false;
    if (filterPerson !== 'All' && !(t.relatedPersons || []).includes(filterPerson)) return false;
    if (filterStatus !== 'All' && (t.currentStep || 0).toString() !== filterStatus) return false;
    return true;
  }).sort((a, b) => sortBy === 'status' ? (a.currentStep || 0) - (b.currentStep || 0) : 0);

  if (!loggedInUser) return (
    <div className="min-h-screen bg-slate-200 dark:bg-slate-950 flex items-center justify-center p-4 font-sans transition-colors duration-300 dark:bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]">
      <div className="bg-white dark:bg-slate-900 rounded-[2rem] p-8 w-full max-w-sm shadow-2xl dark:shadow-[0_0_40px_rgba(59,130,246,0.3)] border-b-8 border-blue-600 dark:border dark:border-blue-500/30 dark:backdrop-blur-sm transition-all duration-300">
        <h1 className="text-3xl dark:text-4xl font-black text-blue-900 dark:text-white mb-1 text-center tracking-tighter italic uppercase">STP <span className="dark:text-blue-500">Ltd.</span></h1>
        <p className="text-center text-slate-400 dark:text-blue-400 text-[10px] font-black mb-8 uppercase tracking-widest italic">Sangthai Panich Workflow</p>
        <form onSubmit={handleLogin} className="space-y-5">
          <input type="text" placeholder="Username" className="w-full p-4 bg-slate-100 dark:bg-slate-950 border border-transparent dark:border-slate-700 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white font-bold" value={loginForm.username} onChange={e => setLoginForm({...loginForm, username: e.target.value})} />
          <input type="password" placeholder="Password" className="w-full p-4 bg-slate-100 dark:bg-slate-950 border border-transparent dark:border-slate-700 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white font-bold" value={loginForm.password} onChange={e => setLoginForm({...loginForm, password: e.target.value})} />
          <button type="submit" disabled={isLoading} className="w-full bg-blue-600 hover:bg-blue-700 dark:hover:bg-blue-500 text-white p-4 rounded-2xl font-black text-lg shadow-xl dark:shadow-[0_0_20px_rgba(37,99,235,0.5)] transform active:scale-95 transition-all uppercase italic tracking-wider">START MISSION 🏎️</button>
        </form>
      </div>
    </div>
  );

  const safeGlobalStepIdx = (selectedTask?.currentStep >= 0 && selectedTask?.currentStep <= 3) ? selectedTask.currentStep : 0;
  const globalStepData = steps[safeGlobalStepIdx] || steps[0];

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex flex-col font-sans h-screen overflow-hidden text-slate-800 dark:text-slate-200 transition-colors duration-300">
      
      <header className="bg-slate-900 dark:bg-black text-white p-4 shadow-xl flex justify-between items-center z-30 border-b border-white/10 dark:border-blue-500/30 transition-colors">
        <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-xl dark:shadow-[0_0_15px_rgba(37,99,235,0.8)]"><Zap className="w-5 h-5 text-white"/></div>
            <div>
              <h1 className="font-black italic tracking-tighter text-2xl leading-none uppercase">STP <span className="text-blue-500">Ltd. LIVE</span></h1>
              <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 tracking-widest uppercase">Sangthai Panich (1992)</span>
            </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <div className="text-[10px] font-black uppercase text-blue-400 tracking-widest">{loggedInUser?.role || 'User'}</div>
            <div className="text-sm font-bold text-white">{loggedInUser?.name || ''}</div>
          </div>
          <button onClick={() => setIsQrModalOpen(true)} className="bg-blue-600 border border-blue-500 p-2.5 rounded-xl transition-all text-white shadow-[0_0_10px_rgba(37,99,235,0.5)] hover:bg-blue-500 group relative">
            <QrCode className="w-5 h-5"/>
            <span className="absolute -bottom-6 right-0 bg-black/80 text-white text-[9px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">QR Maker</span>
          </button>
          <button onClick={toggleTheme} className="bg-white/10 dark:bg-slate-900 border border-transparent dark:border-slate-800 p-2.5 rounded-xl transition-all text-amber-300 dark:text-blue-400">
            {isDarkMode ? <Sun className="w-5 h-5"/> : <Moon className="w-5 h-5"/>}
          </button>
          <button onClick={handleLogout} className="bg-white/10 dark:bg-slate-900 border border-transparent dark:border-slate-700 p-2.5 rounded-xl hover:bg-red-500 dark:hover:bg-rose-600 transition-all text-white"><LogOut className="w-5 h-5"/></button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <div className={`w-full md:w-1/3 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col transition-colors ${selectedTaskId ? 'hidden md:flex' : 'flex'}`}>
          <div className="bg-slate-800 dark:bg-black text-white p-2.5 flex overflow-x-auto gap-3 items-center shrink-0 border-b border-slate-700 dark:border-slate-800 no-scrollbar transition-colors">
            <div className="text-[9px] font-black text-slate-400 dark:text-slate-600 uppercase tracking-widest pl-2 shrink-0">DRIVER STATUS:</div>
            {(settings?.users || []).map((u: string) => {
              const isOnline = userPresence[u]?.isOnline;
              return (
                <div key={u} className={`flex items-center gap-1.5 shrink-0 px-3 py-1 rounded-full border transition-all ${isOnline ? 'bg-green-500/10 dark:bg-lime-500/10 border-green-500/50 dark:border-lime-500/30' : 'bg-transparent dark:bg-slate-900 border-slate-500 dark:border-slate-800 opacity-60'}`}>
                  <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-400 dark:bg-lime-400 shadow-[0_0_8px_#4ade80] dark:shadow-[0_0_8px_#a3e635]' : 'bg-slate-500 dark:bg-slate-700'}`}></span>
                  <span className={`text-[10px] font-bold dark:font-black uppercase tracking-tight ${isOnline ? 'text-white dark:text-lime-100' : 'text-slate-300 dark:text-slate-500'}`}>{u}</span>
                </div>
              );
            })}
          </div>
          <div className="p-4 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 space-y-4 shrink-0 transition-colors">
            <div className="flex justify-between items-center">
              <h2 className="font-black text-slate-800 dark:text-white text-lg tracking-tight italic uppercase">Missions ({processedTasks.length})</h2>
              <button onClick={() => setIsModalOpen(true)} className="bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 shadow-lg shadow-blue-500/30 dark:shadow-[0_0_15px_rgba(37,99,235,0.4)] hover:bg-blue-700 dark:hover:bg-blue-500 transition-all uppercase italic"><Plus className="w-4 h-4"/> สั่งงาน</button>
            </div>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 w-4 h-4" />
              <input type="text" placeholder="ค้นหาภารกิจ / บิล..." className="w-full pl-11 pr-4 py-3 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:ring-2 focus:border-blue-500 focus:ring-blue-500 dark:focus:ring-1 outline-none transition-all" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowFilters(!showFilters)} className={`flex-1 text-[10px] font-black uppercase flex items-center justify-center gap-2 py-2 rounded-lg border transition-all ${showFilters || filterRequester !== 'All' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-500/50' : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-white'}`}><Filter className="w-3 h-3"/> Filter</button>
              <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="flex-1 text-[10px] font-black uppercase bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-lg px-2 outline-none dark:focus:border-blue-500 cursor-pointer">
                <option value="latest">Sort: ล่าสุด</option>
                <option value="status">Sort: ตามสถานะ</option>
              </select>
            </div>
            {showFilters && (
              <div className="p-3 bg-white dark:bg-slate-950 rounded-xl border border-blue-100 dark:border-slate-800 space-y-3 shadow-inner transition-colors">
                 {loggedInUser?.role === 'Admin' && (
                   <div className="flex justify-between items-center"><span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">สั่งโดย:</span><select value={filterRequester} onChange={e=>setFilterRequester(e.target.value)} className="text-[10px] font-bold p-1.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-white rounded outline-none">{['All', ...(settings?.users || [])].map(u=><option key={u} value={u}>{u}</option>)}</select></div>
                 )}
                 <div className="flex justify-between items-center"><span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">สถานะ:</span><select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} className="text-[10px] font-bold p-1.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-white rounded outline-none"><option value="All">ทุกสถานะ</option>{steps.map((s,i)=><option key={i} value={i}>{s.label}</option>)}</select></div>
              </div>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-slate-100/50 dark:bg-slate-950 transition-colors">
            {processedTasks.map(task => {
               const isMyOrder = task.requester === loggedInUser?.name;
               const isUnread = (task.unreadBy || []).includes(loggedInUser?.name);
               const stepIdx = (task.currentStep >= 0 && task.currentStep <= 3) ? task.currentStep : 0;
               const stepData = steps[stepIdx] || steps[0];
               let cardStyle = "bg-white border-transparent hover:border-slate-300 dark:bg-slate-900 dark:border-slate-800 dark:hover:border-slate-600 dark:hover:bg-slate-800 shadow-sm dark:shadow-none"; 
               if (selectedTaskId === task.id) cardStyle = "bg-blue-600 border-blue-700 dark:bg-slate-800 dark:border-blue-500 shadow-xl dark:shadow-[0_0_20px_rgba(59,130,246,0.3)] -translate-y-1";
               else if (isMyOrder) cardStyle = "bg-amber-50 border-amber-200 hover:border-amber-300 dark:bg-slate-900 dark:border-amber-500/40 dark:hover:border-amber-500 dark:shadow-[0_0_10px_rgba(245,158,11,0.1)]";
               return (
                <div key={task.id} onClick={() => setSelectedTaskId(task.id)} className={`p-4 rounded-2xl border-2 dark:border cursor-pointer relative group transition-all duration-200 ${cardStyle}`}>
                  {isUnread && <span className="absolute top-4 left-2 w-3 h-3 bg-green-500 dark:bg-lime-500 rounded-full border-2 border-white dark:border-slate-900 dark:shadow-[0_0_10px_#a3e635] animate-pulse"></span>}
                  {renderGauge(stepIdx, task.hasIssue)}
                  <div className="flex justify-between items-start mb-2 mt-2">
                    <h3 className={`text-sm leading-tight pr-6 line-clamp-2 ${selectedTaskId === task.id ? 'text-white font-black' : (isUnread ? 'text-slate-900 dark:text-white font-black' : 'text-slate-800 dark:text-slate-300 font-bold')}`}>{task.topic}</h3>
                    {loggedInUser?.role === 'Admin' && <button onClick={e => deleteTask(task.id, e)} className="text-red-400 hover:text-red-600 dark:text-rose-500 dark:hover:text-rose-400 opacity-0 group-hover:opacity-100 p-1"><Trash2 className="w-4 h-4"/></button>}
                  </div>
                  <div className={`flex items-center gap-3 mt-3 text-[10px] ${selectedTaskId === task.id ? 'text-blue-100 dark:text-blue-200' : 'text-slate-500'}`}>
                    <div className="flex items-center gap-1"><User className="w-3 h-3"/> สั่งโดย: <span className={`font-bold underline ${selectedTaskId === task.id ? 'text-white' : 'text-slate-600 dark:text-slate-300'}`}>{task.requester}</span></div>
                    <div className="flex items-center gap-1"><Users className="w-3 h-3"/> {(task.relatedPersons || []).length} คน</div>
                  </div>
                  <div className={`flex justify-between items-center mt-3 pt-3 border-t ${selectedTaskId === task.id ? 'border-white/20' : 'border-slate-200 dark:border-slate-700/50'}`}>
                    <div className={`text-[10px] font-black uppercase tracking-tight flex items-center gap-1 ${task.hasIssue ? 'text-red-500 dark:text-rose-500 animate-pulse' : (selectedTaskId === task.id ? 'text-white' : stepData.text)}`}>
                        {task.hasIssue ? <AlertTriangle className="w-3.5 h-3.5"/> : stepData.icon} {task.hasIssue ? 'CRITICAL ISSUE!' : stepData.label}
                    </div>
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-md border tracking-wider ${selectedTaskId === task.id ? 'bg-white/20 border-transparent text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-transparent dark:border-slate-700'}`}>🏁 {task.dueDate}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {selectedTask ? (
          <div className="flex-1 flex flex-col bg-slate-50 dark:bg-slate-900 relative transition-colors duration-300">
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-xl z-10 bg-white dark:bg-slate-900/90 backdrop-blur-md transition-colors">
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1 pr-4">
                  <button onClick={() => setSelectedTaskId(null)} className="md:hidden text-blue-600 dark:text-blue-400 font-black text-[10px] flex items-center gap-1 mb-3 uppercase tracking-widest"><ArrowLeft className="w-3 h-3"/> Back</button>
                  <h2 className="text-2xl font-black text-slate-800 dark:text-white tracking-tighter leading-none mb-3 italic uppercase">{selectedTask.topic}</h2>
                  {selectedTask.documentNo && <div className="inline-flex items-center gap-1.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-3 py-1 rounded-md text-xs font-black mb-3 border border-blue-200 dark:border-blue-500/30 tracking-widest"><FileText className="w-3 h-3"/> REF: {selectedTask.documentNo}</div>}
                  {selectedTask.details && <div className="text-sm text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-200 dark:border-slate-800 mb-3 whitespace-pre-wrap shadow-inner">{selectedTask.details}</div>}
                  <div className="flex flex-wrap gap-4 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                    <span className="flex items-center gap-1"><User className="w-3.5 h-3.5 text-blue-500"/> OP: <span className="text-slate-600 dark:text-slate-300">{selectedTask.requester}</span></span>
                    <span className="flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5 text-amber-500"/> TGT: <span className="text-amber-500 dark:text-amber-400">{selectedTask.dueDate}</span></span>
                    <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-emerald-500"/> เริ่ม: <span className="text-emerald-600 dark:text-emerald-400">{selectedTask.createdAt?.toDate ? selectedTask.createdAt.toDate().toLocaleString('th-TH', {dateStyle: 'short', timeStyle: 'short'}) : 'กำลังบันทึก...'}</span></span>
                  </div>
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  {selectedTask.requester === loggedInUser?.name && <button onClick={archiveTask} className="bg-slate-900 dark:bg-lime-600 text-white dark:text-black px-4 py-2.5 rounded-xl text-xs font-black shadow-lg dark:shadow-[0_0_15px_rgba(132,204,22,0.4)] hover:bg-black dark:hover:bg-lime-500 transition-all flex items-center justify-center gap-1.5 uppercase italic"><Flag className="w-3.5 h-3.5"/> FINISH</button>}
                  {selectedTask.hasIssue ? (
                    <button onClick={resolveIssue} disabled={selectedTask.issueReporter === loggedInUser?.name && loggedInUser?.role !== 'Admin'} className="px-4 py-2.5 rounded-xl text-xs font-black border border-emerald-500/50 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 disabled:opacity-30 disabled:hover:bg-transparent uppercase italic flex items-center justify-center gap-1.5 transition-all"><CheckCircle2 className="w-3.5 h-3.5"/> เคลียร์ปัญหาแล้ว</button>
                  ) : (
                    <button onClick={reportIssue} disabled={(selectedTask.currentStep || 0) >= 3} className="px-4 py-2.5 rounded-xl text-xs font-black border border-red-200 dark:border-rose-500/50 text-red-500 dark:text-rose-500 bg-red-50 dark:bg-rose-500/10 hover:bg-red-100 dark:hover:bg-rose-500/20 disabled:opacity-30 uppercase italic flex items-center justify-center gap-1.5 transition-all"><AlertTriangle className="w-3.5 h-3.5"/> PIT STOP</button>
                  )}
                </div>
              </div>
              <div className="space-y-4 pt-2">
                <div>
                   <div className="flex justify-between items-end mb-1"><span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Global Progress</span><span className={`text-xs font-black italic uppercase ${selectedTask.hasIssue ? 'text-red-500 dark:text-rose-500 animate-pulse' : globalStepData.text}`}>{selectedTask.hasIssue ? 'MALFUNCTION' : globalStepData.label}</span></div>
                   {renderGauge(selectedTask.currentStep||0, selectedTask.hasIssue)}
                </div>
                <div className="bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-200 dark:border-slate-800 transition-colors">
                  <div className="flex justify-between items-center mb-3 px-1">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Driver Sync</span>
                    <button onClick={() => setIsAddPersonModalOpen(true)} className="p-1.5 bg-white dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg border border-slate-200 dark:border-blue-500/30 hover:bg-slate-100 dark:hover:bg-blue-800/50 transition-all shadow-sm"><UserPlus className="w-4 h-4"/></button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(selectedTask.relatedPersons || []).map((p: string) => {
                      const pStepIdx = (selectedTask.individualStatus?.[p] >= 0 && selectedTask.individualStatus?.[p] <= 3) ? selectedTask.individualStatus[p] : 0;
                      const pStepData = steps[pStepIdx] || steps[0];
                      const isMe = p === loggedInUser?.name;
                      return (
                        <div key={p} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-black transition-all ${isMe ? 'bg-white dark:bg-slate-800 border-blue-400 dark:border-blue-500 text-slate-800 dark:text-white shadow-md' : 'bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400'}`}>
                          <span>{p}</span>
                          <div className={`flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-black uppercase ${pStepData.color} text-white`}>{pStepData.icon} {pStepData.label}</div>
                          {isMe && pStepIdx < 3 && <button onClick={advanceMyStep} className="bg-blue-600 text-white px-2 py-1 rounded shadow-sm hover:bg-blue-700 dark:hover:bg-blue-500 transition-all uppercase text-[9px] italic ml-1">BOOST ⚡</button>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-5 bg-transparent z-10 transition-colors">
              {(chats[selectedTaskId!] || []).map((c: any) => {
                const isMe = c.sender === loggedInUser?.name;
                return (
                  <div key={c.id} className={`flex flex-col ${c.isSystem ? 'items-center' : (isMe ? 'items-end' : 'items-start')}`}>
                    {c.isSystem ? (
                      <div className="bg-white dark:bg-slate-950/80 px-4 py-2 rounded-md text-[10px] font-black text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800 shadow-sm my-2 text-center whitespace-pre-wrap max-w-[80%] leading-relaxed tracking-widest uppercase italic">{c.text}</div>
                    ) : (
                      <>
                        <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 mb-1 px-2 uppercase tracking-widest">{c.sender} • {c.timestamp?.toDate ? c.timestamp.toDate().toLocaleTimeString('th-TH', {hour:'2-digit', minute:'2-digit'}) : ''}</span>
                        <div className={`p-4 rounded-[1.2rem] text-sm max-w-[85%] shadow-sm ${isMe ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-tl-none text-slate-800 dark:text-slate-200'}`}>
                          {c.fileUrl && <a href={c.fileUrl} target="_blank" rel="noreferrer" className="flex items-center gap-3 mb-3 bg-black/10 dark:bg-black/40 p-3 rounded-lg text-[11px] font-black hover:bg-black/20 dark:hover:bg-black/60 transition-all text-slate-800 dark:text-blue-300"><Package className="w-5 h-5"/> {c.fileName}</a>}
                          {c.text && <span className="whitespace-pre-wrap leading-relaxed font-medium">{c.text}</span>}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            <form onSubmit={handleSendMessage} className="p-4 bg-white dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex flex-col gap-3 z-10 transition-colors">
              {chatFile && <div className="text-[10px] bg-blue-50 dark:bg-slate-900 p-2.5 rounded-lg flex justify-between items-center font-black text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-slate-700 tracking-widest uppercase"><span>📎 FILE: {chatFile.name}</span><button type="button" onClick={()=>setChatFile(null)} className="p-1 hover:bg-blue-200 dark:hover:bg-slate-800 rounded"><X className="w-4 h-4 text-blue-600 dark:text-slate-400"/></button></div>}
              <div className="flex gap-2">
                <label className="p-4 bg-slate-100 dark:bg-slate-900 rounded-xl cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-800 transition-all text-slate-500 dark:text-slate-400 border border-transparent dark:border-slate-800"><Paperclip className="w-5 h-5"/><input type="file" className="hidden" onChange={e => e.target.files && setChatFile(e.target.files[0])}/></label>
                <input type="text" className="flex-1 bg-slate-100 dark:bg-slate-900 border border-transparent dark:border-slate-800 px-5 rounded-xl outline-none font-bold text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:ring-2 focus:ring-blue-500 dark:focus:ring-0 transition-all" placeholder="Transmit message..." value={chatInput} onChange={e => setChatInput(e.target.value)}/>
                <button type="submit" disabled={isUploading} className="p-4 bg-blue-600 text-white rounded-xl shadow-md flex items-center justify-center min-w-[64px] hover:bg-blue-700 dark:hover:bg-blue-500 transition-all">{isUploading ? <Loader2 className="w-5 h-5 animate-spin"/> : <Send className="w-5 h-5"/>}</button>
              </div>
            </form>
          </div>
        ) : (
          <div className="hidden md:flex flex-1 flex-col items-center justify-center text-slate-300 dark:text-slate-800 bg-slate-50 dark:bg-slate-950 relative">
            <Zap className="w-32 h-32 mb-6 opacity-20 dark:opacity-10 text-slate-400 dark:text-slate-800"/>
            <p className="font-black text-3xl text-slate-400 dark:text-slate-800 italic tracking-tighter uppercase">MISSION SELECTION REQUIRED</p>
          </div>
        )}
      </div>

      {/* --- MODALS คิวงานปกติ --- */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-[300]">
          <form onSubmit={handleCreateTask} className="bg-white dark:bg-slate-900 rounded-[2rem] w-full max-w-md p-8 space-y-5 shadow-2xl dark:shadow-[0_0_50px_rgba(0,0,0,0.8)] border-b-8 border-blue-600 dark:border-b-0 dark:border dark:border-slate-700 animate-in zoom-in-95 duration-200 transition-colors">
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-4">
              <h2 className="font-black text-2xl text-slate-800 dark:text-white tracking-tighter italic uppercase">NEW MISSION 🚀</h2>
              <button type="button" onClick={()=>setIsModalOpen(false)} className="bg-slate-100 dark:bg-slate-800 p-2 rounded-lg text-slate-400 hover:text-red-500 dark:hover:text-white transition-all"><X className="w-5 h-5"/></button>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-500 ml-1 uppercase tracking-widest">Topic</label>
              <input type="text" list="topic-list" className="w-full p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none font-black text-blue-700 dark:text-white focus:border-blue-500 transition-all" value={newTask.topic} onChange={e=>setNewTask({...newTask, topic: e.target.value})} autoFocus/>
              <datalist id="topic-list">{allTopics.map((t,i)=><option key={i} value={t}/>)}</datalist>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-amber-500 ml-1 uppercase tracking-widest">Deadline 🏁</label>
                <input type="date" className="w-full p-3.5 bg-amber-50 dark:bg-slate-950 border border-amber-200 dark:border-amber-500/30 rounded-xl outline-none font-bold text-amber-700 dark:text-amber-400" value={newTask.dueDate} onChange={e=>setNewTask({...newTask, dueDate: e.target.value})}/>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-500 ml-1 uppercase tracking-widest">Ref No.</label>
                <input type="text" className="w-full p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none font-bold text-slate-800 dark:text-white" value={newTask.documentNo} onChange={e=>setNewTask({...newTask, documentNo: e.target.value})}/>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-500 ml-1 uppercase tracking-widest">Briefing</label>
              <textarea className="w-full p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none font-bold text-slate-700 dark:text-slate-300 h-24 resize-none" value={newTask.details} onChange={e=>setNewTask({...newTask, details: e.target.value})}/>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-blue-600 dark:text-blue-500 ml-1 uppercase tracking-widest">Select Drivers 👥</label>
              <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto border border-blue-100 dark:border-slate-800 p-3 rounded-xl bg-blue-50/50 dark:bg-slate-950">
                {(settings?.users || []).map((u: string) => (
                  <label key={u} className="flex items-center gap-2 text-xs font-bold p-2 hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-all cursor-pointer text-slate-700 dark:text-slate-300">
                    <input type="checkbox" className="rounded-sm w-4 h-4 border-slate-300 dark:bg-slate-900 dark:border-slate-700 text-blue-600 focus:ring-0" checked={newTask.relatedPersons.includes(u)} onChange={e => { if(e.target.checked) setNewTask({...newTask, relatedPersons:[...newTask.relatedPersons, u]}); else setNewTask({...newTask, relatedPersons: newTask.relatedPersons.filter(n=>n!==u)})}}/> {u}
                  </label>
                ))}
              </div>
            </div>
            <button type="submit" className="w-full bg-blue-600 text-white p-4 rounded-xl font-black text-lg shadow-xl dark:shadow-[0_0_20px_rgba(37,99,235,0.4)] hover:bg-blue-700 dark:hover:bg-blue-500 transition-all uppercase italic tracking-widest mt-2">Engage ⚡</button>
          </form>
        </div>
      )}

      {/* --- 📦 MODAL พิเศษ: แอประบบสร้าง QR CODE (แยกตัว 100%) --- */}
      {isQrModalOpen && (
        <div className="fixed inset-0 z-[400] bg-slate-900/80 dark:bg-black/90 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
          <div className="bg-slate-50 w-full max-w-5xl h-[95vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col relative animate-in zoom-in-95 duration-200">
            <button className="absolute top-4 right-4 z-50 p-2 bg-white rounded-full shadow-md text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all" onClick={() => setIsQrModalOpen(false)}><X className="w-5 h-5"/></button>
            
            <div className="flex-1 overflow-y-auto p-4 sm:p-8 font-sans text-slate-800 custom-scrollbar">
              <div className="max-w-4xl mx-auto space-y-6">
                
                {/* Header QR */}
                <div className="text-center space-y-2 mb-8">
                  <h1 className="text-3xl font-black text-blue-950 uppercase tracking-tight">STP <span className="text-blue-600">QR Billing</span></h1>
                  <p className="text-slate-500 font-bold text-sm uppercase tracking-widest">{qrMerchantName}</p>
                  <div className="text-[10px] text-blue-600 bg-blue-50 py-1.5 px-4 rounded-full inline-block font-black border border-blue-100 tracking-widest uppercase mt-2">🛡️ Single-Use Protocol (ป้องกันจ่ายซ้ำ)</div>
                </div>

                {/* Tabs QR */}
                <div className="flex bg-white rounded-xl shadow-sm border border-slate-200 p-1 mb-6">
                  <button onClick={() => { setQrActiveTab('generator'); setSelectedCustomerBill(null); }} className={`flex-1 py-3 text-sm font-black uppercase tracking-widest rounded-lg transition-all ${qrActiveTab === 'generator' && !selectedCustomerBill ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}>ออกบิล (Generator)</button>
                  <button onClick={() => { setQrActiveTab('history'); setSelectedCustomerBill(null); }} className={`flex-1 py-3 text-sm font-black uppercase tracking-widest rounded-lg transition-all flex items-center justify-center gap-2 ${qrActiveTab === 'history' && !selectedCustomerBill ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}>
                    สถานะบิล <span className="bg-red-500 text-white px-2 py-0.5 rounded-full text-[10px]">{historyLogs.filter(l => l.status === 'PENDING').length}</span>
                  </button>
                </div>

                {/* Body QR */}
                {selectedCustomerBill ? (
                    <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200 max-w-md mx-auto animate-in fade-in zoom-in-95">
                      <div className="bg-blue-950 text-white p-5 text-center relative">
                        <button onClick={() => setSelectedCustomerBill(null)} className="absolute left-4 top-5 text-blue-200 hover:text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-1"><ArrowLeft className="w-3 h-3"/> BACK</button>
                        <h2 className="text-lg font-black uppercase tracking-widest">ระบบตรวจสอบบิล</h2>
                        <p className="text-[10px] text-blue-300 font-bold uppercase tracking-widest mt-1">{qrMerchantName}</p>
                      </div>
                      <div className="p-6 space-y-5 text-center">
                        <div className="bg-slate-50 p-4 rounded-xl text-left text-sm border border-slate-200 space-y-2">
                          <div className="flex justify-between"><span className="text-slate-500 font-bold">REF:</span><span className="font-mono font-black text-blue-600">{selectedCustomerBill.refNo}</span></div>
                          <div className="flex justify-between"><span className="text-slate-500 font-bold">บัญชี:</span><span className="font-bold text-slate-800">{selectedCustomerBill.bankName}</span></div>
                        </div>
                        <div><p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">ยอดเงินที่ต้องชำระ</p><p className="text-4xl font-black text-blue-600 mt-1">฿{selectedCustomerBill.amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</p></div>
                        <div className="py-4 flex justify-center">
                          {selectedCustomerBill.status === 'PAID' ? (
                            <div className="bg-green-50 border-2 border-green-500 rounded-2xl p-6 w-full space-y-3 shadow-inner">
                              <p className="text-xl font-black text-green-700 uppercase tracking-tight">ชำระเงินสำเร็จ</p>
                              <p className="text-[10px] font-bold text-green-600 uppercase tracking-widest">🔒 ล็อกระบบป้องกันการโอนซ้ำ</p>
                            </div>
                          ) : (
                            <div className="space-y-3 w-full">
                              <div className="p-4 bg-white border-2 border-blue-100 rounded-2xl shadow-sm inline-block"><img src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(selectedCustomerBill.qrPayload)}`} alt="QR" className="w-52 h-52"/></div>
                              <button onClick={() => handleSimulatePayment(selectedCustomerBill.id)} className="w-full py-3 bg-emerald-600 text-white rounded-xl text-xs font-black hover:bg-emerald-700 uppercase tracking-widest shadow-md flex items-center justify-center gap-1"><Zap className="w-4 h-4"/> จำลองการโอนสำเร็จ</button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                ) : qrActiveTab === 'generator' ? (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-4">
                    <div className="space-y-6">
                      <div className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-slate-200">
                        <h3 className="font-black text-blue-900 mb-4 uppercase tracking-widest flex items-center gap-2"><CheckCircle2 className="w-5 h-5"/> บัญชีรับเงิน</h3>
                        <div className="space-y-3">
                          <label className="flex items-center gap-3 p-4 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors">
                            <input type="radio" checked={!isCustomBank} onChange={() => setIsCustomBank(false)} className="text-blue-600 w-4 h-4"/>
                            <div className="text-sm"><p className="font-black text-slate-800">{MAIN_ACCOUNT.label}</p><p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mt-1">ACC: {MAIN_ACCOUNT.accountNo}</p></div>
                          </label>
                          <label className="flex items-center gap-3 p-4 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors">
                            <input type="radio" checked={isCustomBank} onChange={() => setIsCustomBank(true)} className="text-blue-600 w-4 h-4"/>
                            <span className="text-sm font-black text-slate-800">กำหนดเอง...</span>
                          </label>
                          {isCustomBank && (
                            <div className="space-y-2 pt-2 animate-in fade-in">
                              <input type="text" placeholder="PromptPay ID (10 หรือ 13 หลัก)" className="w-full p-3 text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-bold" value={customBank.promptpay} onChange={e=>setCustomBank({...customBank, promptpay: e.target.value})} />
                              <input type="text" placeholder="ชื่อธนาคาร" className="w-full p-3 text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-bold" value={customBank.bankName} onChange={e=>setCustomBank({...customBank, bankName: e.target.value})} />
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-slate-200">
                        <h3 className="font-black text-amber-600 mb-4 uppercase tracking-widest flex items-center gap-2"><Clock className="w-5 h-5"/> หมดอายุ (ทุกบิลในล็อตนี้)</h3>
                        <div className="grid grid-cols-2 gap-3">
                          <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} className="w-full p-3 text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-amber-500 font-bold text-slate-700" />
                          <input type="time" value={expiryTime} onChange={(e) => setExpiryTime(e.target.value)} className="w-full p-3 text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-amber-500 font-bold text-slate-700" />
                        </div>
                      </div>
                    </div>
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col h-[500px] lg:h-auto">
                      <div className="p-4 sm:p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-2xl">
                        <h3 className="font-black text-slate-800 uppercase tracking-widest">คิวงาน ({batchFiles.length})</h3>
                        <div className="flex gap-2">
                          <button onClick={handleManualAdd} className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-sm transition-all">+ สร้างรูปอย่างเดียว</button>
                          <label className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer shadow-sm transition-all">+ ประทับตราลง PDF<input type="file" multiple accept=".pdf" onChange={handleFileUpload} className="hidden" /></label>
                        </div>
                      </div>
                      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50">
                        {batchFiles.map((item) => (
                          <div key={item.id} className={`bg-white p-4 rounded-xl shadow-sm border ${item.file ? 'border-blue-100' : 'border-emerald-100'} relative group transition-colors`}>
                            <div className="flex justify-between items-center mb-3 pb-2 border-b border-slate-50">
                              <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md ${item.file ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'}`}>{item.file ? '📄 PDF Document' : '🖼️ Image Only (รูปตรายาง)'}</span>
                              <button onClick={() => removeBatchItem(item.id)} className="text-red-400 hover:text-red-600 opacity-50 group-hover:opacity-100 transition-opacity"><X className="w-4 h-4"/></button>
                            </div>
                            <div className="pr-6 space-y-3">
                              <div>
                                <label className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Ref No.</label>
                                <input type="text" value={item.refNo} onChange={(e)=>updateBatchItem(item.id, 'refNo', e.target.value)} className="w-full font-mono text-sm font-black text-slate-800 bg-transparent border-b border-slate-200 outline-none pb-1 focus:border-blue-500" placeholder="Ref No."/>
                              </div>
                              <div>
                                <label className="text-[10px] text-slate-400 font-black uppercase tracking-widest">ยอดเงิน (บาท)</label>
                                <input type="number" value={item.amount} onChange={(e)=>updateBatchItem(item.id, 'amount', e.target.value)} className="w-full text-right font-black text-xl text-slate-800 bg-transparent border-b border-slate-200 outline-none pb-1 focus:border-blue-500" placeholder="0.00"/>
                              </div>
                              {item.error && <p className="text-[10px] text-red-600 font-black tracking-wide bg-red-50 p-2 rounded-lg border border-red-100">{item.error}</p>}
                            </div>
                          </div>
                        ))}
                        {batchFiles.length === 0 && <div className="text-center py-20 text-slate-400 font-black uppercase tracking-widest text-[10px]">No documents in queue</div>}
                      </div>
                      <div className="p-4 sm:p-5 bg-white border-t border-slate-100 rounded-b-2xl">
                        <button onClick={processQrBatchFiles} disabled={isQrProcessing || batchFiles.length===0 || !loggedInUser} className="w-full py-4 text-white text-sm font-black rounded-xl uppercase tracking-widest transition-all bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed shadow-md">
                          {!loggedInUser ? 'CONNECTING...' : isQrProcessing ? 'PROCESSING...' : `ENGAGE & DOWNLOAD ZIP`}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-bottom-4">
                    <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row justify-between sm:items-center bg-slate-50 gap-3">
                      <div>
                        <h3 className="font-black text-slate-800 uppercase tracking-widest text-sm">HISTORY & CONTROL</h3>
                        <p className="text-[10px] font-bold text-slate-400 tracking-widest uppercase mt-1">ทั้งหมด {historyLogs.length} รายการ</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setShowOnlyPending(!showOnlyPending)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border ${showOnlyPending ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
                          <Filter className="w-3 h-3"/> {showOnlyPending ? 'โชว์เฉพาะยอดค้าง' : 'โชว์ทั้งหมด'}
                        </button>
                        <button onClick={exportToCSV} className="text-[10px] bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 px-3 py-1.5 rounded-lg font-black uppercase tracking-widest transition-all">Export CSV</button>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="text-[10px] uppercase bg-slate-50 font-black text-slate-500 tracking-widest border-b border-slate-200">
                          <tr>
                            <th className="px-4 py-3 w-16 text-center">#</th>
                            <th className="px-4 py-3">Ref No</th>
                            <th className="px-4 py-3 text-right">Amount</th>
                            <th className="px-4 py-3 text-center">Status</th>
                            <th className="px-4 py-3 text-center">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {displayedLogs.map((log, index) => (
                            <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                              <td className="px-4 py-4 text-center text-[10px] font-black text-slate-400">{index + 1}</td>
                              <td className="px-4 py-4 font-mono font-black text-blue-600">{log.refNo}</td>
                              <td className="px-4 py-4 text-right font-black text-slate-800">{(log.amount || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
                              <td className="px-4 py-4 text-center">
                                {log.status === 'PAID' ? <span className="px-3 py-1 text-[10px] font-black text-green-700 bg-green-50 border border-green-200 rounded-full tracking-widest uppercase">🔒 PAID</span> : <span className="px-3 py-1 text-[10px] font-black text-amber-700 bg-amber-50 border border-amber-200 rounded-full tracking-widest uppercase animate-pulse">⏳ PENDING</span>}
                              </td>
                              <td className="px-4 py-4 text-center space-x-2">
                                <button onClick={() => setSelectedCustomerBill(log)} className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-black uppercase hover:bg-slate-200 tracking-widest border border-slate-200">👁️ VIEW</button>
                                {log.status !== 'PAID' && <button onClick={() => handleSimulatePayment(log.id)} className="px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-[10px] font-black uppercase hover:bg-emerald-100 tracking-widest">⚡ PAID</button>}
                              </td>
                            </tr>
                          ))}
                          {displayedLogs.length === 0 && <tr><td colSpan={5} className="text-center py-10 text-[10px] font-black text-slate-400 uppercase tracking-widest">No Documents Found</td></tr>}
                        </tbody>
                      </table>
                    </div>
                    {filteredLogs.length > displayLimit && (
                      <div className="p-4 bg-slate-50 border-t border-slate-100 text-center">
                        <button onClick={() => setDisplayLimit(prev => prev + 20)} className="px-6 py-2 bg-white border border-slate-200 text-slate-600 rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-slate-100 transition-all shadow-sm">
                          โหลดเพิ่มเติม (เหลืออีก {filteredLogs.length - displayLimit} รายการ)
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- แจ้งเตือน Notification ซ้อนทับให้โผล่มาหน้าสุดเสมอ --- */}
      {toastMsg && <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-slate-900 dark:bg-blue-600 text-white px-8 py-4 rounded-xl font-black text-xs shadow-2xl dark:shadow-[0_0_30px_rgba(37,99,235,0.6)] z-[500] animate-in slide-in-from-bottom-10 flex items-center gap-3 tracking-widest italic uppercase"><Zap className="w-4 h-4 text-white"/> {toastMsg}</div>}
      {isAddPersonModalOpen && <div className="fixed inset-0 bg-slate-900/60 dark:bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-[100]"></div>}
    </div>
  );
}