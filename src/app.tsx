import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, query, orderBy, deleteDoc, setDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from './firebase'; 
import { 
  Search, CheckCircle2, Clock, 
  Paperclip, Send, AlertTriangle, ArrowLeft,
  MessageSquare, LayoutList, User, Plus, Loader2, LogOut, X, Package, Archive, CalendarDays, Trash2, Users, Info, UserPlus
} from 'lucide-react';

const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbym2Jl1qlXHqaNJq7S0TbhhsXegSDAPwIzf7h8_q08rOkkyY60G4UWy_NeHVsFIenCO/exec';

export default function App() {
  const [loggedInUser, setLoggedInUser] = useState<any>(null);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  
  const [confirmModal, setConfirmModal] = useState<{isOpen: boolean, title: string, text: string, type: 'danger' | 'warning' | 'info', onConfirm: () => void}>({
    isOpen: false, title: '', text: '', type: 'info', onConfirm: () => {}
  });
  
  const [settings, setSettings] = useState({ users: [] });
  const [tasks, setTasks] = useState<any[]>([]);
  const [chats, setChats] = useState<any>({});
  const [userPresence, setUserPresence] = useState<any>({});
  
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const selectedTask = tasks.find(t => t.id === selectedTaskId) || null;

  const [chatInput, setChatInput] = useState('');
  const [chatFile, setChatFile] = useState<File | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAddPersonModalOpen, setIsAddPersonModalOpen] = useState(false); // 🟢 เพิ่มคนกลางคัน
  const [newTask, setNewTask] = useState({ topic: '', documentNo: '', details: '', relatedPersons: [] as string[], dueDate: '' });

  const steps = ['รอรับงาน', 'รับเรื่องแล้ว', 'กำลังดำเนินการ', 'เสร็จสิ้น'];

  const showToast = (msg: string) => { setToastMsg(msg); setTimeout(() => setToastMsg(''), 4000); };

  // 🟢 1. ระบบจัดการการอ่าน (Mark as Read)
  useEffect(() => {
    if (selectedTaskId && loggedInUser) {
      const taskRef = doc(db, 'tasks', selectedTaskId);
      updateDoc(taskRef, {
        unreadBy: arrayRemove(loggedInUser.name)
      });
    }
  }, [selectedTaskId, loggedInUser]);

  useEffect(() => {
    const fetchMasterData = async () => {
      try {
        const res = await fetch(WEB_APP_URL);
        const text = await res.text();
        const data = JSON.parse(text);
        if (data.settings) setSettings({ users: data.settings.users || [] });
      } catch (error) { console.error("Sheets Error:", error); }
    };
    const savedUser = localStorage.getItem('stp_user_session');
    if (savedUser) setLoggedInUser(JSON.parse(savedUser)); 
    fetchMasterData();
  }, []);

  useEffect(() => {
    if (!loggedInUser) return;
    const userRef = doc(db, 'presence', loggedInUser.name);
    setDoc(userRef, { isOnline: true, lastSeen: serverTimestamp() }, { merge: true });
    const handleBeforeUnload = () => { updateDoc(userRef, { isOnline: false, lastSeen: serverTimestamp() }); };
    window.addEventListener('beforeunload', handleBeforeUnload);
    const unsubscribePresence = onSnapshot(collection(db, 'presence'), (snapshot) => {
      const presenceData: any = {};
      snapshot.forEach(doc => { presenceData[doc.id] = doc.data(); });
      setUserPresence(presenceData);
    });
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      updateDoc(userRef, { isOnline: false, lastSeen: serverTimestamp() });
      unsubscribePresence();
    };
  }, [loggedInUser]);

  useEffect(() => {
    if (!loggedInUser) return;
    const q = query(collection(db, 'tasks'), orderBy('lastActivity', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const tasksData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTasks(tasksData);
    });
    return () => unsubscribe();
  }, [loggedInUser]);

  useEffect(() => {
    if (!selectedTaskId) return;
    const q = query(collection(db, 'tasks', selectedTaskId, 'chats'), orderBy('timestamp', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const chatData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setChats((prev: any) => ({ ...prev, [selectedTaskId]: chatData }));
    });
    return () => unsubscribe();
  }, [selectedTaskId]);

  const handleLogin = async (e: any) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const res = await fetch(WEB_APP_URL, { method: 'POST', body: JSON.stringify({ action: 'LOGIN', ...loginForm }) });
      const result = await res.json();
      if (result.status === 'success') {
        localStorage.setItem('stp_user_session', JSON.stringify(result.user));
        setLoggedInUser(result.user);
      } else { showToast('❌ รหัสผ่านไม่ถูกต้อง'); }
    } catch { showToast('❌ เชื่อมต่อ Google Sheets ไม่ได้'); }
    setIsLoading(false);
  };

  const handleLogout = async () => {
    if (loggedInUser) await updateDoc(doc(db, 'presence', loggedInUser.name), { isOnline: false, lastSeen: serverTimestamp() });
    localStorage.removeItem('stp_user_session'); setLoggedInUser(null);
  };

  const handleCreateTask = async (e: any) => {
    e.preventDefault();
    if (!newTask.topic || newTask.relatedPersons.length === 0 || !newTask.dueDate) return showToast('กรุณากรอกข้อมูลให้ครบถ้วน');
    setIsLoading(true);
    try {
      const initialIndividualStatus: any = {};
      newTask.relatedPersons.forEach(person => { initialIndividualStatus[person] = 0; });
      
      // ทุกคนยกเว้นคนสร้าง จะเห็นเป็น Unread
      const unreadList = [...newTask.relatedPersons].filter(p => p !== loggedInUser.name);

      const docRef = await addDoc(collection(db, 'tasks'), {
        topic: newTask.topic,
        documentNo: newTask.documentNo,
        details: newTask.details,
        dueDate: newTask.dueDate,
        requester: loggedInUser.name,
        relatedPersons: newTask.relatedPersons,
        individualStatus: initialIndividualStatus,
        unreadBy: unreadList,
        currentStep: 0,
        hasIssue: false,
        isArchived: false,
        createdAt: serverTimestamp(),
        lastActivity: serverTimestamp() 
      });
      await addDoc(collection(db, 'tasks', docRef.id, 'chats'), { sender: 'System', text: `🆕 สร้างงานใหม่โดย ${loggedInUser.name}`, timestamp: serverTimestamp(), isSystem: true });
      showToast('✅ สร้างงานสำเร็จ!');
      setIsModalOpen(false);
      setNewTask({ topic: '', documentNo: '', details: '', relatedPersons: [], dueDate: '' });
    } catch { showToast('❌ สร้างงานล้มเหลว'); }
    setIsLoading(false);
  };

  const handleSendMessage = async (e: any) => {
    e.preventDefault();
    if ((!chatInput.trim() && !chatFile) || !selectedTaskId || isUploading) return;
    setIsUploading(true);
    let fileUrl = null;
    let fileName = null;
    if (chatFile) {
      const fileRef = ref(storage, `uploads/${selectedTaskId}/${Date.now()}_${chatFile.name}`);
      await uploadBytes(fileRef, chatFile);
      fileUrl = await getDownloadURL(fileRef);
      fileName = chatFile.name;
    }
    const txt = chatInput;
    setChatInput(''); setChatFile(null);
    
    // 🟢 แจ้งเตือนทุกคนในกลุ่ม
    const notifyList = [...selectedTask.relatedPersons, selectedTask.requester].filter(p => p !== loggedInUser.name);

    await addDoc(collection(db, 'tasks', selectedTaskId, 'chats'), { sender: loggedInUser.name, text: txt, fileUrl, fileName, timestamp: serverTimestamp(), isSystem: false });
    await updateDoc(doc(db, 'tasks', selectedTaskId), { 
      lastActivity: serverTimestamp(),
      unreadBy: arrayUnion(...notifyList)
    });
    setIsUploading(false);
  };

  const advanceMyStep = async () => {
    if (!selectedTask || !selectedTaskId) return;
    const myCurrentStep = selectedTask.individualStatus[loggedInUser.name] || 0;
    if (myCurrentStep >= 3) return;
    
    const myNextStep = myCurrentStep + 1;
    const newIndividualStatus = { ...selectedTask.individualStatus, [loggedInUser.name]: myNextStep };
    const allSteps = selectedTask.relatedPersons.map((p: string) => newIndividualStatus[p] || 0);
    const globalMinStep = Math.min(...allSteps);

    const notifyList = [...selectedTask.relatedPersons, selectedTask.requester].filter(p => p !== loggedInUser.name);

    const updates: any = { 
      individualStatus: newIndividualStatus, 
      lastActivity: serverTimestamp(),
      unreadBy: arrayUnion(...notifyList)
    };
    
    if (globalMinStep > selectedTask.currentStep) {
      updates.currentStep = globalMinStep;
      updates.hasIssue = false;
    }

    await updateDoc(doc(db, 'tasks', selectedTaskId), updates);
    await addDoc(collection(db, 'tasks', selectedTaskId, 'chats'), { sender: 'System', text: `👤 ${loggedInUser.name} เปลี่ยนสถานะส่วนตัวเป็น: ${steps[myNextStep]}`, timestamp: serverTimestamp(), isSystem: true });
  };

  // 🟢 2. ลอจิกการเพิ่มผู้เกี่ยวข้องกลางคัน
  const addPersonToTask = async (personName: string) => {
    if (!selectedTask || !selectedTaskId) return;
    if (selectedTask.relatedPersons.includes(personName)) return showToast('พนักงานคนนี้อยู่ในกลุ่มแล้ว');

    const newRelatedPersons = [...selectedTask.relatedPersons, personName];
    const newIndividualStatus = { ...selectedTask.individualStatus, [personName]: 0 };
    
    // เมื่อคนใหม่เข้ามาที่ Step 0 สถานะหลักจะถูกดึงกลับไปที่ 0 ทันที
    const updates = {
      relatedPersons: newRelatedPersons,
      individualStatus: newIndividualStatus,
      currentStep: 0, 
      lastActivity: serverTimestamp(),
      unreadBy: arrayUnion(...newRelatedPersons)
    };

    await updateDoc(doc(db, 'tasks', selectedTaskId), updates);
    await addDoc(collection(db, 'tasks', selectedTaskId, 'chats'), { 
      sender: 'System', 
      text: `➕ ${loggedInUser.name} ดึง "${personName}" เข้ามาร่วมงาน (สถานะภาพรวมปรับเป็น: รอรับงาน)`, 
      timestamp: serverTimestamp(), 
      isSystem: true 
    });
    showToast(`ดึงคุณ ${personName} เข้าร่วมงานเรียบร้อย`);
  };

  const archiveTask = async () => {
    if (!selectedTask || !selectedTaskId) return;
    if (selectedTask.requester !== loggedInUser.name) return showToast('❌ ผู้สั่งงานเท่านั้นที่ปิดงานนี้ได้');
    setConfirmModal({
      isOpen: true, title: 'ปิดจ๊อบถาวร', text: 'ยืนยันปิดงานถาวรและเก็บเข้าคลังประวัติ?', type: 'info',
      onConfirm: async () => {
        await updateDoc(doc(db, 'tasks', selectedTaskId), { isArchived: true, lastActivity: serverTimestamp() });
        setSelectedTaskId(null);
      }
    });
  };

  const deleteTask = async (taskId: string, e: any) => {
    e.stopPropagation(); 
    if (loggedInUser.role !== 'Admin') return showToast('❌ ไม่มีสิทธิ์ลบงาน');
    setConfirmModal({
      isOpen: true, title: 'ลบงานถาวร', text: '🚨 ลบงานนี้ถาวร ยืนยันหรือไม่?', type: 'danger',
      onConfirm: async () => { await deleteDoc(doc(db, 'tasks', taskId)); if (selectedTaskId === taskId) setSelectedTaskId(null); }
    });
  };

  if (!loggedInUser) {
    return (
      <div className="min-h-screen bg-blue-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl">
          <h1 className="text-2xl font-bold text-blue-900 mb-6 text-center">STP Task Board</h1>
          <form onSubmit={handleLogin} className="space-y-4">
            <input type="text" placeholder="ชื่อผู้ใช้" className="w-full p-3 bg-slate-50 border rounded-xl outline-none" value={loginForm.username} onChange={e => setLoginForm({...loginForm, username: e.target.value})} />
            <input type="password" placeholder="รหัสผ่าน" className="w-full p-3 bg-slate-50 border rounded-xl outline-none" value={loginForm.password} onChange={e => setLoginForm({...loginForm, password: e.target.value})} />
            <button type="submit" disabled={isLoading} className="w-full bg-blue-600 text-white p-3 rounded-xl font-bold">{isLoading ? 'กำลังตรวจสอบ...' : 'เข้าสู่ระบบ'}</button>
          </form>
        </div>
      </div>
    );
  }

  const visibleTasks = tasks.filter(t => !t.isArchived && (t.topic.toLowerCase().includes(searchQuery.toLowerCase()) || (t.documentNo && t.documentNo.toLowerCase().includes(searchQuery.toLowerCase()))));

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans relative">
      <header className="bg-blue-900 text-white p-4 shadow-md flex justify-between items-center shrink-0 z-20">
        <h1 className="font-bold">STP Live Task</h1>
        <div className="flex items-center gap-3">
          <div className="text-right"><div className="text-xs font-bold">{loggedInUser.name}</div><div className="text-[10px] text-blue-300">{loggedInUser.role}</div></div>
          <button onClick={handleLogout} className="bg-blue-800 p-2 rounded-lg"><LogOut className="w-4 h-4"/></button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel: Task Queue */}
        <div className={`w-full md:w-1/3 bg-white border-r flex flex-col ${selectedTaskId ? 'hidden md:flex' : 'flex'}`}>
          <div className="bg-slate-800 text-white p-2 flex overflow-x-auto gap-3 items-center shrink-0 border-b border-slate-700">
            <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider pl-1 shrink-0">ทีมงาน:</div>
            {settings.users.map((u: string) => {
              const isOnline = userPresence[u]?.isOnline;
              return (
                <div key={u} className="flex items-center gap-1.5 shrink-0 bg-slate-700/50 px-2 py-1 rounded-full border border-slate-600">
                  <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-slate-500'}`}></span>
                  <span className={`text-[10px] font-bold ${isOnline ? 'text-white' : 'text-slate-400'}`}>{u}</span>
                </div>
              );
            })}
          </div>

          <div className="p-4 bg-slate-50 border-b">
            <div className="flex justify-between items-center mb-3">
              <h2 className="font-bold text-slate-700">คิวงาน ({visibleTasks.length})</h2>
              <button onClick={() => setIsModalOpen(true)} className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1"><Plus className="w-4 h-4"/> สร้างงาน</button>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input type="text" placeholder="ค้นหา..." className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {visibleTasks.map(task => {
               const isRelated = task.relatedPersons?.includes(loggedInUser.name) || task.requester === loggedInUser.name || loggedInUser.role === 'Admin';
               if (!isRelated) return null; 
               // 🟢 ระบบจุดเขียว (Unread)
               const isUnread = task.unreadBy?.includes(loggedInUser.name);

               return (
                <div key={task.id} onClick={() => setSelectedTaskId(task.id)} className={`p-3 rounded-xl border cursor-pointer relative group transition-all ${selectedTaskId === task.id ? 'bg-blue-50 border-blue-300' : 'bg-white hover:border-slate-300'}`}>
                  {isUnread && <span className="absolute top-4 left-1 w-2.5 h-2.5 bg-green-500 rounded-full shadow-[0_0_8px_rgba(34,197,94,0.8)] animate-pulse"></span>}
                  {loggedInUser.role === 'Admin' && (
                    <button onClick={(e) => deleteTask(task.id, e)} className="absolute top-2 right-2 p-1.5 bg-red-50 text-red-400 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-100 hover:text-red-600 transition-opacity"><Trash2 className="w-3.5 h-3.5"/></button>
                  )}
                  <h3 className={`text-sm truncate pr-8 ${isUnread ? 'font-black text-slate-900' : 'font-bold text-slate-700'}`}>{task.topic}</h3>
                  <div className="mt-2 flex justify-between items-end">
                    <span className="text-[9px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-bold">กำหนด: {task.dueDate}</span>
                    <span className={`text-[10px] font-bold ${task.hasIssue ? 'text-red-500 animate-pulse' : 'text-blue-600'}`}>{task.hasIssue ? '⚠️ ติดปัญหา' : steps[task.currentStep]}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Panel: Chatroom */}
        {selectedTask ? (
          <div className="flex-1 flex flex-col bg-slate-50">
            <div className="bg-white border-b p-4 shadow-sm z-10">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <button onClick={() => setSelectedTaskId(null)} className="md:hidden text-blue-600 text-xs font-bold mb-2 flex items-center gap-1"><ArrowLeft className="w-3 h-3"/> กลับ</button>
                  <h2 className="font-black text-lg text-slate-800">{selectedTask.topic}</h2>
                </div>
                <div className="flex gap-2">
                   {selectedTask.requester === loggedInUser.name && (
                     <button onClick={archiveTask} className="bg-slate-800 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 hover:bg-black"><Archive className="w-3 h-3"/> ปิดถาวร</button>
                   )}
                </div>
              </div>

              <div className="mb-4">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">ความคืบหน้าภาพรวม</div>
                <div className="flex justify-between px-1">
                  {steps.map((s, i) => <div key={i} className={`h-2 flex-1 mx-0.5 rounded-full ${i <= selectedTask.currentStep ? (selectedTask.hasIssue && i === selectedTask.currentStep ? 'bg-red-500 animate-pulse' : 'bg-green-500') : 'bg-slate-200'}`}></div>)}
                </div>
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div className="flex justify-between items-center mb-2">
                  <div className="text-[10px] font-bold text-slate-500">สถานะผู้เกี่ยวข้อง:</div>
                  {/* 🟢 ปุ่มเพิ่มคนกลางคัน */}
                  <button onClick={() => setIsAddPersonModalOpen(true)} className="p-1 bg-indigo-100 text-indigo-600 rounded hover:bg-indigo-200 transition-colors"><UserPlus className="w-3.5 h-3.5"/></button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedTask.relatedPersons?.map((person: string) => {
                    const personStep = selectedTask.individualStatus?.[person] || 0;
                    const isMe = person === loggedInUser.name;
                    return (
                      <div key={person} className={`flex items-center gap-2 px-2 py-1 rounded-lg border text-xs ${isMe ? 'bg-blue-50 border-blue-300' : 'bg-white'}`}>
                        <span className="font-bold">{person}</span>
                        <span className="text-[9px] bg-slate-100 px-1.5 py-0.5 rounded font-black uppercase">{steps[personStep]}</span>
                        {isMe && personStep < 3 && <button onClick={advanceMyStep} className="bg-blue-600 text-white text-[9px] px-2 py-0.5 rounded hover:bg-blue-700">อัปเดต</button>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-100">
              {(chats[selectedTaskId!] || []).map((c: any) => {
                const isMe = c.sender === loggedInUser.name;
                return (
                  <div key={c.id} className={`flex flex-col ${c.isSystem ? 'items-center' : (isMe ? 'items-end' : 'items-start')}`}>
                    {c.isSystem ? (
                      <span className="text-[9px] bg-slate-200/80 px-3 py-1.5 rounded-full text-slate-600 font-bold border border-slate-300 my-1">{c.text}</span>
                    ) : (
                      <>
                        <span className="text-[8px] text-slate-400 mb-0.5 px-1">{c.sender}</span>
                        <div className={`p-3 rounded-2xl text-sm max-w-[85%] shadow-sm ${isMe ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-white border border-slate-200 rounded-tl-none text-slate-800'}`}>
                          {c.fileUrl && <a href={c.fileUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 mb-2 bg-black/10 p-2 rounded-lg text-[10px] font-bold"><Package className="w-4 h-4"/> {c.fileName}</a>}
                          {c.text && <span className="whitespace-pre-wrap leading-relaxed">{c.text}</span>}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            <form onSubmit={handleSendMessage} className="p-3 bg-white border-t flex flex-col gap-2">
              {chatFile && <div className="text-[10px] bg-blue-50 p-2 rounded-xl flex justify-between font-bold text-blue-700"><span>📎 {chatFile.name}</span><X className="w-3 h-3 cursor-pointer" onClick={() => setChatFile(null)}/></div>}
              <div className="flex gap-2">
                <label className="p-3 bg-slate-100 rounded-xl cursor-pointer hover:bg-slate-200 transition-colors"><Paperclip className="w-5 h-5 text-slate-500"/><input type="file" className="hidden" onChange={e => e.target.files && setChatFile(e.target.files[0])}/></label>
                <input type="text" className="flex-1 bg-slate-50 border border-slate-200 px-4 rounded-xl outline-none text-sm" placeholder="พิมพ์คุยงาน..." value={chatInput} onChange={e => setChatInput(e.target.value)}/>
                <button type="submit" disabled={isUploading} className="p-3 bg-blue-600 text-white rounded-xl shadow-md flex items-center justify-center min-w-[48px]">{isUploading ? <Loader2 className="w-5 h-5 animate-spin"/> : <Send className="w-5 h-5"/>}</button>
              </div>
            </form>
          </div>
        ) : (
          <div className="hidden md:flex flex-1 flex-col items-center justify-center text-slate-300"><MessageSquare className="w-20 h-20 mb-4 opacity-10"/><p className="font-bold text-slate-400">เลือกห้องแชทเพื่อเริ่มงาน</p></div>
        )}
      </div>

      {/* 🟢 Modal เพิ่มคนกลางคัน */}
      {isAddPersonModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100] animate-in fade-in">
          <div className="bg-white rounded-3xl w-full max-w-xs p-6 shadow-2xl">
            <h3 className="font-black text-lg mb-4 flex items-center gap-2"><UserPlus className="w-5 h-5 text-indigo-600"/> ดึงพนักงานเพิ่ม</h3>
            <div className="max-h-60 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
              {settings.users.filter(u => !selectedTask?.relatedPersons.includes(u)).map((u: string) => (
                <button key={u} onClick={() => { addPersonToTask(u); setIsAddPersonModalOpen(false); }} className="w-full text-left p-3 rounded-xl border border-slate-100 hover:bg-indigo-50 hover:border-indigo-200 transition-all text-sm font-bold text-slate-700 flex justify-between items-center group">
                  {u} <Plus className="w-4 h-4 opacity-0 group-hover:opacity-100 text-indigo-600"/>
                </button>
              ))}
            </div>
            <button onClick={() => setIsAddPersonModalOpen(false)} className="w-full mt-4 p-2.5 text-slate-500 font-bold hover:bg-slate-100 rounded-xl transition-colors">ยกเลิก</button>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <form onSubmit={handleCreateTask} className="bg-white rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b pb-3">
              <h2 className="font-black text-xl text-slate-800">สร้างกลุ่มงานใหม่</h2>
              <X className="cursor-pointer text-slate-400" onClick={() => setIsModalOpen(false)}/>
            </div>
            <input type="text" placeholder="หัวข้อเรื่อง / งาน (Topic)" className="w-full p-3 border rounded-xl font-bold text-blue-800 outline-none" value={newTask.topic} onChange={e => setNewTask({...newTask, topic: e.target.value})} autoFocus/>
            <div className="grid grid-cols-2 gap-3">
              <input type="date" className="w-full p-2.5 border rounded-xl bg-indigo-50 text-sm font-bold text-indigo-800 outline-none" value={newTask.dueDate} onChange={e => setNewTask({...newTask, dueDate: e.target.value})}/>
              <input type="text" placeholder="เลขอ้างอิง (ถ้ามี)" className="w-full p-2.5 border rounded-xl text-sm outline-none" value={newTask.documentNo} onChange={e => setNewTask({...newTask, documentNo: e.target.value})}/>
            </div>
            <textarea placeholder="รายละเอียดเพิ่มเติม..." className="w-full p-3 border rounded-xl text-sm h-20 outline-none" value={newTask.details} onChange={e => setNewTask({...newTask, details: e.target.value})}/>
            <div>
              <label className="text-[10px] font-black text-blue-600 uppercase mb-2 block">👥 เลือกผู้เกี่ยวข้อง</label>
              <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto border-2 border-blue-100 p-2 rounded-xl bg-blue-50/50">
                {settings.users.map((u: string) => (
                  <label key={u} className="flex items-center gap-2 text-xs font-bold cursor-pointer hover:bg-blue-100 p-1.5 rounded-lg transition-colors">
                    <input type="checkbox" className="rounded" checked={newTask.relatedPersons.includes(u)} onChange={e => { if(e.target.checked) setNewTask({...newTask, relatedPersons: [...newTask.relatedPersons, u]}); else setNewTask({...newTask, relatedPersons: newTask.relatedPersons.filter(n => n !== u)})}}/> {u}
                  </label>
                ))}
              </div>
            </div>
            <button type="submit" className="w-full bg-blue-600 text-white p-3.5 rounded-xl font-bold shadow-lg">สร้างห้องสนทนางาน</button>
          </form>
        </div>
      )}

      {confirmModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100] animate-in fade-in">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl">
            <h3 className={`text-lg font-black mb-2 flex items-center gap-2 ${confirmModal.type === 'danger' ? 'text-red-600' : 'text-slate-800'}`}>{confirmModal.title}</h3>
            <p className="text-sm text-slate-600 mb-6 leading-relaxed">{confirmModal.text}</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmModal({ ...confirmModal, isOpen: false })} className="px-4 py-2.5 text-slate-500 font-bold hover:bg-slate-100 rounded-xl text-sm">ยกเลิก</button>
              <button onClick={() => { confirmModal.onConfirm(); setConfirmModal({ ...confirmModal, isOpen: false }); }} className={`px-5 py-2.5 text-white font-bold rounded-xl shadow-md text-sm ${confirmModal.type === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}>ยืนยัน</button>
            </div>
          </div>
        </div>
      )}
      {toastMsg && <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-slate-800 text-white px-6 py-3 rounded-full text-sm font-bold shadow-2xl z-[100] border border-slate-700 animate-in fade-in slide-in-from-bottom-5">{toastMsg}</div>}
    </div>
  );
}