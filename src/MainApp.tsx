import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, query, orderBy, deleteDoc, setDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from './firebase'; 
import { 
  Search, CheckCircle2, Clock, 
  Paperclip, Send, AlertTriangle, ArrowLeft,
  MessageSquare, User, Plus, Loader2, LogOut, X, Package, CalendarDays, Trash2, Users, UserPlus, FileText, Filter,
  Settings, Flag, Zap, Sun, Moon, QrCode, FileSearch, Reply, CheckCheck, Flame, Shield, Globe
} from 'lucide-react';
import QRMaker from './QRMaker'; 
import BillingMatcher from './BillingMatcher';
import CustomerPortal from './CustomerPortal'; 

const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbxzakXzIAqfrSeStPJRRx0dl75R9gXif64LWdpYT1BcfQXujLXh3FDjWbCFxirPylot/exec';

const checkOverdue = (dueDateStr: string) => {
  if (!dueDateStr) return false;
  const due = new Date(dueDateStr);
  due.setHours(23, 59, 59, 999);
  return new Date() > due;
};

const checkBottleneck = (individualStatus: any) => {
  const vals = Object.values(individualStatus || {}) as number[];
  if (vals.length < 2) return false;
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  return max >= 2 && min <= 1 && (max - min >= 2);
};

export default function MainApp() {
  const [loggedInUser, setLoggedInUser] = useState<any>(null);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [isDarkMode, setIsDarkMode] = useState(false);

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
  
  const [replyingTo, setReplyingTo] = useState<any>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false); 
  const [isAddPersonModalOpen, setIsAddPersonModalOpen] = useState(false); 
  const [isQrModalOpen, setIsQrModalOpen] = useState(false); 
  const [isBillingMatcherOpen, setIsBillingMatcherOpen] = useState(false); 
  
  const [confirmModal, setConfirmModal] = useState<{isOpen: boolean, title: string, text: string, type: 'danger' | 'warning' | 'info', onConfirm: () => void}>({ 
    isOpen: false, title: '', text: '', type: 'info', onConfirm: () => {} 
  });
  
  const [settings, setSettings] = useState<any>({ users: [], usersData: [], topicMapping: {} });
  
  // 🟢 เพิ่มตัวแปร customerName เข้าไปใน State ของการสร้างงาน
  const [newTask, setNewTask] = useState({ topic: '', documentNo: '', details: '', relatedPersons: [] as string[], dueDate: '', taskType: 'Internal', customerName: '' });

  const steps = [
    { label: 'รอรับงาน', icon: <Clock className="w-3.5 h-3.5" />, color: 'bg-slate-400 dark:bg-slate-600 dark:shadow-[0_0_5px_#475569]', text: 'text-slate-500 dark:text-slate-400' },
    { label: 'รับเรื่องแล้ว', icon: <User className="w-3.5 h-3.5" />, color: 'bg-sky-500 dark:bg-cyan-500 dark:shadow-[0_0_10px_#06b6d4]', text: 'text-sky-600 dark:text-cyan-400' },
    { label: 'กำลังดำเนินการ', icon: <Settings className="w-3.5 h-3.5 animate-spin" />, color: 'bg-amber-500 dark:shadow-[0_0_10px_#f59e0b]', text: 'text-amber-600 dark:text-amber-400' },
    { label: 'เสร็จสิ้น', icon: <Flag className="w-3.5 h-3.5" />, color: 'bg-green-500 dark:bg-lime-500 dark:shadow-[0_0_12px_#84cc16]', text: 'text-green-600 dark:text-lime-400' }
  ];

  const allTopics = Object.values(settings?.topicMapping || {}).flat() as string[];
  const showToast = (msg: string) => { setToastMsg(msg); setTimeout(() => setToastMsg(''), 4000); };

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

  useEffect(() => {
    if (selectedTaskId && loggedInUser?.name) { updateDoc(doc(db, 'tasks', selectedTaskId), { unreadBy: arrayRemove(loggedInUser.name) }).catch(() => {}); }
  }, [selectedTaskId, loggedInUser]);

  useEffect(() => {
    const fetchMasterData = async () => {
      try { 
        const res = await fetch(WEB_APP_URL); 
        const data = await res.json(); 
        if (data && data.settings) {
          setSettings({ 
            users: data.settings.users || [], 
            usersData: data.settings.usersData || [], 
            topicMapping: data.settings.topicMapping || {}
          }); 
        } 
      } 
      catch (e) { setSettings({ users: ['อภิสิทธิ์', 'แอดมิน'], usersData: [], topicMapping: {} }); }
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
    
    let finalRelatedPersons = newTask.relatedPersons;
    let finalTaskType = newTask.taskType;

    if (loggedInUser?.role === 'customer') {
       finalRelatedPersons = ['ออม', 'คนึงคนสวย', 'พริ้มพลอย'];
       finalTaskType = 'External';
    }

    // 🟢 ตรวจสอบว่าถ้าเป็นงาน External แอดมินต้องระบุชื่อลูกค้า
    if (finalTaskType === 'External' && !newTask.customerName && loggedInUser?.role !== 'customer') {
        return showToast('⚠️ กรุณาระบุชื่อลูกค้าสำหรับออเดอร์นี้');
    }

    if (!newTask.topic || finalRelatedPersons.length === 0 || !newTask.dueDate) return showToast('กรุณากรอกข้อมูลให้ครบถ้วน');
    setIsLoading(true);
    try {
      const individualStatus: any = {}; 
      finalRelatedPersons.forEach((p: string) => { individualStatus[p] = 0; });
      
      const docRef = await addDoc(collection(db, 'tasks'), { 
        ...newTask, 
        taskType: finalTaskType, 
        customerName: finalTaskType === 'External' ? newTask.customerName : null, // 🟢 ส่งชื่อลูกค้าเข้า Firebase
        relatedPersons: finalRelatedPersons, 
        requester: loggedInUser.name, 
        individualStatus, 
        unreadBy: [...finalRelatedPersons].filter(p => p !== loggedInUser.name), 
        currentStep: 0, hasIssue: false, issueReporter: null, isArchived: false, createdAt: serverTimestamp(), lastActivity: serverTimestamp() 
      });
      await addDoc(collection(db, 'tasks', docRef.id, 'chats'), { sender: 'System', text: `🆕 ภารกิจใหม่: ${newTask.topic}\n🔖 ประเภท: ${finalTaskType === 'Internal' ? 'งานภายในบริษัท' : `งานลูกค้า (${newTask.customerName})`}\n📝 ข้อมูล: ${newTask.details || '-'}`, timestamp: serverTimestamp(), isSystem: true });
      showToast('✅ สตาร์ทภารกิจสำเร็จ!'); 
      setIsModalOpen(false); 
      // 🟢 ล้างค่า customerName คืนสู่ความว่างเปล่า
      setNewTask({ topic: '', documentNo: '', details: '', relatedPersons: [], dueDate: '', taskType: 'Internal', customerName: '' });
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
      const txt = chatInput; 
      
      const newChatData: any = { sender: loggedInUser.name, text: txt, fileUrl, fileName, timestamp: serverTimestamp(), isSystem: false };
      if (replyingTo) { newChatData.replyTo = { id: replyingTo.id, sender: replyingTo.sender, text: replyingTo.text, fileUrl: replyingTo.fileUrl }; }

      await addDoc(collection(db, 'tasks', selectedTaskId, 'chats'), newChatData);
      
      setChatInput(''); setChatFile(null); setReplyingTo(null);
      const unreadList = [...(selectedTask?.relatedPersons || []), selectedTask?.requester].filter(p => p && p !== loggedInUser.name);
      updateDoc(doc(db, 'tasks', selectedTaskId), { lastActivity: serverTimestamp(), unreadBy: arrayUnion(...unreadList) }).catch(()=>{});
    } catch(err) { showToast('❌ ส่งข้อมูลล้มเหลว'); }
    setIsUploading(false);
  };

  const handleDeleteChat = async (chatId: string) => {
    if (!selectedTaskId) return;
    if (window.confirm("คุณต้องการลบข้อความนี้หรือไม่?")) {
      try { await deleteDoc(doc(db, 'tasks', selectedTaskId, 'chats', chatId)); } catch(err) { showToast('❌ ลบข้อความล้มเหลว'); }
    }
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
      await addDoc(collection(db, 'tasks', selectedTaskId, 'chats'), { sender: 'System', text: `✅ ${loggedInUser.name} แจ้งแก้ไขปัญหาเรียบร้อยแล้ว!`, timestamp: serverTimestamp(), isSystem: true });
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

  const removePersonFromTask = async (pName: string) => {
    if (!selectedTask || !selectedTaskId) return;
    if (loggedInUser?.role !== 'admin' && loggedInUser?.name !== selectedTask.requester) {
      return showToast('❌ คุณไม่มีสิทธิ์นำผู้ใช้อื่นออกจากงาน');
    }
    if (window.confirm(`ยืนยันการนำ "${pName}" ออกจากงานนี้?`)) {
      const newRelated = (selectedTask.relatedPersons || []).filter((p: string) => p !== pName);
      const newInd = { ...selectedTask.individualStatus };
      delete newInd[pName]; 
      try {
        await updateDoc(doc(db, 'tasks', selectedTaskId), { relatedPersons: newRelated, individualStatus: newInd, lastActivity: serverTimestamp() });
        await addDoc(collection(db, 'tasks', selectedTaskId, 'chats'), { sender: 'System', text: `➖ ${loggedInUser.name} ได้นำ "${pName}" ออกจากภารกิจ`, timestamp: serverTimestamp(), isSystem: true });
        showToast(`✅ นำ ${pName} ออกเรียบร้อย`);
      } catch(e) { showToast('❌ เกิดข้อผิดพลาด'); }
    }
  };

  const archiveTask = async () => {
    if (!selectedTask || !selectedTaskId) return;
    setConfirmModal({ isOpen: true, title: 'เข้าเส้นชัย (ปิดจ๊อบ)', text: 'ยืนยันปิดงานนี้และส่งเข้าคลังประวัติ?', type: 'info', onConfirm: async () => {
      try { await updateDoc(doc(db, 'tasks', selectedTaskId), { isArchived: true, lastActivity: serverTimestamp() }); setSelectedTaskId(null); } catch(e) {}
    }});
  };

  const deleteTask = async (tId: string, e: any) => {
    e.stopPropagation(); if (loggedInUser?.role !== 'admin') return showToast('❌ สิทธิ์เข้าถึงถูกปฏิเสธ');
    setConfirmModal({ isOpen: true, title: 'ลบข้อมูลถาวร', text: '🚨 ลบข้อมูลภารกิจนี้ทิ้งถาวร ยืนยันหรือไม่?', type: 'danger', onConfirm: async () => {
      try { await deleteDoc(doc(db, 'tasks', tId)); if (selectedTaskId === tId) setSelectedTaskId(null); } catch(e) {}
    }});
  };

  const formatFullDateTime = (timestamp: any) => {
    if (!timestamp?.toDate) return 'กำลังส่ง...';
    return timestamp.toDate().toLocaleString('th-TH', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  const isImageFile = (fileName: string) => fileName?.match(/\.(jpeg|jpg|gif|png|webp)$/i) != null;

  const renderMessageTextWithMentions = (text: string) => {
    if (!text) return null;
    const parts = text.split(/(@\S+)/g);
    return parts.map((part, i) => part.startsWith('@') ? <span key={i} className="text-amber-400 dark:text-blue-300 font-black">{part}</span> : part);
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

  const renderAvatarProgress = (task: any, isSelected: boolean) => {
    const persons = task.relatedPersons || [];
    if (persons.length === 0) return null;

    const isTaskOverdue = checkOverdue(task.dueDate);
    const isTaskBottleneck = checkBottleneck(task.individualStatus);
    const minStep = Math.min(...(Object.values(task.individualStatus || {0:0}) as number[]));

    return (
      <div className="mt-4 mb-2">
        <div className="flex justify-between items-end mb-2 px-0.5">
          <span className={`text-[9px] font-black uppercase tracking-widest ${isSelected ? 'text-blue-200' : 'text-slate-400'}`}>Driver Sync</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {persons.map((p: string, idx: number) => {
            const step = task.individualStatus?.[p] || 0;
            const isMe = p === loggedInUser?.name;
            const shortName = p.substring(0, 3).toUpperCase();
            
            let bgColor = 'bg-slate-400 dark:bg-slate-600'; 
            if (step === 1) bgColor = 'bg-sky-500';
            if (step === 2) bgColor = 'bg-amber-500';
            if (step === 3) bgColor = 'bg-green-500';

            let ringEffect = ''; let animation = ''; let borderColor = 'border-white/20 dark:border-black/20';

            if (task.hasIssue && task.issueReporter === p) {
                bgColor = 'bg-red-600'; animation = 'animate-pulse'; ringEffect = 'ring-2 ring-red-400 ring-offset-1 dark:ring-offset-slate-900 shadow-[0_0_8px_red]';
            } else if (isTaskOverdue && step < 3) {
                bgColor = 'bg-rose-600'; animation = 'animate-pulse'; ringEffect = 'ring-1 ring-rose-400 ring-offset-1 dark:ring-offset-slate-900 shadow-[0_0_5px_#e11d48]';
            } else if (isTaskBottleneck && step === minStep && step < 3) {
                ringEffect = 'ring-2 ring-orange-400 ring-offset-1 dark:ring-offset-slate-900 shadow-[0_0_8px_#fb923c]';
            }

            if (isMe) { ringEffect += ' ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-slate-800 scale-110 z-10'; borderColor = 'border-blue-200 dark:border-blue-400'; }

            return (
              <div key={idx} title={`${p} - ${steps[step]?.label || ''}`} className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black text-white ${bgColor} ${animation} ${ringEffect} transition-all duration-300 border ${borderColor} cursor-help`}>
                {shortName}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderFilterChip = (label: string, val: string, defaultStyle = "bg-white text-slate-600 border-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700", activeStyle = "bg-blue-600 text-white border-blue-600 shadow-md") => {
    const isActive = filterStatus === val;
    return (
      <button onClick={() => setFilterStatus(val)} className={`px-3 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-tight transition-all ${isActive ? activeStyle : defaultStyle + ' hover:border-slate-400'}`}>
        {label}
      </button>
    );
  };

  // 🟢 ฟังก์ชันสำหรับดึงชื่อคนที่เป็นพนักงานมาแสดงให้เลือกทำงาน
  const getAvailableUsers = (forTaskType: string) => {
    if (settings?.usersData && settings.usersData.length > 0) {
      return settings.usersData.filter((u: any) => {
        if (u.role === 'customer') return false; // ซ่อนลูกค้าไม่ให้มาอยู่ในช่องเลือกคนทำงาน
        return true;
      }).map((u: any) => u.name);
    }
    return settings?.users || [];
  };

  // 🟢 ฟังก์ชันสำหรับดึงเฉพาะคนที่เป็น "ลูกค้า" มาแสดงใน Dropdown
  const getCustomersList = () => {
    if (settings?.usersData && settings.usersData.length > 0) {
      return settings.usersData.filter((u: any) => u.role === 'customer').map((u: any) => u.name);
    }
    return [];
  };
// 🟢 ฟังก์ชันอัปโหลดเอกสาร (รองรับหลายไฟล์พร้อมกัน)
const [isUploadingDoc, setIsUploadingDoc] = useState(false);

const handleUploadOfficialDoc = async (e: any) => {
  const files = e.target.files;
  if (!files || files.length === 0 || !selectedTaskId) return;
  setIsUploadingDoc(true);
  
  try {
    const newDocs: any[] = [];
    // วนลูปอัปโหลดทีละไฟล์
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileRef = ref(storage, `official_docs/${selectedTaskId}/${Date.now()}_${file.name}`);
      await uploadBytes(fileRef, file);
      const fileUrl = await getDownloadURL(fileRef);
      newDocs.push({ url: fileUrl, name: file.name, uploadedAt: new Date().toISOString() });
    }
    
    // อัปเดตเข้าไปในฐานข้อมูลแบบ Array (เพิ่มต่อท้ายของเดิม)
    await updateDoc(doc(db, 'tasks', selectedTaskId), { 
      officialDocs: arrayUnion(...newDocs), 
      lastActivity: serverTimestamp() 
    });
    
    await addDoc(collection(db, 'tasks', selectedTaskId, 'chats'), { 
      sender: 'System', 
      text: `📄 ${loggedInUser?.name} อัปโหลดเอกสารลูกค้าเพิ่ม ${files.length} ไฟล์`, 
      timestamp: serverTimestamp(), isSystem: true 
    });
    
    showToast('✅ อัปโหลดเอกสารสำเร็จ!');
  } catch(err) {
    showToast('❌ อัปโหลดเอกสารไม่สำเร็จ');
  }
  setIsUploadingDoc(false);
};

// 🔴 ฟังก์ชันสำหรับลบไฟล์ที่อัปโหลดผิด
const handleDeleteOfficialDoc = async (docToRemove: any) => {
  if (!selectedTaskId) return;
  if (window.confirm(`ต้องการลบไฟล์ "${docToRemove.name}" ใช่หรือไม่?`)) {
    try {
      await updateDoc(doc(db, 'tasks', selectedTaskId), {
        officialDocs: arrayRemove(docToRemove),
        lastActivity: serverTimestamp()
      });
      showToast('🗑️ ลบไฟล์เรียบร้อย');
    } catch (err) {
      showToast('❌ ลบไฟล์ไม่สำเร็จ');
    }
  }
};

  const processedTasks = tasks.filter(t => {
    if (t.isArchived) return false;
    if (t.taskType === 'Internal' && loggedInUser?.role === 'customer') return false;

    const isRelated = (t.relatedPersons || []).includes(loggedInUser?.name) || t.requester === loggedInUser?.name || loggedInUser?.role === 'admin';
    if (!isRelated) return false; 
    
    const safeTopic = (t.topic || '').toString().toLowerCase(); 
    const safeDocNo = (t.documentNo || '').toString().toLowerCase(); 
    const q = searchQuery.toLowerCase();
    if (searchQuery && !(safeTopic.includes(q) || safeDocNo.includes(q))) return false;
    
    if (filterRequester !== 'All' && t.requester !== filterRequester) return false;
    if (filterPerson !== 'All' && !(t.relatedPersons || []).includes(filterPerson)) return false;
    
    if (filterStatus !== 'All') {
        const step = t.currentStep || 0;
        if (filterStatus === 'Issue' && !t.hasIssue) return false;
        if (filterStatus === 'Overdue') { if (!(checkOverdue(t.dueDate) && step < 3)) return false; }
        if (filterStatus === 'Bottleneck') { if (!(checkBottleneck(t.individualStatus) && step < 3)) return false; }
        if (['0', '1', '2', '3'].includes(filterStatus) && step.toString() !== filterStatus) return false;
    }
    return true;
  }).sort((a, b) => sortBy === 'status' ? (a.currentStep || 0) - (b.currentStep || 0) : 0);

    // 🟢 ถ้าเป็นลูกค้า ให้แสดงหน้า Customer Portal ทันที
    if (loggedInUser?.role === 'customer') {
      return (
        <CustomerPortal 
          loggedInUser={loggedInUser} 
          onLogout={() => {
            localStorage.removeItem('stp_user_session');
            window.location.reload();
          }} 
        />
      );
    }
  if (!loggedInUser) return (
    <div className="min-h-screen bg-slate-200 dark:bg-slate-950 flex items-center justify-center p-4 font-sans transition-colors duration-300 dark:bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]">
      <div className="bg-white dark:bg-slate-900 rounded-[2rem] p-8 w-full max-w-sm shadow-2xl border-b-8 border-blue-600 dark:border dark:border-blue-500/30 transition-all duration-300">
        <h1 className="text-3xl font-black text-blue-900 dark:text-white mb-1 text-center tracking-tighter italic uppercase">STP <span className="dark:text-blue-500">Ltd.</span></h1>
        <p className="text-center text-slate-400 text-[10px] font-black mb-8 uppercase tracking-widest italic">Sangthai Panich Workflow</p>
        <form onSubmit={handleLogin} className="space-y-5">
          <input type="text" placeholder="Username" className="w-full p-4 bg-slate-100 dark:bg-slate-950 border-transparent rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 font-bold" value={loginForm.username} onChange={e => setLoginForm({...loginForm, username: e.target.value})} />
          <input type="password" placeholder="Password" className="w-full p-4 bg-slate-100 dark:bg-slate-950 border-transparent rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 font-bold" value={loginForm.password} onChange={e => setLoginForm({...loginForm, password: e.target.value})} />
          <button type="submit" disabled={isLoading} className="w-full bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-2xl font-black text-lg shadow-xl uppercase italic">START MISSION 🏎️</button>
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
            <div className="bg-blue-600 p-2 rounded-xl"><Zap className="w-5 h-5 text-white"/></div>
            <div>
              <h1 className="font-black italic tracking-tighter text-2xl leading-none uppercase">STP <span className="text-blue-500">Ltd. LIVE</span></h1>
              <span className="text-[9px] font-bold text-slate-400 tracking-widest uppercase">Sangthai Panich (1992)</span>
            </div>
        </div>
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="text-right hidden sm:block">
            <div className="text-[10px] font-black uppercase text-blue-400 tracking-widest">{loggedInUser?.role || 'User'}</div>
            <div className="text-sm font-bold text-white">{loggedInUser?.name || ''}</div>
          </div>
          
          {loggedInUser?.role !== 'customer' && (
            <>
              <button onClick={() => setIsBillingMatcherOpen(true)} className="bg-indigo-600 border border-indigo-500 p-2.5 rounded-xl transition-all text-white shadow-md hover:bg-indigo-500 group relative">
                <FileSearch className="w-5 h-5"/>
                <span className="absolute -bottom-6 right-0 bg-black/80 text-white text-[9px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap">Billing Matcher</span>
              </button>
              <button onClick={() => setIsQrModalOpen(true)} className="bg-blue-600 border border-blue-500 p-2.5 rounded-xl transition-all text-white shadow-md hover:bg-blue-500 group relative">
                <QrCode className="w-5 h-5"/>
                <span className="absolute -bottom-6 right-0 bg-black/80 text-white text-[9px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap">QR Maker</span>
              </button>
            </>
          )}

          <button onClick={toggleTheme} className="bg-white/10 p-2.5 rounded-xl transition-all text-amber-300 dark:text-blue-400">
            {isDarkMode ? <Sun className="w-5 h-5"/> : <Moon className="w-5 h-5"/>}
          </button>
          <button onClick={handleLogout} className="bg-white/10 p-2.5 rounded-xl hover:bg-red-500 transition-all text-white"><LogOut className="w-5 h-5"/></button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <div className={`w-full md:w-1/3 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col transition-colors ${selectedTaskId ? 'hidden md:flex' : 'flex'}`}>
          <div className="bg-slate-800 dark:bg-black text-white p-2.5 flex overflow-x-auto gap-3 items-center shrink-0 border-b border-slate-700">
            <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-2 shrink-0">DRIVER STATUS:</div>
            {(settings?.users || []).map((u: string) => {
              const isOnline = userPresence[u]?.isOnline;
              return (
                <div key={u} className={`flex items-center gap-1.5 shrink-0 px-3 py-1 rounded-full border transition-all ${isOnline ? 'bg-green-500/10 border-green-500/50' : 'bg-transparent border-slate-500 opacity-60'}`}>
                  <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-400 shadow-sm' : 'bg-slate-500'}`}></span>
                  <span className={`text-[10px] font-bold uppercase tracking-tight ${isOnline ? 'text-white' : 'text-slate-300'}`}>{u}</span>
                </div>
              );
            })}
          </div>
          <div className="p-4 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 space-y-4 shrink-0">
            <div className="flex justify-between items-center">
              <h2 className="font-black text-slate-800 dark:text-white text-lg tracking-tight italic uppercase">Missions ({processedTasks.length})</h2>
              <button onClick={() => setIsModalOpen(true)} className="bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 shadow-lg shadow-blue-500/30 hover:bg-blue-700 transition-all uppercase italic"><Plus className="w-4 h-4"/> สั่งงาน</button>
            </div>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input type="text" placeholder="ค้นหาภารกิจ / บิล..." className="w-full pl-11 pr-4 py-3 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 transition-all" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            </div>
            
            <div>
              <div className="flex gap-2">
                <button 
                  onClick={() => setShowFilters(!showFilters)} 
                  className={`flex-1 text-[10px] font-black uppercase flex items-center justify-center gap-2 py-2 rounded-lg border transition-all ${showFilters || filterStatus !== 'All' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 border-blue-200' : 'bg-white dark:bg-slate-950 border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                >
                  <Filter className="w-3 h-3"/> Filter {filterStatus !== 'All' && '(1)'}
                </button>
                <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="flex-1 text-[10px] font-black uppercase bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-lg px-2 outline-none cursor-pointer">
                  <option value="latest">Sort: ล่าสุด</option>
                  <option value="status">Sort: ตามสถานะ</option>
                </select>
              </div>

              {showFilters && (
                <div className="bg-slate-100 dark:bg-slate-950/50 p-3 rounded-xl border border-slate-200 dark:border-slate-800 mt-3 space-y-3 animate-in fade-in slide-in-from-top-2">
                  <div>
                    <div className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-2">ตามกระบวนการ</div>
                    <div className="flex flex-wrap gap-1.5">
                      {renderFilterChip('ทั้งหมด', 'All')}
                      {renderFilterChip('รอรับงาน', '0')}
                      {renderFilterChip('รับเรื่อง', '1')}
                      {renderFilterChip('ดำเนินการ', '2')}
                      {renderFilterChip('เสร็จสิ้น', '3')}
                    </div>
                  </div>
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                    <div className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-2">ความเร่งด่วน</div>
                    <div className="flex flex-wrap gap-1.5">
                      {renderFilterChip('เลยกำหนด', 'Overdue', 'bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-950/30 dark:border-rose-800', 'bg-rose-600 text-white border-rose-600 shadow-[0_0_8px_#e11d48]')}
                      {renderFilterChip('คอขวด', 'Bottleneck', 'bg-orange-50 text-orange-600 border-orange-200 dark:bg-orange-950/30 dark:border-orange-800', 'bg-orange-500 text-white border-orange-500 shadow-[0_0_8px_#f97316]')}
                      {renderFilterChip('แจ้งปัญหา', 'Issue', 'bg-red-50 text-red-600 border-red-200 dark:bg-red-950/30 dark:border-red-800', 'bg-red-600 text-white border-red-600 shadow-[0_0_8px_#dc2626]')}
                    </div>
                  </div>
                </div>
              )}
            </div>

          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-slate-100/50 dark:bg-slate-950 transition-colors">
            {processedTasks.map(task => {
               const isMyOrder = task.requester === loggedInUser?.name;
               const isUnread = (task.unreadBy || []).includes(loggedInUser?.name);
               const isSelected = selectedTaskId === task.id;
               
               const isTaskOverdue = checkOverdue(task.dueDate) && (task.currentStep || 0) < 3;
               const isBottleneck = checkBottleneck(task.individualStatus) && (task.currentStep || 0) < 3;
               
               let cardStyle = "bg-white border-transparent hover:border-slate-300 dark:bg-slate-900 dark:border-slate-800"; 
               
               if (isSelected) {
                   cardStyle = "bg-blue-600 border-blue-700 dark:bg-slate-800 dark:border-blue-500 shadow-xl -translate-y-1";
               } else if (task.hasIssue) {
                   cardStyle = "bg-red-50 border-red-300 dark:bg-rose-950/20 dark:border-rose-500/50 shadow-[0_0_10px_rgba(225,29,72,0.3)]";
               } else if (isTaskOverdue) {
                   cardStyle = "bg-rose-50 border-rose-300 dark:bg-rose-950/10 dark:border-rose-500/40 shadow-sm"; 
               } else if (isBottleneck) {
                   cardStyle = "bg-orange-50 border-orange-300 dark:bg-orange-950/20 dark:border-orange-500/50 shadow-[0_0_10px_rgba(249,115,22,0.2)]"; 
               } else if (isMyOrder) {
                   cardStyle = "bg-amber-50 border-amber-200 hover:border-amber-300 dark:bg-slate-900 dark:border-amber-500/40";
               }
               
               const personsCount = (task.relatedPersons || []).length;
               const completedCount = (task.relatedPersons || []).filter((p:string) => task.individualStatus?.[p] === 3).length;

               return (
                <div key={task.id} onClick={() => setSelectedTaskId(task.id)} className={`p-4 rounded-2xl border-2 dark:border cursor-pointer relative group transition-all duration-200 ${cardStyle}`}>
                  {isUnread && <span className="absolute top-4 left-2 w-3 h-3 bg-green-500 dark:bg-lime-500 rounded-full border-2 border-white dark:border-slate-900 animate-pulse"></span>}
                  
                  <div className="absolute -top-3 right-4 flex gap-1">
                      {isTaskOverdue && !isSelected && <span className="bg-rose-600 text-white text-[8px] font-black px-2 py-0.5 rounded-full shadow-md animate-pulse">OVERDUE</span>}
                      {isBottleneck && !isSelected && <span className="bg-orange-500 text-white text-[8px] font-black px-2 py-0.5 rounded-full shadow-md flex items-center gap-0.5"><Flame className="w-2.5 h-2.5"/> คอขวด</span>}
                      
                      {/* 🟢 แสดงชื่อลูกค้าบนป้ายกำกับของงาน External */}
                      {!isSelected && task.taskType && (
                        <span className={`text-[8px] font-black px-2 py-0.5 rounded-full shadow-md flex items-center gap-0.5 ${task.taskType === 'Internal' ? 'bg-slate-700 text-white' : 'bg-cyan-500 text-white'}`}>
                          {task.taskType === 'Internal' ? <Shield className="w-2.5 h-2.5"/> : <Globe className="w-2.5 h-2.5"/>}
                          {task.taskType === 'Internal' ? 'ภายใน' : task.customerName}
                        </span>
                      )}
                  </div>

                  <div className="flex justify-between items-start mb-2 mt-2">
                    <h3 className={`text-sm leading-tight pr-6 line-clamp-2 ${isSelected ? 'text-white font-black' : (isUnread ? 'text-slate-900 dark:text-white font-black' : 'text-slate-800 dark:text-slate-300 font-bold')}`}>{task.topic}</h3>
                    {loggedInUser?.role === 'admin' && <button onClick={e => deleteTask(task.id, e)} className="text-red-400 hover:text-red-600 dark:text-rose-500 dark:hover:text-rose-400 opacity-0 group-hover:opacity-100 p-1"><Trash2 className="w-4 h-4"/></button>}
                  </div>
                  <div className={`flex items-center gap-3 mt-3 text-[10px] ${isSelected ? 'text-blue-100' : 'text-slate-500'}`}>
                    <div className="flex items-center gap-1"><User className="w-3 h-3"/> สั่งโดย: <span className="font-bold underline">{task.requester}</span></div>
                    <div className="flex items-center gap-1"><Users className="w-3 h-3"/> {personsCount} คน</div>
                  </div>
                  
                  {renderAvatarProgress(task, isSelected)}
                  
                  <div className={`flex justify-between items-center mt-3 pt-3 border-t ${isSelected ? 'border-white/20' : 'border-slate-200 dark:border-slate-700/50'}`}>
                    <div className={`text-[9px] font-black uppercase tracking-tight flex items-center gap-1 ${task.hasIssue ? 'text-red-500 dark:text-rose-500 animate-pulse' : (isSelected ? 'text-blue-200' : 'text-slate-400')}`}>
                        {task.hasIssue ? <AlertTriangle className="w-3.5 h-3.5"/> : <CheckCircle2 className="w-3.5 h-3.5"/>} 
                        {task.hasIssue ? 'CRITICAL ISSUE!' : `${completedCount}/${personsCount} COMPLETED`}
                    </div>
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-md border tracking-wider ${isSelected ? 'bg-white/20 border-transparent text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-transparent dark:border-slate-700'}`}>🏁 {task.dueDate}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* --- Chat Window --- */}
        {selectedTask ? (
          <div className="flex-1 flex flex-col bg-slate-50 dark:bg-slate-900 relative transition-colors duration-300">
            
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 shadow-sm z-10 bg-white dark:bg-slate-900/90 backdrop-blur-md">
            <div className="flex justify-between items-start mb-4">
            <div className="flex-1 pr-4">
              <button onClick={() => setSelectedTaskId(null)} className="md:hidden text-blue-600 font-black text-[10px] flex items-center gap-1 mb-3 uppercase"><ArrowLeft className="w-3 h-3"/> Back</button>
              <h2 className="text-2xl font-black text-slate-800 dark:text-white tracking-tighter leading-none mb-2">
                {selectedTask.topic}
              </h2>
              
              {selectedTask.taskType && (
                <span className={`inline-flex text-[10px] px-2 py-1 rounded-md items-center gap-1 font-bold ${selectedTask.taskType === 'External' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                  {selectedTask.taskType === 'Internal' ? <Shield className="w-3 h-3"/> : <Globe className="w-3 h-3"/>}
                  {selectedTask.taskType === 'Internal' ? 'ภายในบริษัท' : `ลูกค้าราย: ${selectedTask.customerName}`}
                </span>
              )}

              {selectedTask.documentNo && (
                <div className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 text-xs px-2 py-1 rounded-md mt-2 font-bold ml-2">
                  <FileText className="w-3.5 h-3.5"/> Ref: {selectedTask.documentNo}
                </div>
              )}

              {selectedTask.details && (
                <div className="text-sm text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-200 dark:border-slate-800 my-3 whitespace-pre-wrap shadow-inner">
                  {selectedTask.details}
                </div>
              )}

              {/* 🟢 โซนอัปโหลดเอกสารลูกค้า (ฉบับย่อส่วน ไม่กินพื้นที่ช่องแชท) */}
              {selectedTask?.taskType === 'External' && (
                <div className="my-2 bg-emerald-50 dark:bg-emerald-950/30 p-3 rounded-xl border border-emerald-200 dark:border-emerald-800 transition-all">
                  {/* หัวข้อและปุ่มอัปโหลด (จัดให้เพรียวบางลง) */}
                  <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-emerald-800 dark:text-emerald-400 flex items-center gap-1">
                        <FileText className="w-3.5 h-3.5"/> เอกสารส่งมอบลูกค้า
                      </span>
                      <span className="text-[10px] font-bold text-emerald-600/80 dark:text-emerald-500 bg-emerald-100 dark:bg-emerald-900/50 px-2 py-0.5 rounded-full">
                        {(selectedTask?.officialDocs || []).length} ไฟล์
                      </span>
                    </div>
                    <label className="bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded-lg text-[10px] font-black cursor-pointer flex items-center gap-1 shadow-sm transition-all uppercase">
                      {isUploadingDoc ? <Loader2 className="w-3 h-3 animate-spin"/> : <Plus className="w-3 h-3"/>} เพิ่มไฟล์
                      <input type="file" multiple className="hidden" accept=".pdf,image/*" onChange={handleUploadOfficialDoc} disabled={isUploadingDoc}/>
                    </label>
                  </div>

                  {/* 🟢 รายการไฟล์แบบแคปซูลแนวนอน + ล็อกความสูงไม่ให้ยืดเกิน 80px */}
                  {(selectedTask?.officialDocs || []).length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto pr-1 pt-0.5 custom-scrollbar">
                      {(selectedTask?.officialDocs || []).map((docItem: any, idx: number) => (
                        <div 
                          key={idx} 
                          className="inline-flex items-center justify-between gap-2 bg-white dark:bg-slate-800 px-2.5 py-1 rounded-lg border border-emerald-200/80 dark:border-emerald-700/50 shadow-2xs hover:border-emerald-400 transition-all group max-w-[200px]"
                        >
                          <a 
                            href={docItem.url} 
                            target="_blank" 
                            rel="noreferrer" 
                            className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 hover:underline flex items-center gap-1 truncate"
                            title={docItem.name}
                          >
                            <FileText className="w-3 h-3 shrink-0 text-emerald-500"/> 
                            <span className="truncate">{docItem.name}</span>
                          </a>
                          <button 
                            onClick={() => handleDeleteOfficialDoc(docItem)} 
                            className="text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 p-0.5 rounded transition-all shrink-0" 
                            title="ลบไฟล์นี้"
                          >
                            <Trash2 className="w-3 h-3"/>
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-[10px] text-center py-1.5 bg-white/50 dark:bg-slate-900/50 rounded-lg border border-dashed border-emerald-200 dark:border-emerald-800 text-emerald-600/50 font-bold">
                      ยังไม่มีเอกสารแนบ (คลิก "เพิ่มไฟล์" ด้านขวาบน)
                    </div>
                  )}
                </div>
              )}

              {/* ข้อมูลเวลาและผู้สร้าง */}
              <div className="flex flex-wrap gap-4 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-2">
                <span className="flex items-center gap-1"><User className="w-3.5 h-3.5 text-blue-500"/> OP: {selectedTask.requester}</span>
                <span className="flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5 text-amber-500"/> Date: {selectedTask.dueDate || '-'}</span>
              </div>
            </div>

            {/* ปุ่ม Action (ขวาบน) */}
            <div className="flex flex-col gap-2 shrink-0">
              {selectedTask.requester === loggedInUser?.name && (
                <button onClick={archiveTask} className="bg-slate-900 dark:bg-lime-600 text-white dark:text-black px-4 py-2.5 rounded-xl text-xs font-black hover:bg-black transition-all flex items-center justify-center gap-1.5 uppercase italic">
                  <CheckCheck className="w-4 h-4"/> Finish
                </button>
              )}
              {selectedTask.hasIssue ? (
                <button onClick={resolveIssue} disabled={selectedTask.issueReporter === loggedInUser?.name && loggedInUser?.role !== 'admin'} className="px-4 py-2.5 rounded-xl text-xs font-black border border-emerald-500 text-emerald-600 hover:bg-emerald-50 transition-all uppercase disabled:opacity-50 flex items-center justify-center gap-1.5">
                  <Flag className="w-4 h-4"/> Resolve
                </button>
              ) : (
                <button onClick={reportIssue} disabled={(selectedTask.currentStep || 0) >= 3} className="px-4 py-2.5 rounded-xl text-xs font-black border border-red-200 text-red-500 bg-red-50 hover:bg-red-100 disabled:opacity-50 transition-all uppercase flex items-center justify-center gap-1.5">
                  <Flag className="w-4 h-4"/> Issue
                </button>
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
                    {(loggedInUser?.role === 'admin' || selectedTask.requester === loggedInUser?.name) && (
                      <button onClick={() => setIsAddPersonModalOpen(true)} className="p-1.5 bg-white dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg border border-slate-200 dark:border-blue-500/30 hover:bg-slate-100 dark:hover:bg-blue-800/50 transition-all shadow-sm"><UserPlus className="w-4 h-4"/></button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(() => {
                        const isTaskOverdue = checkOverdue(selectedTask.dueDate);
                        const isBottleneck = checkBottleneck(selectedTask.individualStatus);
                        const minStep = Math.min(...(Object.values(selectedTask.individualStatus || {0:0}) as number[]));
                        
                        return (selectedTask.relatedPersons || []).map((p: string) => {
                          const pStepIdx = (selectedTask.individualStatus?.[p] >= 0 && selectedTask.individualStatus?.[p] <= 3) ? selectedTask.individualStatus[p] : 0;
                          const pStepData = steps[pStepIdx] || steps[0];
                          const isMe = p === loggedInUser?.name;
                          
                          let badgeWrapperStyle = isMe ? 'bg-white dark:bg-slate-800 border-blue-400 dark:border-blue-500 text-slate-800 dark:text-white shadow-md' : 'bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400';
                          let badgeColor = pStepData.color;

                          if (selectedTask.hasIssue && selectedTask.issueReporter === p) {
                              badgeWrapperStyle = 'bg-red-50 border-red-500 text-red-700 animate-pulse shadow-[0_0_10px_red]';
                              badgeColor = 'bg-red-600';
                          } else if (isTaskOverdue && pStepIdx < 3) {
                              badgeWrapperStyle = 'bg-rose-50 border-rose-500 text-rose-700 dark:bg-rose-950/30 dark:border-rose-500 animate-pulse shadow-[0_0_8px_#e11d48]';
                              badgeColor = 'bg-rose-600';
                          } else if (isBottleneck && pStepIdx === minStep && pStepIdx < 3) {
                              badgeWrapperStyle += ' ring-2 ring-orange-400 ring-offset-1 dark:ring-offset-slate-950 shadow-[0_0_10px_#fb923c]';
                          }

                          return (
                            <div key={p} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-black transition-all ${badgeWrapperStyle}`}>
                              <span>{p}</span>
                              <div className={`flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-black uppercase ${badgeColor} text-white`}>{pStepData.icon} {pStepData.label}</div>
                              {isMe && pStepIdx < 3 && <button onClick={advanceMyStep} className="bg-blue-600 text-white px-2 py-1 rounded shadow-sm hover:bg-blue-700 dark:hover:bg-blue-500 transition-all uppercase text-[9px] italic ml-1">BOOST ⚡</button>}
                              
                              {(loggedInUser?.role === 'admin' || loggedInUser?.name === selectedTask.requester) && (
                                <button onClick={() => removePersonFromTask(p)} className="ml-1 p-1 rounded-full hover:bg-red-100 text-slate-300 hover:text-red-500 transition-all" title="นำออกจากงาน">
                                  <X className="w-3.5 h-3.5"/>
                                </button>
                              )}
                            </div>
                          );
                        });
                    })()}
                  </div>
                </div>
              </div>
            </div>
       
            {/* 💬 โซนข้อความแชท */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-transparent z-10 transition-colors">
              {(chats[selectedTaskId!] || []).map((c: any) => {
                const isMe = c.sender === loggedInUser?.name;
                const isAdmin = loggedInUser?.role === 'admin';
                const isImage = c.fileName && isImageFile(c.fileName);
                const isRead = !((selectedTask?.unreadBy || []).length > 0); 
                
                return (
                  <div key={c.id} className={`flex flex-col group ${c.isSystem ? 'items-center' : (isMe ? 'items-end' : 'items-start')}`}>
                    {c.isSystem ? (
                      <div className="bg-slate-200/50 dark:bg-slate-800/50 px-4 py-2 rounded-full text-[10px] font-black text-slate-500 border shadow-sm my-2 text-center max-w-[80%] uppercase italic">{c.text}</div>
                    ) : (
                      <>
                        <div className={`flex items-center gap-2 text-[9px] font-black text-slate-400 mb-1 px-2 tracking-widest ${isMe ? 'flex-row-reverse' : ''}`}>
                          <span className="uppercase">{c.sender}</span>
                          <span>•</span>
                          <span>{formatFullDateTime(c.timestamp)}</span>
                        </div>

                        <div className={`relative flex items-center gap-2 ${isMe ? 'flex-row-reverse' : ''} max-w-[85%]`}>
                          
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 bg-white dark:bg-slate-800 shadow-sm border rounded-lg p-1 absolute -top-4 -right-12 z-20">
                             <button onClick={()=>setReplyingTo(c)} className="p-1 text-slate-400 hover:text-blue-500 rounded"><Reply className="w-3.5 h-3.5"/></button>
                             {(isMe || isAdmin) && <button onClick={()=>handleDeleteChat(c.id)} className="p-1 text-slate-400 hover:text-red-500 rounded"><Trash2 className="w-3.5 h-3.5"/></button>}
                          </div>

                          <div className={`p-4 rounded-[1.2rem] text-sm shadow-sm relative ${isMe ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-tl-none text-slate-800 dark:text-slate-200'}`}>
                            
                            {c.replyTo && (
                              <div className="mb-3 p-2 bg-black/10 dark:bg-black/30 rounded-lg border-l-4 border-l-amber-400 text-[10px] opacity-80 cursor-pointer line-clamp-2">
                                <div className="font-black mb-1">{c.replyTo.sender}</div>
                                <div>{c.replyTo.fileUrl ? '📸 ส่งไฟล์/รูปภาพ' : c.replyTo.text}</div>
                              </div>
                            )}

                            {c.fileUrl && (
                              isImage ? (
                                <img src={c.fileUrl} alt="attachment" onClick={()=>setPreviewImage(c.fileUrl)} className="max-w-[200px] max-h-[200px] object-cover rounded-lg mb-2 cursor-pointer border border-black/10 hover:opacity-90 transition-opacity" />
                              ) : (
                                <a href={c.fileUrl} target="_blank" rel="noreferrer" className="flex items-center gap-3 mb-3 bg-black/10 p-3 rounded-lg text-[11px] font-black hover:bg-black/20 transition-all text-slate-800 dark:text-blue-300"><Package className="w-5 h-5"/> {c.fileName}</a>
                              )
                            )}
                            
                            {c.text && <span className="whitespace-pre-wrap leading-relaxed font-medium">{renderMessageTextWithMentions(c.text)}</span>}
                          </div>
                        </div>
                        
                        {isMe && !c.isSystem && (
                          <div className={`text-[10px] mt-1 pr-1 ${isRead ? 'text-blue-500' : 'text-slate-400'}`}>
                             {isRead ? <CheckCheck className="w-4 h-4 inline" /> : <CheckCircle2 className="w-3 h-3 inline" />}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>

        
            {/* 💬 แถบพิมพ์ข้อความ (Input Area) */}
            <div className="bg-white dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex flex-col z-10 transition-colors">
              
              {replyingTo && (
                <div className="px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-100 flex justify-between items-center text-xs">
                  <div className="flex flex-col">
                    <span className="font-black text-amber-700 dark:text-amber-500">ตอบกลับ {replyingTo.sender}:</span>
                    <span className="text-slate-500 line-clamp-1">{replyingTo.fileUrl ? '📸 [รูปภาพ/ไฟล์]' : replyingTo.text}</span>
                  </div>
                  <button onClick={()=>setReplyingTo(null)} className="p-1 hover:bg-amber-200 rounded text-amber-600"><X className="w-4 h-4"/></button>
                </div>
              )}

              <form onSubmit={handleSendMessage} className="p-4 flex flex-col gap-3">
                {chatFile && <div className="text-[10px] bg-blue-50 p-2.5 rounded-lg flex justify-between items-center font-black text-blue-600 border border-blue-200 tracking-widest uppercase"><span>📎 FILE: {chatFile.name}</span><button type="button" onClick={()=>setChatFile(null)} className="p-1 hover:bg-blue-200 rounded"><X className="w-4 h-4"/></button></div>}
                
                <div className="flex gap-2 items-end">
                  <label className="p-4 bg-slate-100 dark:bg-slate-900 rounded-xl cursor-pointer hover:bg-slate-200 transition-all text-slate-500 shrink-0"><Paperclip className="w-5 h-5"/><input type="file" className="hidden" onChange={e => e.target.files && setChatFile(e.target.files[0])}/></label>
                  <textarea 
                    className="flex-1 bg-slate-100 dark:bg-slate-900 border-transparent px-5 py-4 rounded-xl outline-none font-bold text-slate-800 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 resize-none max-h-32 min-h-[56px]" 
                    placeholder="พิมพ์ข้อความ หรือพิมพ์ @ เพื่อแท็ก..." 
                    value={chatInput} 
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(e); } }}
                  />
                  <button type="submit" disabled={isUploading} className="p-4 bg-blue-600 text-white rounded-xl shadow-md flex items-center justify-center hover:bg-blue-700 transition-all shrink-0 h-[56px]">{isUploading ? <Loader2 className="w-5 h-5 animate-spin"/> : <Send className="w-5 h-5"/>}</button>
                </div>
              </form>
            </div>

            {/* Modal กดดูรูปภาพขนาดใหญ่ */}
            {previewImage && (
              <div className="fixed inset-0 bg-black/90 z-[600] flex items-center justify-center p-4 cursor-zoom-out" onClick={() => setPreviewImage(null)}>
                <img src={previewImage} alt="Preview" className="max-w-full max-h-[90vh] object-contain rounded-xl shadow-2xl border-4 border-white/10" />
                <button className="absolute top-6 right-6 text-white bg-white/20 p-2 rounded-full hover:bg-red-500"><X className="w-6 h-6"/></button>
              </div>
            )}
          </div>
        ) : (
          <div className="hidden md:flex flex-1 flex-col items-center justify-center text-slate-300 dark:text-slate-800 bg-slate-50 dark:bg-slate-950 relative">
            <Zap className="w-32 h-32 mb-6 opacity-20 text-slate-400"/>
            <p className="font-black text-3xl text-slate-400 italic tracking-tighter uppercase">MISSION SELECTION REQUIRED</p>
          </div>
        )}
      </div>
      
      {/* โมดูลสั่งงานใหม่ (Modal) */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-[300]">
          <form onSubmit={handleCreateTask} className="bg-white dark:bg-slate-900 rounded-[2rem] w-full max-w-md p-8 space-y-5 shadow-2xl border-b-8 border-blue-600 dark:border-b-0 dark:border dark:border-slate-700 animate-in zoom-in-95 duration-200 transition-colors">
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-4">
              <h2 className="font-black text-2xl text-slate-800 dark:text-white tracking-tighter italic uppercase">NEW MISSION 🚀</h2>
              <button type="button" onClick={()=>setIsModalOpen(false)} className="bg-slate-100 dark:bg-slate-800 p-2 rounded-lg text-slate-400 hover:text-red-500 dark:hover:text-white transition-all"><X className="w-5 h-5"/></button>
            </div>
            
            {loggedInUser?.role !== 'customer' && (
              <div className="flex gap-2 p-1 bg-slate-100 dark:bg-slate-950 rounded-xl">
                <button type="button" onClick={() => setNewTask({...newTask, taskType: 'Internal', relatedPersons: [], customerName: ''})} className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg text-[10px] font-black tracking-widest uppercase transition-all ${newTask.taskType === 'Internal' ? 'bg-white dark:bg-slate-800 shadow-md text-blue-600 dark:text-blue-400' : 'text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-900'}`}>
                  <Shield className="w-4 h-4"/> ภายในบริษัท
                </button>
                <button type="button" onClick={() => setNewTask({...newTask, taskType: 'External', relatedPersons: []})} className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg text-[10px] font-black tracking-widest uppercase transition-all ${newTask.taskType === 'External' ? 'bg-white dark:bg-slate-800 shadow-md text-cyan-600 dark:text-cyan-400' : 'text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-900'}`}>
                  <Globe className="w-4 h-4"/> งานลูกค้า
                </button>
              </div>
            )}
            
            {/* 🟢 ถ้าเลือกเป็นงานลูกค้า (External) จะมีช่อง Dropdown โผล่มาให้เลือกชื่อลูกค้า */}
            {loggedInUser?.role !== 'customer' && newTask.taskType === 'External' && (
              <div className="space-y-1 mt-4 animate-in fade-in slide-in-from-top-2">
                <label className="text-[10px] font-black text-cyan-600 dark:text-cyan-400 ml-1 uppercase tracking-widest">Select Customer (ลูกค้ารายใด?)</label>
                <input
                 type="text"
                 list="customer-list"
                 placeholder="-- พิมพ์ชื่อเพื่อค้นหา หรือคลิกเพื่อเลือก --"
                 className="w-full p-3.5 bg-cyan-50 dark:bg-slate-900 border border-cyan-200 dark:border-cyan-800 rounded-xl outline-none font-bold text-cyan-800 dark:text-cyan-300 focus:border-cyan-500 transition-all"
                value={newTask.customerName || ''}
                onChange={(e) => setNewTask({ ...newTask, customerName: e.target.value })}
              />
              <datalist id="customer-list">
                {getCustomersList().map((c: string) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
          )}

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
            
            {loggedInUser?.role === 'customer' ? (
              <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl flex items-start gap-3">
                <Shield className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5"/>
                <div>
                  <p className="text-sm font-black text-blue-800 dark:text-blue-300 mb-1">ส่งตรงถึงศูนย์บริการส่วนกลาง</p>
                  <p className="text-xs font-bold text-blue-600/80 dark:text-blue-400/80">ออเดอร์นี้จะถูกส่งไปให้ทีมงานฝ่ายจัดการ (ออม, คนึงคนสวย, พริ้มพลอย) เพื่อตรวจสอบและดำเนินการทันที</p>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-[10px] font-black text-blue-600 dark:text-blue-500 ml-1 uppercase tracking-widest flex justify-between">
                  <span>Select Drivers 👥</span>
                  <span className="text-slate-400">{newTask.taskType === 'Internal' ? '(เฉพาะพนักงาน)' : '(รวมลูกค้า)'}</span>
                </label>
                <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto border border-blue-100 dark:border-slate-800 p-3 rounded-xl bg-blue-50/50 dark:bg-slate-950">
                  {getAvailableUsers(newTask.taskType).map((u: string) => (
                    <label key={u} className="flex items-center gap-2 text-xs font-bold p-2 hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-all cursor-pointer text-slate-700 dark:text-slate-300">
                      <input type="checkbox" className="rounded-sm w-4 h-4 border-slate-300 dark:bg-slate-900 dark:border-slate-700 text-blue-600 focus:ring-0" checked={newTask.relatedPersons.includes(u)} onChange={e => { if(e.target.checked) setNewTask({...newTask, relatedPersons:[...newTask.relatedPersons, u]}); else setNewTask({...newTask, relatedPersons: newTask.relatedPersons.filter(n=>n!==u)})}}/> {u}
                    </label>
                  ))}
                </div>
              </div>
            )}
            
            <button type="submit" className="w-full bg-blue-600 text-white p-4 rounded-xl font-black text-lg shadow-xl hover:bg-blue-700 dark:hover:bg-blue-500 transition-all uppercase italic tracking-widest mt-2">Engage ⚡</button>
          </form>
        </div>
      )}

      {/* โมดูลเพิ่มคนทีหลัง (Add Person Modal) */}
      {isAddPersonModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-[100]">
          <div className="bg-white dark:bg-slate-900 rounded-[2rem] w-full max-w-xs p-6 shadow-2xl border-t-8 border-blue-600 dark:border-t-0 dark:border dark:border-slate-700 transition-colors">
            <h3 className="font-black text-xl mb-4 flex items-center gap-2 italic uppercase text-slate-800 dark:text-white"><UserPlus className="w-6 h-6 text-blue-600 dark:text-blue-500"/> Add Driver</h3>
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {getAvailableUsers(selectedTask?.taskType || 'Internal').filter((u: string) => !(selectedTask?.relatedPersons || []).includes(u)).map((u: string) => (
                <button key={u} onClick={()=>{addPersonToTask(u); setIsAddPersonModalOpen(false);}} className="w-full text-left p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-slate-800 transition-all font-bold text-slate-700 dark:text-slate-300 flex justify-between items-center uppercase tracking-tight group">{u} <Plus className="w-4 h-4 opacity-0 group-hover:opacity-100 text-blue-500"/></button>
              ))}
            </div>
            <button onClick={()=>setIsAddPersonModalOpen(false)} className="w-full mt-4 p-3 bg-slate-100 dark:bg-slate-800 rounded-xl text-slate-500 dark:text-slate-400 font-black hover:text-slate-800 dark:hover:text-white uppercase text-[10px] tracking-widest">Cancel</button>
          </div>
        </div>
      )}

      {confirmModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-[200]">
          <div className="bg-white dark:bg-slate-900 rounded-[2rem] w-full max-w-sm p-8 shadow-2xl border-t-8 dark:border-t-0 border-transparent dark:border dark:border-slate-700 relative overflow-hidden transition-colors">
            {confirmModal.type === 'danger' && <div className="absolute top-0 left-0 w-full h-2 bg-red-600 dark:bg-rose-600 shadow-[0_0_15px_#e11d48]"></div>}
            {confirmModal.type === 'info' && <div className="absolute top-0 left-0 w-full h-2 bg-blue-600 shadow-[0_0_15px_#2563eb]"></div>}
            <h3 className={`text-xl font-black mb-3 flex items-center gap-2 uppercase italic tracking-tighter ${confirmModal.type==='danger'?'text-red-600 dark:text-rose-500':'text-slate-800 dark:text-white'}`}>{confirmModal.title}</h3>
            <p className="text-sm font-bold text-slate-500 dark:text-slate-400 mb-8 leading-relaxed">{confirmModal.text}</p>
            <div className="flex gap-4">
              <button onClick={()=>setConfirmModal({...confirmModal, isOpen:false})} className="flex-1 p-4 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300 font-black rounded-xl uppercase text-[10px] tracking-widest">Cancel</button>
              <button onClick={()=>{confirmModal.onConfirm(); setConfirmModal({...confirmModal, isOpen:false});}} className={`flex-1 p-4 text-white font-black rounded-xl uppercase text-[10px] tracking-widest transition-all ${confirmModal.type==='danger'?'bg-red-600 dark:bg-rose-600':'bg-blue-600'}`}>Confirm</button>
            </div>
          </div>
        </div>
      )}

      <QRMaker isOpen={isQrModalOpen} onClose={() => setIsQrModalOpen(false)} loggedInUser={loggedInUser} showToast={showToast} />
      <BillingMatcher isOpen={isBillingMatcherOpen} onClose={() => setIsBillingMatcherOpen(false)} showToast={showToast} />
      {toastMsg && <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-8 py-4 rounded-xl font-black text-xs shadow-2xl z-[500] animate-in slide-in-from-bottom-10 flex items-center gap-3 tracking-widest italic uppercase"><Zap className="w-4 h-4 text-white"/> {toastMsg}</div>}
    </div>
  );
}