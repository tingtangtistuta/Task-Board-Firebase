import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, query, orderBy, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from './firebase'; 
import { 
  Search, CheckCircle2, Clock, 
  Paperclip, Send, AlertTriangle, ArrowLeft,
  MessageSquare, LayoutList, User, Plus, Loader2, LogOut, X, Package, Archive, CalendarDays, Trash2, Users, Info
} from 'lucide-react';

const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbym2Jl1qlXHqaNJq7S0TbhhsXegSDAPwIzf7h8_q08rOkkyY60G4UWy_NeHVsFIenCO/exec';

export default function App() {
  const [loggedInUser, setLoggedInUser] = useState<any>(null);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  
  // 🟢 State สำหรับหน้าต่างยืนยัน (Custom Confirm Dialog)
  const [confirmModal, setConfirmModal] = useState<{isOpen: boolean, title: string, text: string, type: 'danger' | 'warning' | 'info', onConfirm: () => void}>({
    isOpen: false, title: '', text: '', type: 'info', onConfirm: () => {}
  });
  
  const [settings, setSettings] = useState({ users: [] });
  const [tasks, setTasks] = useState<any[]>([]);
  const [chats, setChats] = useState<any>({});
  
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const selectedTask = tasks.find(t => t.id === selectedTaskId) || null;

  const [chatInput, setChatInput] = useState('');
  const [chatFile, setChatFile] = useState<File | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newTask, setNewTask] = useState({ topic: '', documentNo: '', details: '', relatedPersons: [] as string[], dueDate: '' });

  const steps = ['รอรับงาน', 'รับเรื่องแล้ว', 'กำลังดำเนินการ', 'เสร็จสิ้น'];

  const showToast = (msg: string) => { setToastMsg(msg); setTimeout(() => setToastMsg(''), 4000); };

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
        showToast(`ยินดีต้อนรับคุณ ${result.user.name}`);
      } else { showToast('❌ รหัสผ่านไม่ถูกต้อง'); }
    } catch { showToast('❌ เชื่อมต่อ Google Sheets ไม่ได้'); }
    setIsLoading(false);
  };

  const handleCreateTask = async (e: any) => {
    e.preventDefault();
    if (!newTask.topic || newTask.relatedPersons.length === 0 || !newTask.dueDate) return showToast('กรุณากรอก หัวข้อเรื่อง, วันที่กำหนดเสร็จ และเลือกผู้เกี่ยวข้อง');
    setIsLoading(true);
    try {
      const initialIndividualStatus: any = {};
      newTask.relatedPersons.forEach(person => { initialIndividualStatus[person] = 0; });

      const docRef = await addDoc(collection(db, 'tasks'), {
        topic: newTask.topic,
        documentNo: newTask.documentNo,
        details: newTask.details,
        dueDate: newTask.dueDate,
        requester: loggedInUser.name,
        relatedPersons: newTask.relatedPersons,
        individualStatus: initialIndividualStatus,
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
    
    await addDoc(collection(db, 'tasks', selectedTaskId, 'chats'), { sender: loggedInUser.name, text: txt, fileUrl, fileName, timestamp: serverTimestamp(), isSystem: false });
    await updateDoc(doc(db, 'tasks', selectedTaskId), { lastActivity: serverTimestamp() });
    
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

    const updates: any = { 
      individualStatus: newIndividualStatus,
      lastActivity: serverTimestamp()
    };
    
    let globalStepChanged = false;
    if (globalMinStep > selectedTask.currentStep) {
      updates.currentStep = globalMinStep;
      updates.hasIssue = false;
      globalStepChanged = true;
    }

    await updateDoc(doc(db, 'tasks', selectedTaskId), updates);
    await addDoc(collection(db, 'tasks', selectedTaskId, 'chats'), { sender: 'System', text: `👤 ${loggedInUser.name} เปลี่ยนสถานะส่วนตัวเป็น: ${steps[myNextStep]}`, timestamp: serverTimestamp(), isSystem: true });
    
    if (globalStepChanged) {
      await addDoc(collection(db, 'tasks', selectedTaskId, 'chats'), { sender: 'System', text: `🌟 [สถานะงานหลัก] ทุกคนดำเนินการถึงขั้น: ${steps[globalMinStep]}`, timestamp: serverTimestamp(), isSystem: true });
      showToast(`สถานะหลักของงานถูกเลื่อนเป็น "${steps[globalMinStep]}" แล้ว`);
    } else {
      showToast(`อัปเดตสถานะส่วนตัวของคุณเรียบร้อย`);
    }
  };

  const reportIssue = async () => {
    if (!selectedTask || !selectedTaskId) return;
    await updateDoc(doc(db, 'tasks', selectedTaskId), { hasIssue: true, lastActivity: serverTimestamp() });
    await addDoc(collection(db, 'tasks', selectedTaskId, 'chats'), { sender: 'System', text: `⚠️ ${loggedInUser.name} แจ้งว่างานนี้ "ติดปัญหา"`, timestamp: serverTimestamp(), isSystem: true });
  };

  // 🟢 อัปเกรด: ใช้หน้าต่างยืนยันแทน window.confirm
  const revertStep = async (targetStep: number) => {
    if (!selectedTask || !selectedTaskId || targetStep >= selectedTask.currentStep) return;
    
    setConfirmModal({
      isOpen: true,
      title: 'ย้อนสถานะงาน',
      text: `คุณแน่ใจหรือไม่ว่าต้องการดึงสถานะงานหลักกลับไปที่: "${steps[targetStep]}" ?`,
      type: 'warning',
      onConfirm: async () => {
        await updateDoc(doc(db, 'tasks', selectedTaskId), { currentStep: targetStep, hasIssue: false });
        await addDoc(collection(db, 'tasks', selectedTaskId, 'chats'), { sender: 'System', text: `⏪ ${loggedInUser.name} ดึงสถานะงานกลับไปที่: ${steps[targetStep]}`, timestamp: serverTimestamp(), isSystem: true });
      }
    });
  };

  const archiveTask = async () => {
    if (!selectedTask || !selectedTaskId) return;
    if (selectedTask.requester !== loggedInUser.name) return showToast('❌ ผู้สั่งงานเท่านั้นที่สามารถปิดงานนี้ได้');
    
    setConfirmModal({
      isOpen: true,
      title: 'ปิดจ๊อบถาวร',
      text: 'คุณกำลังจะปิดงานนี้และนำออกจากคิวงานของทุกคน คุณแน่ใจหรือไม่?',
      type: 'info',
      onConfirm: async () => {
        await updateDoc(doc(db, 'tasks', selectedTaskId), { isArchived: true, lastActivity: serverTimestamp() });
        await addDoc(collection(db, 'tasks', selectedTaskId, 'chats'), { sender: 'System', text: `📁 ${loggedInUser.name} ปิดจ๊อบและเก็บงานนี้เข้าคลังประวัติแล้ว`, timestamp: serverTimestamp(), isSystem: true });
        setSelectedTaskId(null);
        showToast('📁 เก็บงานเข้าคลังประวัติเรียบร้อย');
      }
    });
  };

  const deleteTask = async (taskId: string, e: any) => {
    e.stopPropagation(); 
    if (loggedInUser.role !== 'Admin') return showToast('❌ คุณไม่มีสิทธิ์ลบงาน');
    
    setConfirmModal({
      isOpen: true,
      title: 'ลบงานถาวร',
      text: '🚨 คำเตือน: คุณกำลังจะลบงานนี้พร้อมประวัติแชททั้งหมดออกจากฐานข้อมูลถาวร (ไม่สามารถกู้คืนได้) ยืนยันการลบหรือไม่?',
      type: 'danger',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'tasks', taskId));
          if (selectedTaskId === taskId) setSelectedTaskId(null);
          showToast('🗑️ ลบงานออกจากระบบถาวรแล้ว');
        } catch { showToast('❌ เกิดข้อผิดพลาดในการลบงาน'); }
      }
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

  const visibleTasks = tasks.filter(t => 
    !t.isArchived && 
    (t.topic.toLowerCase().includes(searchQuery.toLowerCase()) || (t.documentNo && t.documentNo.toLowerCase().includes(searchQuery.toLowerCase())))
  );

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans relative">
      <header className="bg-blue-900 text-white p-4 shadow-md flex justify-between items-center shrink-0">
        <h1 className="font-bold">STP Live Task</h1>
        <div className="flex items-center gap-3">
          <div className="text-right"><div className="text-xs font-bold">{loggedInUser.name}</div><div className="text-[10px] text-blue-300">{loggedInUser.role}</div></div>
          <button onClick={() => { localStorage.removeItem('stp_user_session'); setLoggedInUser(null); }} className="bg-blue-800 p-2 rounded-lg hover:bg-blue-700"><LogOut className="w-4 h-4"/></button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel: Task Queue */}
        <div className={`w-full md:w-1/3 bg-white border-r flex flex-col ${selectedTaskId ? 'hidden md:flex' : 'flex'}`}>
          <div className="p-4 bg-slate-50 border-b">
            <div className="flex justify-between items-center mb-3">
              <h2 className="font-bold text-slate-700">ห้องสนทนางาน ({visibleTasks.length})</h2>
              <button onClick={() => setIsModalOpen(true)} className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 hover:bg-green-700"><Plus className="w-4 h-4"/> สร้างงาน</button>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input type="text" placeholder="ค้นหาชื่องาน, เลขที่เอกสาร..." className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {visibleTasks.map(task => {
               const isRelated = task.relatedPersons?.includes(loggedInUser.name) || task.requester === loggedInUser.name || loggedInUser.role === 'Admin';
               if (!isRelated) return null; 

               return (
                <div key={task.id} onClick={() => setSelectedTaskId(task.id)} className={`p-3 rounded-xl border cursor-pointer relative group ${selectedTaskId === task.id ? 'bg-blue-50 border-blue-300' : 'bg-white hover:border-slate-300'}`}>
                  {loggedInUser.role === 'Admin' && (
                    <button onClick={(e) => deleteTask(task.id, e)} className="absolute top-2 right-2 p-1.5 bg-red-50 text-red-400 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-100 hover:text-red-600"><Trash2 className="w-3.5 h-3.5"/></button>
                  )}
                  <h3 className="font-bold text-sm truncate pr-8 text-slate-800">{task.topic}</h3>
                  <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-1"><Users className="w-3 h-3"/> {task.relatedPersons?.length || 0} ผู้เกี่ยวข้อง</div>
                  <div className="mt-2 flex justify-between items-end">
                    <span className="text-[9px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-bold">กำหนด: {task.dueDate}</span>
                    {task.hasIssue ? <span className="text-[10px] text-red-500 font-bold animate-pulse">⚠️ ติดปัญหา</span> : <span className="text-[10px] text-blue-600 font-bold">{steps[task.currentStep]}</span>}
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
                  <div className="text-xs text-slate-500 flex gap-4 mt-1">
                    <span>สั่งโดย: {selectedTask.requester}</span>
                    <span>กำหนดเสร็จ: <span className="font-bold text-indigo-600">{selectedTask.dueDate}</span></span>
                  </div>
                </div>
                <div className="flex gap-2">
                   <button onClick={reportIssue} disabled={selectedTask.hasIssue || selectedTask.currentStep >= 3} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 disabled:opacity-50">แจ้งปัญหา</button>
                   
                   {selectedTask.requester === loggedInUser.name && (
                     <button onClick={archiveTask} className="bg-slate-800 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 hover:bg-black"><Archive className="w-3 h-3"/> ปิดถาวร</button>
                   )}
                </div>
              </div>

              <div className="mb-4">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">ความคืบหน้าภาพรวม (รอทุกคนอัปเดต)</div>
                <div className="flex justify-between px-1">
                  {steps.map((s, i) => (
                    <div key={i} className={`h-2 flex-1 mx-0.5 rounded-full ${i <= selectedTask.currentStep ? (selectedTask.hasIssue && i === selectedTask.currentStep ? 'bg-red-500 animate-pulse' : 'bg-green-500') : 'bg-slate-200'}`} title={s}></div>
                  ))}
                </div>
                <div className="flex justify-between px-1 mt-1">
                  {steps.map((s, i) => <span key={i} className={`text-[9px] font-bold ${i <= selectedTask.currentStep ? 'text-slate-800' : 'text-slate-400'}`}>{s}</span>)}
                </div>
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div className="text-[10px] font-bold text-slate-500 mb-2">สถานะผู้เกี่ยวข้องรายบุคคล:</div>
                <div className="flex flex-wrap gap-2">
                  {selectedTask.relatedPersons?.map((person: string) => {
                    const personStep = selectedTask.individualStatus?.[person] || 0;
                    const isMe = person === loggedInUser.name;
                    return (
                      <div key={person} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border text-xs ${isMe ? 'bg-blue-50 border-blue-200 shadow-sm' : 'bg-white border-slate-200'}`}>
                        <span className="font-bold text-slate-700">{person}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${personStep === 3 ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>{steps[personStep]}</span>
                        {isMe && personStep < 3 && (
                          <button onClick={advanceMyStep} className="bg-blue-600 text-white text-[9px] px-2 py-1 rounded hover:bg-blue-700 font-bold transition-colors">อัปเดตสถานะฉัน</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {(chats[selectedTaskId!] || []).map((c: any) => (
                <div key={c.id} className={`flex flex-col ${c.isSystem ? 'items-center' : (c.sender === loggedInUser.name ? 'items-end' : 'items-start')}`}>
                  {c.isSystem ? (
                    <span className="text-[9px] bg-slate-200/60 px-3 py-1.5 rounded-full text-slate-600 font-bold border border-slate-300">{c.text}</span>
                  ) : (
                    <>
                      <span className="text-[8px] text-slate-400 mb-0.5">{c.sender}</span>
                      <div className={`p-3 rounded-2xl text-sm max-w-[80%] shadow-sm ${c.sender === loggedInUser.name ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-white border rounded-tl-none text-slate-800'}`}>
                        {c.fileUrl && (
                          <a href={c.fileUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 mb-2 bg-black/10 p-2 rounded-lg text-[10px] font-bold hover:bg-black/20">
                            <Package className="w-4 h-4"/> {c.fileName || 'ดูไฟล์แนบ'}
                          </a>
                        )}
                        {c.text && <span className="whitespace-pre-wrap leading-relaxed">{c.text}</span>}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>

            <form onSubmit={handleSendMessage} className="p-3 bg-white border-t flex flex-col gap-2 z-10">
              {chatFile && <div className="text-[10px] bg-blue-50 p-2 rounded-xl flex justify-between items-center font-bold text-blue-700 border border-blue-200"><span>📎 {chatFile.name}</span><button type="button" onClick={() => setChatFile(null)} className="p-1 hover:bg-blue-100 rounded-full"><X className="w-3 h-3"/></button></div>}
              <div className="flex gap-2">
                <label className="p-3 bg-slate-100 rounded-xl cursor-pointer hover:bg-slate-200 transition-colors"><Paperclip className="w-5 h-5 text-slate-500"/><input type="file" className="hidden" onChange={e => e.target.files && setChatFile(e.target.files[0])}/></label>
                <input type="text" className="flex-1 bg-slate-50 border border-slate-200 px-4 rounded-xl outline-none text-sm focus:ring-2 focus:ring-blue-500" placeholder="พิมพ์คุยงานที่นี่..." value={chatInput} onChange={e => setChatInput(e.target.value)}/>
                <button type="submit" disabled={isUploading} className="p-3 bg-blue-600 text-white rounded-xl shadow-md hover:bg-blue-700 disabled:opacity-50 min-w-[48px] flex justify-center items-center">{isUploading ? <Loader2 className="w-5 h-5 animate-spin"/> : <Send className="w-5 h-5"/>}</button>
              </div>
            </form>
          </div>
        ) : (
          <div className="hidden md:flex flex-1 flex-col items-center justify-center text-slate-300 bg-slate-50">
            <MessageSquare className="w-20 h-20 mb-4 opacity-20"/>
            <p className="font-bold text-lg text-slate-400">เลือกห้องสนทนางานเพื่ออัปเดตสถานะ</p>
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <form onSubmit={handleCreateTask} className="bg-white rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b pb-3">
              <h2 className="font-black text-xl text-slate-800">สร้างกลุ่มงานใหม่</h2>
              <button type="button" className="p-1.5 hover:bg-slate-100 rounded-xl text-slate-400" onClick={() => setIsModalOpen(false)}><X className="w-5 h-5"/></button>
            </div>
            
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">หัวข้อเรื่อง / งาน (Topic)</label>
              <input type="text" placeholder="พิมพ์ชื่องานสั้นๆ ที่เข้าใจง่าย..." className="w-full p-3 border border-slate-200 rounded-xl text-sm font-bold text-blue-800 outline-none focus:ring-2 focus:ring-blue-500" value={newTask.topic} onChange={e => setNewTask({...newTask, topic: e.target.value})} autoFocus/>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-black text-indigo-500 uppercase mb-1 block">📅 วันที่คาดว่างานจะเสร็จ</label>
                <input type="date" className="w-full p-2.5 border border-indigo-200 rounded-xl bg-indigo-50 text-sm font-bold text-indigo-800 outline-none focus:ring-2 focus:ring-indigo-500" value={newTask.dueDate} onChange={e => setNewTask({...newTask, dueDate: e.target.value})}/>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">เลขอ้างอิง (ถ้ามี)</label>
                <input type="text" placeholder="ใบส่งของ / บิล" className="w-full p-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500" value={newTask.documentNo} onChange={e => setNewTask({...newTask, documentNo: e.target.value})}/>
              </div>
            </div>

            <textarea placeholder="รายละเอียดเพิ่มเติม อธิบายโจทย์ให้ผู้เกี่ยวข้องทราบ..." className="w-full p-3 border border-slate-200 rounded-xl text-sm h-20 resize-none outline-none focus:ring-2 focus:ring-blue-500" value={newTask.details} onChange={e => setNewTask({...newTask, details: e.target.value})}/>
            
            <div>
              <label className="text-[10px] font-black text-blue-600 uppercase mb-2 block">👥 เลือกผู้เกี่ยวข้องในงานนี้</label>
              <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto border-2 border-blue-100 p-2.5 rounded-xl bg-blue-50/50">
                {settings.users.map((u: string) => (
                  <label key={u} className="flex items-center gap-2 text-xs font-bold cursor-pointer hover:bg-blue-100 p-1.5 rounded-lg transition-colors text-slate-700">
                    <input type="checkbox" className="rounded text-blue-600 focus:ring-blue-500" checked={newTask.relatedPersons.includes(u)} onChange={e => { if(e.target.checked) setNewTask({...newTask, relatedPersons: [...newTask.relatedPersons, u]}); else setNewTask({...newTask, relatedPersons: newTask.relatedPersons.filter(n => n !== u)})}}/> {u}
                  </label>
                ))}
              </div>
            </div>
            
            <button type="submit" disabled={isLoading} className="w-full bg-blue-600 text-white p-3.5 rounded-xl font-bold shadow-lg hover:bg-blue-700 disabled:opacity-50 flex justify-center items-center gap-2">
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin"/> : <Send className="w-5 h-5"/>} สร้างห้องสนทนางาน
            </button>
          </form>
        </div>
      )}

      {/* 🟢 ส่วนของ Custom Confirm Modal ที่สร้างใหม่ */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100] animate-in fade-in">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl">
            <h3 className={`text-lg font-black mb-2 flex items-center gap-2 ${confirmModal.type === 'danger' ? 'text-red-600' : 'text-slate-800'}`}>
              {confirmModal.type === 'danger' && <AlertTriangle className="w-5 h-5"/>}
              {confirmModal.type === 'info' && <Info className="w-5 h-5 text-blue-600"/>}
              {confirmModal.title}
            </h3>
            <p className="text-sm text-slate-600 mb-6 leading-relaxed">{confirmModal.text}</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmModal({ ...confirmModal, isOpen: false })} className="px-4 py-2.5 text-slate-500 font-bold hover:bg-slate-100 rounded-xl transition-colors text-sm">
                ยกเลิก
              </button>
              <button 
                onClick={() => { confirmModal.onConfirm(); setConfirmModal({ ...confirmModal, isOpen: false }); }} 
                className={`px-5 py-2.5 text-white font-bold rounded-xl shadow-md transition-colors text-sm ${confirmModal.type === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}
              >
                ยืนยัน
              </button>
            </div>
          </div>
        </div>
      )}

      {toastMsg && <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-slate-800 text-white px-6 py-3 rounded-full text-sm font-bold shadow-2xl z-[100] flex items-center gap-2 animate-in fade-in slide-in-from-bottom-5 border border-slate-700"><CheckCircle2 className="w-4 h-4 text-green-400"/> {toastMsg}</div>}
    </div>
  );
}