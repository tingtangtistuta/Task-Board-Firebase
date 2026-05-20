import React from 'react';
import CustomerPortal from './CustomerPortal';
import MainApp from './MainApp';

export default function App() {
  // สร้างตัวตรวจจับ URL Parameter ว่ามีรหัสบิลลูกค้า (bill=...) ติดมาด้วยหรือไม่
  const queryParams = new URLSearchParams(window.location.search);
  const billParam = queryParams.get('bill');

  // ถ้าเจอระบบจะเปิดหน้าจ่ายเงินสำหรับลูกค้าทันที
  if (billParam) {
    return <CustomerPortal billId={billParam} />;
  }

  // ถ้าไม่เจอระบบจะเปิดหน้าควบคุมหลักของแอดมิน
  return <MainApp />;
}