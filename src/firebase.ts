import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: 'AIzaSyAxYHHnIwZrvlOx71hqSns0pUsq0lfta00',
  authDomain: 'stp-task-board.firebaseapp.com',
  projectId: 'stp-task-board',
  storageBucket: 'stp-task-board.firebasestorage.app',
  messagingSenderId: '661154304959',
  appId: '1:661154304959:web:0a5e3c79b957ac5115070a',
  measurementId: 'G-D46F74QREN',
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
