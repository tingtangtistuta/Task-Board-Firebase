import React, { useState, useEffect } from 'react';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from './firebase'; 
import { CheckCircle2, Clock, Loader2, Copy, Download, UploadCloud, FileImage, ShieldCheck, AlertCircle } from 'lucide-react';

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

export default function CustomerPortal({ billId }: { billId: string }) {
  const [bill, setBill] = useState<any>(null);
  const [qrBase64, setQrBase64] = useState<string>('');
  const [toastMsg, setToastMsg] = useState('');
  
  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const merchantName = 'หจก.แสงไทยพานิช(1992)';
  const showToast = (msg: string) => { setToastMsg(msg); setTimeout(() => setToastMsg(''), 3000); };

  useEffect(() => {
    const loadScript = (src: string) => {
      if (document.querySelector(`script[src="${src}"]`)) return;
      const script = document.createElement('script'); script.src = src; script.async = true; document.body.appendChild(script);
    };
    loadScript('https://cdn.jsdelivr.net/npm/qrcode@1.5.1/build/qrcode.min.js');
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'qr_bills', billId), (docSnap) => {
      if (docSnap.exists()) setBill({ id: docSnap.id, ...docSnap.data() });
      else setBill('NOT_FOUND');
    });
    return () => unsub();
  }, [billId]);

  useEffect(() => {
    if (bill && bill !== 'NOT_FOUND' && bill.status === 'PENDING') {
      const isExpired = Date.now() > bill.expireAt;
      const activeAmount = isExpired ? bill.originalAmount : bill.amount;
      const activePayload = generatePromptPayPayload(bill.promptpay, activeAmount);
      
      const qrcodeLib = (window as any).QRCode;
      if (qrcodeLib && activePayload) {
        qrcodeLib.toDataURL(activePayload, { width: 350, margin: 1, color: { dark: '#000000', light: '#ffffff' } })
          .then((url: string) => setQrBase64(url))
          .catch(() => setQrBase64(''));
      }
    }
  }, [bill]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    showToast(`คัดลอก ${label} เรียบร้อยแล้ว`);
  };

  const downloadQR = () => {
    if (!qrBase64) return;
    const link = document.createElement('a');
    link.download = `QR_${bill.refNo}.png`;
    link.href = qrBase64;
    link.click();
  };

  // 🟢 ล็อกการอัปโหลดให้แน่นหนาป้องกันจอขาว
  const handleUploadSlip = async () => {
    if (!slipFile) return;
    setIsUploading(true);
    try {
      const fileExt = slipFile.name.split('.').pop();
      const slipRef = ref(storage, `slips/${billId}_${Date.now()}.${fileExt}`);
      await uploadBytes(slipRef, slipFile);
      const slipUrl = await getDownloadURL(slipRef);
      
      await updateDoc(doc(db, 'qr_bills', billId), { 
        status: 'PAID_PENDING_VERIFY', 
        slipUrl: slipUrl,
        uploadedAt: Date.now()
      });
      showToast('ส่งหลักฐานสำเร็จ! ระบบกำลังตรวจสอบ');
    } catch (err) {
      console.error(err);
      showToast('❌ เกิดข้อผิดพลาดในการอัปโหลดไฟล์ (ขัดข้องทางเซิร์ฟเวอร์)');
    } finally {
      setIsUploading(false); // บังคับคืนสถานะปุ่มเสมอ
    }
  };

  if (!bill) return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500 font-black tracking-widest"><Loader2 className="w-8 h-8 animate-spin"/></div>;
  if (bill === 'NOT_FOUND') return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-red-500 font-black text-2xl uppercase tracking-widest">❌ ไม่พบข้อมูลบิลนี้ในระบบ</div>;

  const isExpired = Date.now() > bill.expireAt;
  const displayAmount = isExpired ? bill.originalAmount : bill.amount;

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 font-sans text-slate-800">
      <div className="bg-white rounded-[2rem] shadow-2xl overflow-hidden border border-slate-200 w-full max-w-4xl animate-in zoom-in-95 duration-300">
        
        <div className="bg-blue-950 text-white p-8 text-center sm:text-left flex flex-col sm:flex-row justify-between items-center gap-4">
          <div>
            <h2 className="text-2xl font-black uppercase tracking-widest">ระบบรับชำระเงินออนไลน์</h2>
            <p className="text-xs text-blue-300 font-bold uppercase tracking-widest mt-1">{merchantName}</p>
          </div>
          <div className="bg-blue-900/50 px-4 py-2 rounded-xl text-right flex flex-col items-center sm:items-end">
            <p className="text-[10px] text-blue-300 font-black uppercase tracking-widest">เลขที่เอกสาร</p>
            <p className="text-xl font-mono font-black text-white">{bill.refNo}</p>
          </div>
        </div>

        {bill.status === 'PAID' || bill.status === 'PAID_PENDING_VERIFY' ? (
          <div className="p-12 text-center space-y-6">
            <div className={`w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 ${bill.status === 'PAID' ? 'bg-green-100 text-green-600' : 'bg-amber-100 text-amber-500'}`}>
              {bill.status === 'PAID' ? <CheckCircle2 className="w-12 h-12"/> : <ShieldCheck className="w-12 h-12"/>}
            </div>
            <h2 className={`text-3xl font-black uppercase tracking-tight ${bill.status === 'PAID' ? 'text-green-700' : 'text-amber-600'}`}>
              {bill.status === 'PAID' ? 'ชำระเงินสำเร็จ' : 'ระบบได้รับสลิปแล้ว'}
            </h2>
            <p className="text-sm font-bold text-slate-500">
              {bill.status === 'PAID' 
                ? 'ระบบได้รับการยืนยันการชำระเงินเรียบร้อยแล้ว ขอบคุณที่ใช้บริการครับ' 
                : 'กรุณารอเจ้าหน้าที่ตรวจสอบความถูกต้องของสลิปสักครู่นะครับ'}
            </p>
            {bill.uploadedAt && (
              <div className="bg-slate-50 inline-block px-6 py-3 rounded-xl border border-slate-200 mt-4">
                <p className="text-[10px] font-black uppercase text-slate-400">ส่งหลักฐานเมื่อ</p>
                <p className="font-bold text-slate-800">{formatThaiDateTime(bill.uploadedAt)}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2">
            <div className="p-8 border-b md:border-b-0 md:border-r border-slate-200 space-y-6 bg-slate-50/50">
              <div>
                <div className="flex justify-between items-end mb-2">
                  <p className="text-slate-500 text-xs font-black uppercase tracking-widest">ยอดชำระสุทธิ</p>
                  <button onClick={() => copyToClipboard(displayAmount.toFixed(2), 'ยอดเงิน')} className="flex items-center gap-1 text-[10px] bg-blue-100 text-blue-700 hover:bg-blue-200 px-2 py-1 rounded-md font-bold transition-all"><Copy className="w-3 h-3"/> คัดลอกยอดเงิน</button>
                </div>
                <p className={`text-5xl font-black ${isExpired ? 'text-slate-800' : 'text-blue-600'} tracking-tight`}>
                  ฿{(displayAmount || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                </p>
                
                {!isExpired && bill.discountPercent > 0 && (
                  <div className="mt-3 bg-emerald-50 border border-emerald-200 p-3 rounded-xl">
                    <p className="text-emerald-700 text-xs font-bold">✨ รวมส่วนลดชำระตรงเวลา <span className="font-black text-lg">{bill.discountPercent}%</span> แล้ว</p>
                    <p className="text-emerald-600/70 text-[10px] mt-1">(จากยอดเต็ม ฿{(bill.originalAmount || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })})</p>
                  </div>
                )}
                {isExpired && bill.discountPercent > 0 && (
                  <div className="mt-3 bg-red-50 border border-red-200 p-3 rounded-xl animate-in fade-in">
                    <p className="text-red-600 text-xs font-bold">⚠️ เลยกำหนดเวลาชำระเงิน (ระบบปรับเป็นยอดเต็มแล้ว)</p>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <p className="text-slate-500 text-xs font-black uppercase tracking-widest mb-4">ข้อมูลบัญชีรับโอน (สำหรับโอนผ่านแอป/คอม)</p>
                <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm">
                  <p className="text-[10px] text-slate-400 uppercase font-bold">ธนาคาร</p>
                  <p className="font-bold text-slate-800 mb-3">{bill.bankName}</p>
                  
                  <p className="text-[10px] text-slate-400 uppercase font-bold">เลขที่บัญชี / PromptPay</p>
                  <div className="flex justify-between items-center bg-slate-50 p-2 rounded-lg border border-slate-100">
                    <p className="font-mono font-black text-xl text-slate-800 tracking-wider">{bill.promptpay || bill.accountNo}</p>
                    <button onClick={() => copyToClipboard(bill.promptpay || bill.accountNo, 'เลขบัญชี')} className="p-2 bg-blue-100 text-blue-700 hover:bg-blue-200 rounded-md transition-all"><Copy className="w-4 h-4"/></button>
                  </div>
                </div>
              </div>

              <div className={`flex items-center gap-2 text-xs font-bold p-3 rounded-xl border ${isExpired ? 'bg-red-50 border-red-200 text-red-600' : 'bg-white border-slate-200 text-slate-500'}`}>
                <Clock className="w-4 h-4"/>
                <span>{isExpired ? 'บิลนี้หมดอายุรับส่วนลดแล้ว' : `กรุณาชำระก่อน: ${formatThaiDateTime(bill.expireAt)}`}</span>
              </div>
            </div>

            <div className="p-8 flex flex-col space-y-6">
              
              <div className="flex flex-col items-center justify-center border-b border-slate-100 pb-6">
                <p className="text-slate-800 font-black text-sm uppercase tracking-widest mb-4">วิธีที่ 2: สแกนเพื่อชำระเงิน</p>
                <div className="p-3 bg-white border-2 border-blue-100 rounded-2xl shadow-sm relative mb-4">
                  {qrBase64 ? <img src={qrBase64} alt="QR Code" className="w-48 h-48"/> : <div className="w-48 h-48 flex items-center justify-center text-slate-300"><Loader2 className="w-8 h-8 animate-spin"/></div>}
                </div>
                <button onClick={downloadQR} className="text-[10px] text-blue-600 font-black uppercase tracking-widest hover:underline flex items-center justify-center gap-1">
                  <Download className="w-3 h-3"/> บันทึกรูปลงเครื่อง
                </button>
                {/* 🟢 แจ้งเตือนลูกค้า iOS ที่เปิดผ่านไลน์ */}
                <p className="text-[9px] text-slate-400 mt-2 text-center flex items-center justify-center gap-1"><AlertCircle className="w-3 h-3"/> หากกดปุ่มไม่ได้ (เช่น iOS LINE) ให้กดค้างที่รูปภาพเพื่อบันทึกแทน</p>
              </div>

              <div className="flex flex-col flex-1 justify-end">
                <p className="text-slate-800 font-black text-sm uppercase tracking-widest mb-3">ส่งหลักฐานการโอนเงิน</p>
                
                {!slipFile ? (
                  <label className="border-2 border-dashed border-slate-300 rounded-2xl p-6 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50 hover:border-blue-400 transition-all group">
                    <UploadCloud className="w-8 h-8 text-slate-300 group-hover:text-blue-500 mb-2 transition-colors"/>
                    <span className="text-xs font-bold text-slate-500 group-hover:text-blue-600 uppercase tracking-widest">คลิกเพื่อเลือกไฟล์สลิป</span>
                    <input type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => { if(e.target.files && e.target.files[0]) setSlipFile(e.target.files[0]); }}/>
                  </label>
                ) : (
                  <div className="space-y-3">
                    <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl flex items-center justify-between">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <FileImage className="w-5 h-5 text-blue-600 shrink-0"/>
                        <span className="text-xs font-bold text-blue-800 truncate">{slipFile.name}</span>
                      </div>
                      <button onClick={() => setSlipFile(null)} className="text-slate-400 hover:text-red-500 p-1"><X className="w-4 h-4"/></button>
                    </div>
                    <button onClick={handleUploadSlip} disabled={isUploading} className="w-full py-3.5 bg-blue-600 text-white rounded-xl font-black uppercase tracking-widest shadow-md hover:bg-blue-700 flex items-center justify-center gap-2 transition-all disabled:opacity-50">
                      {isUploading ? <Loader2 className="w-5 h-5 animate-spin"/> : 'ยืนยันการส่งสลิป'}
                    </button>
                  </div>
                )}
              </div>

            </div>
          </div>
        )}
      </div>
      
      {toastMsg && <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-6 py-3 rounded-xl font-black text-xs shadow-2xl z-[500] animate-in slide-in-from-bottom-5 flex items-center gap-2 tracking-widest"><CheckCircle2 className="w-4 h-4 text-green-400"/> {toastMsg}</div>}
    </div>
  );
}