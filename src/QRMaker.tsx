import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, updateDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from './firebase'; 
import { CheckCircle2, Clock, Loader2, ArrowLeft, Zap, Download, Filter, X } from 'lucide-react';

// --- ตั้งค่าบัญชีรับเงิน (QR Code) ---
const MAIN_ACCOUNT = {
  id: 'kbank_main',
  label: 'บัญชีกระแสรายวัน หจก. (กสิกรไทย)',
  promptpay: '0723535000789',
  bankName: 'ธ.กสิกรไทย (กระแสรายวัน)',
  accountNo: '2011030109'
};

const formatThaiDateTime = (timestamp: any) => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${(date.getFullYear() + 543).toString().slice(-2)} เวลา ${date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.`;
};

// --- Component รับ Props จาก MainApp ---
export default function QRMaker({ isOpen, onClose, loggedInUser, showToast }: { isOpen: boolean, onClose: () => void, loggedInUser: any, showToast: (msg: string) => void }) {
  const [qrMerchantName] = useState('หจก.แสงไทยพานิช(1992)');
  const [isCustomBank, setIsCustomBank] = useState(false);
  const [customBank, setCustomBank] = useState({ promptpay: '', bankName: '', accountNo: '' });
  const [batchFiles, setBatchFiles] = useState<any[]>([]);
  const [expiryDate, setExpiryDate] = useState('');
  const [expiryTime, setExpiryTime] = useState('23:59');
  const [discountPercent, setDiscountPercent] = useState<number>(0); 
  const [isQrProcessing, setIsQrProcessing] = useState(false);
  const [historyLogs, setHistoryLogs] = useState<any[]>([]);
  const [qrActiveTab, setQrActiveTab] = useState('generator');
  const [selectedCustomerBill, setSelectedCustomerBill] = useState<any>(null);
  const [showOnlyPending, setShowOnlyPending] = useState(false);
  const [displayLimit, setDisplayLimit] = useState(20);
  const [simQrData, setSimQrData] = useState('');

  // 1. โหลดไลบรารี
  useEffect(() => {
    if (!isOpen) return;
    const loadScript = (src: string) => {
      if (document.querySelector(`script[src="${src}"]`)) return;
      const script = document.createElement('script'); script.src = src; script.async = true; document.body.appendChild(script);
    };
    loadScript('https://cdn.jsdelivr.net/npm/qrcode@1.5.1/build/qrcode.min.js');
    loadScript('https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js');
    loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
  }, [isOpen]);

  // 2. ดึงประวัติบิล
  useEffect(() => {
    if (!loggedInUser || !isOpen) return;
    const unsub = onSnapshot(collection(db, 'qr_bills'), (snap) => {
      const logs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      logs.sort((a: any, b: any) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
      setHistoryLogs(logs);
    });
    return () => unsub();
  }, [loggedInUser, isOpen]);

  // 3. อัปเดตสถานะคิวงาน
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

  // 4. Simulator สร้าง QR ให้แอดมินดู
  useEffect(() => {
    if (selectedCustomerBill) {
      const qrcodeLib = (window as any).QRCode;
      const portalUrl = `${window.location.origin}?bill=${selectedCustomerBill.id}`;
      
      if (qrcodeLib) {
        qrcodeLib.toDataURL(portalUrl, { width: 400, margin: 1, color: { dark: '#000000', light: '#ffffff' } })
          .then((url: string) => setSimQrData(url))
          .catch(() => setSimQrData(''));
      }
    }
  }, [selectedCustomerBill]);

  const extractAmountFromPDF = async (file: File) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      let pdfjsLib = (window as any)['pdfjs-dist/build/pdf'] || (window as any).pdfjsLib;
      if (!pdfjsLib) {
        for (let i = 0; i < 20; i++) {
          await new Promise(r => setTimeout(r, 200));
          pdfjsLib = (window as any)['pdfjs-dist/build/pdf'] || (window as any).pdfjsLib;
          if (pdfjsLib) break;
        }
      }
      if (!pdfjsLib) return '';
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      const lastPageNum = pdf.numPages;
      const page = await pdf.getPage(lastPageNum);
      const textContent = await page.getTextContent();
      const textStr = textContent.items.map((item: any) => item.str).join('');
      const noSpaceStr = textStr.replace(/\s+/g, '');
      const regex = /รวม\/Total([\d,]+\.\d{2})/gi;
      let match; let finalAmount = '';
      while ((match = regex.exec(noSpaceStr)) !== null) { finalAmount = match[1].replace(/,/g, ''); }
      return finalAmount;
    } catch (e) { return ''; }
  };

  const getActiveAccount = () => isCustomBank ? customBank : MAIN_ACCOUNT;
  
  const handleFileUpload = async (e: any) => {
    const files = Array.from(e.target.files);
    const newItems = files.map((f: any) => ({ 
      id: Math.random().toString(36).substr(2, 9), file: f, refNo: f.name.replace(/\.pdf$/i, ''), 
      amount: '', error: null, isExtracting: true 
    }));
    setBatchFiles(prev => [...prev, ...newItems]); e.target.value = null;

    for (const item of newItems) {
      const extractedAmount = await extractAmountFromPDF(item.file);
      setBatchFiles(prev => prev.map(p => p.id === item.id ? { ...p, amount: extractedAmount, isExtracting: false } : p));
    }
  };

  const handleManualAdd = () => {
    const newItem = { id: Math.random().toString(36).substr(2, 9), file: null, refNo: `INV${new Date().getTime().toString().slice(-4)}`, amount: '', error: null, isExtracting: false };
    setBatchFiles(prev => [...prev, newItem]);
  };
  
  const removeBatchItem = (id: string) => setBatchFiles(prev => prev.filter(item => item.id !== id));
  const updateBatchItem = (id: string, field: string, value: any) => setBatchFiles(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));

  const createStampImage = async (qrBase64: string, originalAmt: number, netAmt: number, discountPct: number, refNo: string, targetTime: number, activeAcc: any) => {
    const canvas = document.createElement('canvas'); canvas.width = 708; canvas.height = 354; const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#000000'; ctx.lineWidth = 4; ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);
    
    const img = new Image(); img.src = qrBase64; await new Promise(res => img.onload = res as any);
    const qrSize = 180; const margin = 10;
    ctx.drawImage(img, margin, canvas.height - qrSize - margin, qrSize, qrSize);
  
    ctx.fillStyle = '#000000'; ctx.textAlign = 'left';
    ctx.font = 'bold 32px sans-serif'; ctx.fillText(qrMerchantName, margin + qrSize + 10, 40);
    ctx.font = '20px sans-serif'; ctx.fillText(`${activeAcc.bankName} : ${activeAcc.accountNo}`, margin + qrSize + 10, 70);
    ctx.font = '20px sans-serif'; ctx.fillText(`Ref: ${refNo || '-'}`, margin + qrSize + 10, 95);
  
    const textLeftX = margin + qrSize + 10;
    if (discountPct > 0) {
      ctx.fillStyle = '#64748b'; ctx.font = '20px sans-serif'; 
      ctx.fillText(`ยอดเต็ม: ${parseFloat(originalAmt.toString()).toLocaleString('th-TH', { minimumFractionDigits: 2 })}`, textLeftX, 140);
      ctx.fillStyle = '#000000'; ctx.font = 'bold 38px sans-serif'; 
      ctx.fillText(`ยอดชำระ: ${parseFloat(netAmt.toString()).toLocaleString('th-TH', { minimumFractionDigits: 2 })}`, textLeftX, 185);
      ctx.fillStyle = '#000000'; ctx.font = 'bold 18px sans-serif';
      ctx.fillText(`(ลด ${discountPct}% ชำระตามกำหนด)`, textLeftX, 215);
    } else {
      const displayAmt = (originalAmt && !isNaN(originalAmt)) ? parseFloat(originalAmt.toString()).toLocaleString('th-TH', { minimumFractionDigits: 2 }) : '0.00';
      ctx.fillStyle = '#000000'; ctx.font = 'bold 40px sans-serif'; 
      ctx.fillText(`ยอดชำระ: ${displayAmt}`, textLeftX, 180);
    }
  
    ctx.fillStyle = '#000000'; ctx.font = 'bold 20px sans-serif';
    ctx.fillText(`หมดอายุ: ${formatThaiDateTime(targetTime)}`, textLeftX, 260);
    ctx.fillStyle = '#2563eb'; ctx.font = 'bold 16px sans-serif';
    ctx.fillText(`👉 สแกนด้วยกล้องมือถือ/LINE เพื่อชำระเงิน`, textLeftX, 300);
  
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
      const { PDFDocument } = (window as any).PDFLib;
      const masterPdf = await PDFDocument.create(); 

      for (const item of batchFiles) {
        const originalAmount = parseFloat(item.amount);
        const netAmount = discountPercent > 0 ? originalAmount - (originalAmount * discountPercent / 100) : originalAmount;

        const newBillRef = doc(collection(db, 'qr_bills'));
        const portalUrl = `${window.location.origin}?bill=${newBillRef.id}`;
        const qrBase64Url = await (window as any).QRCode.toDataURL(portalUrl, { width: 400, margin: 1, color: { dark: '#000000', light: '#ffffff' }});
        
        const stampDataUrl = await createStampImage(qrBase64Url, originalAmount, netAmount, discountPercent, item.refNo, targetTime, activeAcc);
        
        if (item.file) {
          const pdfBytes = await item.file.arrayBuffer(); 
          const docPdf = await PDFDocument.load(pdfBytes);
          const pages = docPdf.getPages();
          const lastPage = pages[pages.length - 1]; 
          const stampPngImageForDoc = await docPdf.embedPng(stampDataUrl);
          lastPage.drawImage(stampPngImageForDoc, { x: 10, y: 10, width: 60 * 2.83465, height: 30 * 2.83465 });

          const copiedPages = await masterPdf.copyPages(docPdf, docPdf.getPageIndices());
          copiedPages.forEach((page: any) => masterPdf.addPage(page));
        } else {
          const stampPngImageForMaster = await masterPdf.embedPng(stampDataUrl); 
          const blankPage = masterPdf.addPage([595.28, 841.89]); 
          blankPage.drawImage(stampPngImageForMaster, { x: 50, y: 841.89 - 250, width: 400, height: 200 }); 
        }

        await setDoc(newBillRef, {
          refNo: item.refNo, originalAmount: originalAmount, discountPercent: discountPercent, amount: netAmount, 
          bankName: activeAcc.bankName, accountNo: activeAcc.accountNo, promptpay: activeAcc.promptpay, expireAt: targetTime, status: 'PENDING', 
          createdAt: serverTimestamp(), paidAt: null
        });
      }
      
      const pdfBytes = await masterPdf.save();
      const blob = new Blob([pdfBytes], { type: "application/pdf" });
      const link = document.createElement('a'); 
      link.href = URL.createObjectURL(blob); 
      link.download = batchFiles.length === 1 ? `${batchFiles[0].refNo.replace(/[^a-zA-Z0-9_-]/g, '_')}_QR.pdf` : `STP_Merged_Bills_${new Date().toISOString().split('T')[0]}.pdf`; 
      link.click();
      
      showToast(`✅ สร้างและรวมเป็น PDF สำเร็จ!`); 
      setBatchFiles([]);
    } catch (err) { 
      console.error(err);
      showToast("❌ เกิดข้อผิดพลาดตอนสร้าง PDF"); 
    } 
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
    const headers = ["วันที่สร้าง", "เลขที่เอกสาร (Ref)", "ยอดเต็ม", "ส่วนลด %", "ยอดชำระสุทธิ", "ธนาคาร", "สถานะ", "วันที่ชำระเงิน"];
    const rows = historyLogs.map(log => [
      log.createdAt ? new Date(log.createdAt.toMillis()).toLocaleString('th-TH') : '', log.refNo, log.originalAmount || log.amount, log.discountPercent || 0,
      log.amount, log.bankName, log.status === 'PAID' ? 'ชำระแล้ว' : 'รอดำเนินการ', log.paidAt ? new Date(log.paidAt).toLocaleString('th-TH') : '-'
    ]);
    let csvContent = "\uFEFF" + [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob);
    link.download = `QR_Billing_History.csv`; link.click();
  };

  const filteredLogs = showOnlyPending ? historyLogs.filter(log => log.status === 'PENDING') : historyLogs;
  const displayedLogs = filteredLogs.slice(0, displayLimit);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[400] bg-slate-900/80 dark:bg-black/90 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
      <div className="bg-slate-50 w-full max-w-5xl h-[95vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col relative animate-in zoom-in-95 duration-200">
        <button className="absolute top-4 right-4 z-50 p-2 bg-white rounded-full shadow-md text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all" onClick={onClose}><X className="w-5 h-5"/></button>
        
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 font-sans text-slate-800 custom-scrollbar">
          <div className="max-w-4xl mx-auto space-y-6">
            
            <div className="text-center space-y-2 mb-8">
              <h1 className="text-3xl font-black text-blue-950 uppercase tracking-tight">STP <span className="text-blue-600">QR Billing</span></h1>
              <p className="text-slate-500 font-bold text-sm uppercase tracking-widest">{qrMerchantName}</p>
              <div className="text-[10px] text-blue-600 bg-blue-50 py-1.5 px-4 rounded-full inline-block font-black border border-blue-100 tracking-widest uppercase mt-2">🛡️ Web Portal URL QR Code</div>
            </div>

            <div className="flex bg-white rounded-xl shadow-sm border border-slate-200 p-1 mb-6">
              <button onClick={() => { setQrActiveTab('generator'); setSelectedCustomerBill(null); }} className={`flex-1 py-3 text-sm font-black uppercase tracking-widest rounded-lg transition-all ${qrActiveTab === 'generator' && !selectedCustomerBill ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}>ออกบิล (Generator)</button>
              <button onClick={() => { setQrActiveTab('history'); setSelectedCustomerBill(null); }} className={`flex-1 py-3 text-sm font-black uppercase tracking-widest rounded-lg transition-all flex items-center justify-center gap-2 ${qrActiveTab === 'history' && !selectedCustomerBill ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}>
                สถานะบิล <span className="bg-red-500 text-white px-2 py-0.5 rounded-full text-[10px]">{historyLogs.filter(l => l.status === 'PENDING').length}</span>
              </button>
            </div>

            {selectedCustomerBill ? (
                <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200 max-w-md mx-auto animate-in fade-in zoom-in-95">
                  <div className="bg-blue-950 text-white p-5 text-center relative">
                    <button onClick={() => setSelectedCustomerBill(null)} className="absolute left-4 top-5 text-blue-200 hover:text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-1"><ArrowLeft className="w-3 h-3"/> BACK</button>
                    <h2 className="text-lg font-black uppercase tracking-widest">ระบบตรวจสอบบิล (จำลอง)</h2>
                    <p className="text-[10px] text-blue-300 font-bold uppercase tracking-widest mt-1">{qrMerchantName}</p>
                  </div>
                  <div className="p-6 space-y-5 text-center">
                    <div className="bg-slate-50 p-4 rounded-xl text-left text-sm border border-slate-200 space-y-2">
                      <div className="flex justify-between"><span className="text-slate-500 font-bold">REF:</span><span className="font-mono font-black text-blue-600">{selectedCustomerBill.refNo}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500 font-bold">บัญชี:</span><span className="font-bold text-slate-800">{selectedCustomerBill.bankName}</span></div>
                    </div>
                    
                    {(() => {
                       const isExp = Date.now() > selectedCustomerBill.expireAt;
                       const dispAmt = isExp ? selectedCustomerBill.originalAmount : selectedCustomerBill.amount;
                       return (
                         <>
                          <div>
                            <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">ยอดเงินที่ต้องชำระ (ณ ตอนนี้)</p>
                            <p className="text-4xl font-black text-blue-600 mt-1">฿{(dispAmt || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</p>
                            {!isExp && selectedCustomerBill.discountPercent > 0 && <p className="text-emerald-600 text-[10px] font-bold mt-1 bg-emerald-50 px-3 py-1 inline-block rounded-full border border-emerald-100">(มีส่วนลดชำระตรงเวลา {selectedCustomerBill.discountPercent}%)</p>}
                            {isExp && selectedCustomerBill.discountPercent > 0 && <p className="text-red-500 text-[10px] font-bold mt-1 bg-red-50 px-3 py-1 inline-block rounded-full border border-red-100">⚠️ เลยกำหนดเวลาชำระ (ไม่มีส่วนลด)</p>}
                          </div>
                          <div className="py-4 flex justify-center">
                            {selectedCustomerBill.status === 'PAID' ? (
                              <div className="bg-green-50 border-2 border-green-500 rounded-2xl p-6 w-full space-y-3 shadow-inner">
                                <p className="text-xl font-black text-green-700 uppercase tracking-tight">ชำระเงินสำเร็จ</p>
                                <p className="text-[10px] font-bold text-green-600 uppercase tracking-widest">🔒 ล็อกระบบป้องกันการโอนซ้ำ</p>
                              </div>
                            ) : (
                              <div className="space-y-3 w-full flex flex-col items-center">
                                <div className="p-4 bg-white border-2 border-blue-100 rounded-2xl shadow-sm inline-block">
                                  {simQrData ? <img src={simQrData} alt="QR" className="w-52 h-52"/> : <div className="w-52 h-52 flex items-center justify-center text-slate-300"><Loader2 className="w-8 h-8 animate-spin"/></div>}
                                </div>
                                <button onClick={() => {
                                  const link = document.createElement('a');
                                  link.download = `QR_${selectedCustomerBill.refNo}.png`;
                                  link.href = simQrData;
                                  link.click();
                                }} className="w-full py-3 bg-blue-600 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-md hover:bg-blue-700 flex items-center justify-center gap-1 transition-all"><Download className="w-4 h-4"/> บันทึกรูป QR Code</button>
                                <button onClick={() => handleSimulatePayment(selectedCustomerBill.id)} className="w-full py-2 bg-slate-100 text-slate-400 rounded-lg text-[10px] font-black hover:bg-slate-200 hover:text-slate-600 uppercase tracking-widest transition-all mt-2">[DEV] จำลองการจ่ายเงิน</button>
                              </div>
                            )}
                          </div>
                         </>
                       );
                    })()}
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
                    <h3 className="font-black text-amber-600 mb-4 uppercase tracking-widest flex items-center gap-2"><Clock className="w-5 h-5"/> เงื่อนไขเวลา & ส่วนลด</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-500 uppercase">วันที่หมดอายุ</label>
                        <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} className="w-full p-3 text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-amber-500 font-bold text-slate-700" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-500 uppercase">เวลาหมดอายุ</label>
                        <input type="time" value={expiryTime} onChange={(e) => setExpiryTime(e.target.value)} className="w-full p-3 text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-amber-500 font-bold text-slate-700" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-emerald-600 uppercase">ส่วนลดตรงเวลา (%)</label>
                        <input type="number" min="0" max="100" value={discountPercent} onChange={(e) => setDiscountPercent(Number(e.target.value))} className="w-full p-3 text-sm bg-emerald-50 border border-emerald-200 rounded-xl outline-none focus:border-emerald-500 font-black text-emerald-700" placeholder="0" />
                      </div>
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
                    {batchFiles.map((item) => {
                      const origAmt = parseFloat(item.amount || '0');
                      const netAmt = discountPercent > 0 ? origAmt - (origAmt * discountPercent / 100) : origAmt;

                      return (
                        <div key={item.id} className={`bg-white p-4 rounded-xl shadow-sm border ${item.file ? 'border-blue-100' : 'border-emerald-100'} relative group transition-colors`}>
                          <div className="flex justify-between items-center mb-3 pb-2 border-b border-slate-50">
                            <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md ${item.file ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'}`}>{item.file ? '📄 PDF Document' : '🖼️ Image Only'}</span>
                            <button onClick={() => removeBatchItem(item.id)} className="text-red-400 hover:text-red-600 opacity-50 group-hover:opacity-100 transition-opacity"><X className="w-4 h-4"/></button>
                          </div>
                          <div className="pr-6 space-y-3">
                            <div>
                              <label className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Ref No.</label>
                              <input type="text" value={item.refNo} onChange={(e)=>updateBatchItem(item.id, 'refNo', e.target.value)} className="w-full font-mono text-sm font-black text-slate-800 bg-transparent border-b border-slate-200 outline-none pb-1 focus:border-blue-500" placeholder="Ref No."/>
                            </div>
                            <div>
                              <label className="text-[10px] text-slate-400 font-black uppercase tracking-widest">ยอดเต็ม (ก่อนหักส่วนลด)</label>
                              <div className="relative">
                                <input type="number" value={item.amount} onChange={(e)=>updateBatchItem(item.id, 'amount', e.target.value)} disabled={item.isExtracting} className={`w-full text-right font-black text-xl bg-transparent border-b border-slate-200 outline-none pb-1 focus:border-blue-500 disabled:opacity-50 ${discountPercent > 0 ? 'text-slate-400 line-through' : 'text-slate-800'}`} placeholder="0.00"/>
                                {item.isExtracting && <span className="absolute right-0 top-1 text-[10px] text-blue-500 animate-pulse font-bold bg-white px-2">กำลังอ่านยอด...</span>}
                              </div>
                            </div>
                            {discountPercent > 0 && (
                              <div className="bg-emerald-50 border border-emerald-100 p-2 rounded-lg flex justify-between items-center">
                                <span className="text-[10px] text-emerald-600 font-black uppercase tracking-widest">ยอดสุทธิ (ลด {discountPercent}%)</span>
                                <span className="font-black text-lg text-emerald-700">฿{netAmt.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                              </div>
                            )}
                            {item.error && <p className="text-[10px] text-red-600 font-black tracking-wide bg-red-50 p-2 rounded-lg border border-red-100">{item.error}</p>}
                          </div>
                        </div>
                      );
                    })}
                    {batchFiles.length === 0 && <div className="text-center py-20 text-slate-400 font-black uppercase tracking-widest text-[10px]">No documents in queue</div>}
                  </div>
                  <div className="p-4 sm:p-5 bg-white border-t border-slate-100 rounded-b-2xl">
                    <button onClick={processQrBatchFiles} disabled={isQrProcessing || batchFiles.length===0 || !loggedInUser} className="w-full py-4 text-white text-sm font-black rounded-xl uppercase tracking-widest transition-all bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed shadow-md">
                      {!loggedInUser ? 'CONNECTING...' : isQrProcessing ? 'MERGING PDFs...' : `ENGAGE & DOWNLOAD 1 PDF`}
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
                        <th className="px-4 py-3 text-right">ยอดเรียกเก็บ</th>
                        <th className="px-4 py-3 text-center">Status</th>
                        <th className="px-4 py-3 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {displayedLogs.map((log, index) => (
                        <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-4 text-center text-[10px] font-black text-slate-400">{index + 1}</td>
                          <td className="px-4 py-4 font-mono font-black text-blue-600">
                            {log.refNo}
                            <a href={`${window.location.origin}?bill=${log.id}`} target="_blank" rel="noreferrer" className="block text-[9px] text-blue-400 hover:text-blue-600 mt-1 uppercase tracking-widest underline">🔗 Open Portal</a>
                          </td>
                          <td className="px-4 py-4 text-right font-black text-slate-800">
                            {(log.amount || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                            {log.discountPercent > 0 && <div className="text-[9px] text-emerald-600 mt-1">ส่วนลด {log.discountPercent}%</div>}
                          </td>
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
  );
}