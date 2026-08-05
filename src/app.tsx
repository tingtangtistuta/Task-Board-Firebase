import React, { useState, useEffect } from 'react';
import MainApp from './MainApp';
import CustomerPortal from './CustomerPortal';

export default function App() {
  const [loggedInUser, setLoggedInUser] = useState<any>(null);

  useEffect(() => {
    // เช็คว่ามีเซสชันการล็อกอินค้างไว้ไหม
    const savedUser = localStorage.getItem('stp_user_session');
    if (savedUser) {
      try {
        setLoggedInUser(JSON.parse(savedUser));
      } catch (e) {
        localStorage.removeItem('stp_user_session');
      }
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('stp_user_session');
    setLoggedInUser(null);
  };

  // 1. ถ้ายังไม่ล็อกอิน ให้แสดงหน้า MainApp (ซึ่งมีหน้า Login ในตัว)
  if (!loggedInUser) {
    return <MainApp />;
  }

  // 2. 🟢 จุดสำคัญ: ถ้าผู้ใช้ที่ล็อกอินเข้ามามี Role เป็น 'customer' ให้ดีดไปเปิด CustomerPortal ทันที!
  if (loggedInUser.role === 'customer') {
    return <CustomerPortal loggedInUser={loggedInUser} onLogout={handleLogout} />;
  }

  // 3. ถ้าเป็น admin หรือ staff ให้เข้า MainApp ปกติ
  return <MainApp />;
}