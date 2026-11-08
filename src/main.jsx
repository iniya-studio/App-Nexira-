import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import '@fontsource-variable/inter/wght.css';
import '@fontsource-variable/orbitron/wght.css';
import './styles.css';
import './theme.css';
import './app.css';
import './nexira-premium.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);