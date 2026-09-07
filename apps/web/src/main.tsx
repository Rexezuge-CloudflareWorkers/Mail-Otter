import React from 'react';
import ReactDOM from 'react-dom/client';
import SpaApp from './SpaApp';
import './globals.css';
import './i18n';

ReactDOM.createRoot(document.querySelector('#root')!).render(
  <React.StrictMode>
    <SpaApp />
  </React.StrictMode>,
);
