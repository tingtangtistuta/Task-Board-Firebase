import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './app'
import './index.css' // <--- เสียบท่อ Tailwind ตรงนี้ครับ!

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)