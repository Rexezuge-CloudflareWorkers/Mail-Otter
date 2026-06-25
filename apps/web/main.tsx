import React from 'react';
import ReactDOM from 'react-dom/client';
import SpaApp from './src/SpaApp';
import './src/globals.css';

ReactDOM.createRoot(document.querySelector('#root')!).render(
  <React.StrictMode>
    <SpaApp />
  </React.StrictMode>,
);
