import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, query, orderBy, deleteDoc, setDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from './firebase'; 
import { 
  Search, CheckCircle2, Clock, 
  Paperclip, Send, AlertTriangle, ArrowLeft,
  MessageSquare, User, Plus, Loader2, LogOut, X, Package, Archive, CalendarDays, Trash2, Users, Info, UserPlus, FileText, Filter,
  Settings, Flag, Zap, Sun, Moon
} from 'lucide-react';

const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbym2Jl1qlXHqaNJq7S0TbhhsXegSDAPwIzf7h8_q08rOkkyY60G4UWy_NeHVsFIenCO/exec';

export default function App() {
  const [loggedInUser, setLoggedInUser] = useState<any>(null);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [isDarkMode, setIsDarkMode] = useState(false);

  // --- 🌗 ระบบจัดการธีม (Light/Dark Mode) ---
  useEffect(() => {
    const savedTheme = localStorage.getItem('stp_theme');
    if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      setIsDarkMode(true);
      document.documentElement.classList.add('dark');
    } else {
      setIsDarkMode(false);
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const toggleTheme = () => {
    if (isDarkMode) {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('stp_theme', 'light');
      setIsDarkMode(false);
    } else {
      document.documentElement.classList.add('dark');
      localStorage.setItem('stp_theme', 'dark');
      setIsDarkMode(true);
    }
  };

  const [confirmModal, setConfirmModal] = useState<{isOpen: boolean, title: string, text: string, type: 'danger' | 'warning' | 'info', onConfirm: () => void}>({
    isOpen: false, title: '', text: '', type: 'info', onConfirm: () => {}
  });
  
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

  // 🏁 นิยามเกจวัดความเร็ว (Racing Progress)
  const steps = [
    { label: 'รอรับงาน', icon: <Clock className="w-3.5 h-3.5" />, color: 'bg-slate-400 dark:bg-slate-600 dark:shadow-[0_0_5px_#475569]', text: 'text-slate-500 dark:text-slate-400' },
    { label: 'รับเรื่องแล้ว', icon: <User className="w-3.5 h-3.5" />, color: 'bg-sky-500 dark:bg-cyan-500 dark:shadow-[0_0_10px_#06b6d4]', text: 'text-sky-600 dark:text-cyan-400' },
    { label: 'กำลังดำเนินการ', icon: <Settings className="w-3.5 h-3.5 animate-spin" />, color: 'bg-amber-500 dark:shadow-[0_0_10px_#f59e0b]', text: 'text-amber-600 dark:text-amber-400' },
    { label: 'เสร็จสิ้น', icon: <Flag className="w-3.5 h-3.5" />, color: 'bg-green-500 dark:bg-lime-500 dark:shadow-[0_0_12px_#84cc16]', text: 'text-green-600 dark:text-lime-400' }
  ];

  const allTopics = Object.values(settings?.topicMapping || {}).flat() as string[];
  const showToast = (msg: string) => { setToastMsg(msg); setTimeout(() => setToastMsg(''), 4000); };

  // --- 🔥 Firebase Sync & Business Logic ---
  useEffect(() => {
    if (selectedTaskId && loggedInUser) {
      try { updateDoc(doc(db, 'tasks', selectedTaskId), { unreadBy: arrayRemove(loggedInUser.name) }); } catch (e) {}
    }
  }, [selectedTaskId, loggedInUser]);

  useEffect(() => {
    const fetchMasterData = async () => {
      try {
        const res = await fetch(WEB_APP_URL); const data = await res.json();
        if (data && data.settings) setSettings({ users: data.settings.users || [], topicMapping: data.settings.topicMapping || {} });
      } catch (e) { setSettings({ users: ['อภิสิทธิ์', 'แอดมิน'], topicMapping: {} }); }
    };
    try {
      const savedUser = localStorage.getItem('stp_user_session');
      if (savedUser) setLoggedInUser(JSON.parse(savedUser)); 
    } catch (e) { localStorage.removeItem('stp_user_session'); }
    fetchMasterData();
  }, []);

  useEffect(() => {
    if (!loggedInUser) return;
    try {
      const userRef = doc(db, 'presence', loggedInUser.name);
      setDoc(userRef, { isOnline: true, lastSeen: serverTimestamp() }, { merge: true });
      const handleBeforeUnload = () => { updateDoc(userRef, { isOnline: false, lastSeen: serverTimestamp() }); };
      window.addEventListener('beforeunload', handleBeforeUnload);
      return onSnapshot(collection(db, 'presence'), (snap) => {
        const pres: any = {}; snap.forEach(d => { pres[d.id] = d.data(); }); setUserPresence(pres);
      });
    } catch(e) {}
  }, [loggedInUser]);

  useEffect(() => {
    if (!loggedInUser) return;
    return onSnapshot(query(collection(db, 'tasks'), orderBy('lastActivity', 'desc')), (snap) => {
      setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, [loggedInUser]);

  useEffect(() => {
    if (!selectedTaskId) return;
    return onSnapshot(query(collection(db, 'tasks', selectedTaskId, 'chats'), orderBy('timestamp', 'asc')), (snap) => {
      setChats((prev: any) => ({ ...prev, [selectedTaskId]: snap.docs.map(d => ({ id: d.id, ...d.data() })) }));
    });
  }, [selectedTaskId]);

  const handleLogin = async (e: any) => {
    e.preventDefault(); setIsLoading(true);
    try {
      const res = await fetch(WEB_APP_URL, { method: 'POST', body: JSON.stringify({ action: 'LOGIN', ...loginForm }) });
      const result = await res.json();
      if (result.status === 'success') {
        localStorage.setItem('stp_user_session', JSON.stringify(result.user));
        setLoggedInUser(result.user);
      } else showToast('❌ รหัสผ่านไม่ถูกต้อง');
    } catch { showToast('❌ เชื่อมต่อ Google Sheets ไม่ได้'); }
    setIsLoading(false);
  };

  const handleLogout = async () => {
    if (loggedInUser) try { await updateDoc(doc(db, 'presence', loggedInUser.name), { isOnline: false, lastSeen: serverTimestamp() }); } catch(e){}
    localStorage.removeItem('stp_user_session'); setLoggedInUser(null);
  };

  const handleCreateTask = async (e: any) => {
    e.preventDefault();
    if (!newTask.topic || newTask.relatedPersons.length === 0 || !newTask.dueDate) return showToast('กรุณากรอกข้อมูลให้ครบถ้วน');
    setIsLoading(true);
    try {
      const individualStatus: any = {}; newTask.relatedPersons.forEach(p => { individualStatus[p] = 0; });
      const docRef = await addDoc(collection(db, 'tasks'), { 
        ...newTask, 
        requester: loggedInUser.name, 
        individualStatus, 
        unreadBy: [...newTask.relatedPersons].filter(p => p !== loggedInUser.name), 
        currentStep: 0, hasIssue: false, isArchived: false, createdAt: serverTimestamp(), lastActivity: serverTimestamp() 
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
      await updateDoc(doc(db, 'tasks', selectedTaskId), { lastActivity: serverTimestamp(), unreadBy: arrayUnion(...[...(selectedTask?.relatedPersons || []), selectedTask?.requester].filter(p => p && p !== loggedInUser.name)) });
    } catch(err) { showToast('❌ ส่งข้อมูลล้มเหลว'); }
    setIsUploading(false);
  };

  const advanceMyStep = async () => {
    if (!selectedTask || !selectedTaskId) return;
    const myCurrent = selectedTask.individualStatus?.[loggedInUser.name] || 0; if (myCurrent >= 3) return;
    const myNext = myCurrent + 1; const newInd = { ...(selectedTask.individualStatus || {}), [loggedInUser.name]: myNext };
    const allSteps = (selectedTask.relatedPersons || []).map((p: string) => newInd[p] || 0);
    const globalMin = allSteps.length > 0 ? Math.min(...allSteps) : 0;
    const updates: any = { individualStatus: newInd, lastActivity: serverTimestamp(), unreadBy: arrayUnion(...[...(selectedTask.relatedPersons || []), selectedTask.requester].filter(p => p && p !== loggedInUser.name)) };
    if (globalMin > (selectedTask.currentStep || 0)) { updates.currentStep = globalMin; updates.hasIssue = false; }
    try {
      await updateDoc(doc(db, 'tasks', selectedTaskId), updates);
      await addDoc(collection(db, 'tasks', selectedTaskId, 'chats'), { sender: 'System', text: `🚀 ${loggedInUser.name} สับเกียร์เพิ่มเป็น: ${steps[myNext]?.label || 'ดำเนินการต่อ'}`, timestamp: serverTimestamp(), isSystem: true });
    } catch(e) {}
  };

  const reportIssue = async () => {
    if (!selectedTask || !selectedTaskId) return;
    try {
      await updateDoc(doc(db, 'tasks', selectedTaskId), { hasIssue: true, lastActivity: serverTimestamp() });
      await addDoc(collection(db, 'tasks', selectedTaskId, 'chats'), { sender: 'System', text: `🚨 ${loggedInUser.name} แจ้งเหตุฉุกเฉิน (Pit Stop)!`, timestamp: serverTimestamp(), isSystem: true });
    } catch(e) {}
  };

  const deleteTask = async (tId: string, e: any) => {
    e.stopPropagation(); if (loggedInUser.role !== 'Admin') return showToast('❌ สิทธิ์เข้าถึงถูกปฏิเสธ');
    setConfirmModal({ isOpen: true, title: 'ลบข้อมูลถาวร', text: '🚨 ลบข้อมูลภารกิจนี้ทิ้งถาวรจากฐานข้อมูล ยืนยันหรือไม่?', type: 'danger', onConfirm: async () => {
      try { await deleteDoc(doc(db, 'tasks', tId)); if (selectedTaskId === tId) setSelectedTaskId(null); } catch(e) {}
    }});
  };

  const renderGauge = (currentStep: number, hasIssue: boolean) => {
    const safeStep = currentStep || 0;
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
    if (searchQuery && !(t.topic?.toLowerCase().includes(searchQuery.toLowerCase()) || (t.documentNo && t.documentNo.toLowerCase().includes(searchQuery.toLowerCase())))) return false;
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

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex flex-col font-sans h-screen overflow-hidden text-slate-800 dark:text-slate-200 transition-colors duration-300">
      
      {/* 🏎️ HEADER (แก้ไขเป็น STP Ltd. LIVE ตามคำสั่ง) */}
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
            <div className="text-[10px] font-black uppercase text-blue-400 tracking-widest">{loggedInUser.role}</div>
            <div className="text-sm font-bold text-white">{loggedInUser.name}</div>
          </div>
          <button onClick={toggleTheme} className="bg-white/10 dark:bg-slate-900 border border-transparent dark:border-slate-800 p-2.5 rounded-xl transition-all text-amber-300 dark:text-blue-400">
            {isDarkMode ? <Sun className="w-5 h-5"/> : <Moon className="w-5 h-5"/>}
          </button>
          <button onClick={handleLogout} className="bg-white/10 dark:bg-slate-900 border border-transparent dark:border-slate-700 p-2.5 rounded-xl hover:bg-red-500 dark:hover:bg-rose-600 transition-all text-white"><LogOut className="w-5 h-5"/></button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* คิวงานฝั่งซ้าย */}
        <div className={`w-full md:w-1/3 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col transition-colors ${selectedTaskId ? 'hidden md:flex' : 'flex'}`}>
          <div className="bg-slate-800 dark:bg-black text-white p-2.5 flex overflow-x-auto gap-3 items-center shrink-0 border-b border-slate-700 dark:border-slate-800 no-scrollbar transition-colors">
            <div className="text-[9px] font-black text-slate-400 dark:text-slate-600 uppercase tracking-widest pl-2 shrink-0">DRIVER STATUS:</div>
            {settings.users.map((u: string) => {
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
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-slate-100/50 dark:bg-slate-950 transition-colors">
            {processedTasks.map(task => {
               const isMyOrder = task.requester === loggedInUser.name;
               const isUnread = (task.unreadBy || []).includes(loggedInUser.name);
               const stepIdx = task.currentStep || 0;

               let cardStyle = "bg-white border-transparent hover:border-slate-300 dark:bg-slate-900 dark:border-slate-800 dark:hover:border-slate-600 dark:hover:bg-slate-800 shadow-sm dark:shadow-none"; 
               if (selectedTaskId === task.id) cardStyle = "bg-blue-600 border-blue-700 dark:bg-slate-800 dark:border-blue-500 shadow-xl dark:shadow-[0_0_20px_rgba(59,130,246,0.3)] -translate-y-1";
               else if (isMyOrder) cardStyle = "bg-amber-50 border-amber-200 hover:border-amber-300 dark:bg-slate-900 dark:border-amber-500/40 dark:hover:border-amber-500 dark:shadow-[0_0_10px_rgba(245,158,11,0.1)]";

               return (
                <div key={task.id} onClick={() => setSelectedTaskId(task.id)} className={`p-4 rounded-2xl border-2 dark:border cursor-pointer relative group transition-all duration-200 ${cardStyle}`}>
                  {isUnread && <span className="absolute top-4 left-2 w-3 h-3 bg-green-500 dark:bg-lime-500 rounded-full border-2 border-white dark:border-slate-900 dark:shadow-[0_0_10px_#a3e635] animate-pulse"></span>}
                  {renderGauge(stepIdx, task.hasIssue)}
                  <div className="flex justify-between items-start mb-2 mt-2">
                    <h3 className={`text-sm leading-tight pr-6 line-clamp-2 ${selectedTaskId === task.id ? 'text-white font-black' : (isUnread ? 'text-slate-900 dark:text-white font-black' : 'text-slate-800 dark:text-slate-300 font-bold')}`}>{task.topic}</h3>
                    {loggedInUser.role === 'Admin' && <button onClick={e => deleteTask(task.id, e)} className="text-red-400 hover:text-red-600 dark:text-rose-500 dark:hover:text-rose-400 opacity-0 group-hover:opacity-100 p-1"><Trash2 className="w-4 h-4"/></button>}
                  </div>
                  <div className={`flex justify-between items-center mt-3 pt-3 border-t ${selectedTaskId === task.id ? 'border-white/20' : 'border-slate-200 dark:border-slate-700/50'}`}>
                    <div className={`text-[10px] font-black uppercase tracking-tight flex items-center gap-1 ${task.hasIssue ? 'text-red-500 dark:text-rose-500 animate-pulse' : (selectedTaskId === task.id ? 'text-white' : steps[stepIdx].text)}`}>
                        {task.hasIssue ? <AlertTriangle className="w-3.5 h-3.5"/> : steps[stepIdx].icon} {task.hasIssue ? 'CRITICAL ISSUE!' : steps[stepIdx].label}
                    </div>
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-md border tracking-wider ${selectedTaskId === task.id ? 'bg-white/20 border-transparent text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-transparent dark:border-slate-700'}`}>🏁 {task.dueDate}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ห้องแชทฝั่งขวา */}
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
                  </div>
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  {selectedTask.requester === loggedInUser.name && <button onClick={archiveTask} className="bg-slate-900 dark:bg-lime-600 text-white dark:text-black px-4 py-2.5 rounded-xl text-xs font-black shadow-lg dark:shadow-[0_0_15px_rgba(132,204,22,0.4)] hover:bg-black dark:hover:bg-lime-500 transition-all flex items-center justify-center gap-1.5 uppercase italic"><Flag className="w-3.5 h-3.5"/> FINISH</button>}
                  <button onClick={reportIssue} disabled={selectedTask.hasIssue || selectedTask.currentStep >= 3} className="px-4 py-2.5 rounded-xl text-xs font-black border border-red-200 dark:border-rose-500/50 text-red-500 dark:text-rose-500 bg-red-50 dark:bg-rose-500/10 hover:bg-red-100 dark:hover:bg-rose-500/20 disabled:opacity-30 uppercase italic flex items-center justify-center gap-1.5 transition-all"><AlertTriangle className="w-3.5 h-3.5"/> PIT STOP</button>
                </div>
              </div>
              <div className="space-y-4 pt-2">
                <div>
                   <div className="flex justify-between items-end mb-1"><span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Global Progress</span><span className={`text-xs font-black italic uppercase ${selectedTask.hasIssue ? 'text-red-500 dark:text-rose-500 animate-pulse' : steps[selectedTask.currentStep||0].text}`}>{selectedTask.hasIssue ? 'MALFUNCTION' : steps[selectedTask.currentStep||0].label}</span></div>
                   {renderGauge(selectedTask.currentStep||0, selectedTask.hasIssue)}
                </div>
                <div className="bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-200 dark:border-slate-800 transition-colors">
                  <div className="flex justify-between items-center mb-3 px-1">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Driver Sync</span>
                    <button onClick={() => setIsAddPersonModalOpen(true)} className="p-1.5 bg-white dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg border border-slate-200 dark:border-blue-500/30 hover:bg-slate-100 dark:hover:bg-blue-800/50 transition-all shadow-sm"><UserPlus className="w-4 h-4"/></button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(selectedTask.relatedPersons || []).map((p: string) => {
                      const pStep = selectedTask.individualStatus?.[p] || 0;
                      const isMe = p === loggedInUser.name;
                      return (
                        <div key={p} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-black transition-all ${isMe ? 'bg-white dark:bg-slate-800 border-blue-400 dark:border-blue-500 text-slate-800 dark:text-white shadow-md' : 'bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400'}`}>
                          <span>{p}</span>
                          <div className={`flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-black uppercase ${steps[pStep]?.color || 'bg-slate-400 dark:bg-slate-700'} text-white`}>
                            {steps[pStep]?.icon || <Info className="w-3 h-3"/>} {steps[pStep]?.label}
                          </div>
                          {isMe && pStep < 3 && <button onClick={advanceMyStep} className="bg-blue-600 text-white px-2 py-1 rounded shadow-sm hover:bg-blue-700 dark:hover:bg-blue-500 transition-all uppercase text-[9px] italic ml-1">BOOST ⚡</button>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-5 bg-transparent z-10 transition-colors">
              {(chats[selectedTaskId!] || []).map((c: any) => {
                const isMe = c.sender === loggedInUser.name;
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

      {/* --- MODALS --- */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
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

      {isAddPersonModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-[100]">
          <div className="bg-white dark:bg-slate-900 rounded-[2rem] w-full max-w-xs p-6 shadow-2xl border-t-8 border-indigo-600 dark:border-t-0 dark:border dark:border-slate-700 transition-colors">
            <h3 className="font-black text-xl mb-4 flex items-center gap-2 italic uppercase text-slate-800 dark:text-white"><UserPlus className="w-6 h-6 text-indigo-600 dark:text-blue-500"/> Add Driver</h3>
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {(settings?.users || []).filter(u => !(selectedTask?.relatedPersons || []).includes(u)).map((u: string) => (
                <button key={u} onClick={()=>{addPersonToTask(u); setIsAddPersonModalOpen(false);}} className="w-full text-left p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 hover:border-indigo-400 dark:hover:border-blue-500 hover:bg-indigo-50 transition-all font-bold text-slate-700 dark:text-slate-300 flex justify-between items-center uppercase tracking-tight group">{u} <Plus className="w-4 h-4 opacity-0 group-hover:opacity-100 text-blue-500"/></button>
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
              <button onClick={()=>{confirmModal.onConfirm(); setConfirmModal({...confirmModal, isOpen:false});}} className={`flex-1 p-4 text-white font-black rounded-xl uppercase text-[10px] tracking-widest transition-all ${confirmModal.type==='danger'?'bg-red-600 dark:bg-rose-600':'bg-blue-600 dark:bg-blue-600'}`}>Confirm</button>
            </div>
          </div>
        </div>
      )}

      {toastMsg && <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-slate-900 dark:bg-blue-600 text-white px-8 py-4 rounded-xl font-black text-xs shadow-2xl z-[300] animate-in slide-in-from-bottom-10 flex items-center gap-3 tracking-widest italic uppercase"><Zap className="w-4 h-4 text-white"/> {toastMsg}</div>}
    </div>
  );
}