import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './App.css';
import { createWebAdapter } from './services/webAdapter';

// Seamlessly activate client-side Web Adapter when deployed to web hosts (Vercel, Netlify, GitHub Pages, etc.)
if (typeof window !== 'undefined' && !window.electronAPI) {
  window.electronAPI = createWebAdapter();
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);