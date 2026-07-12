import React from 'react';
import ReactDOM from 'react-dom/client';
import { PreviewApp } from './PreviewApp.js';
import '@xyflow/react/dist/style.css';
import '../styles/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PreviewApp />
  </React.StrictMode>
);
