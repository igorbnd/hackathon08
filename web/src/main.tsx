import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { loadConfig } from './lib/config';

// Load runtime config before rendering.
// Falls back to dev defaults if config.json is unavailable (e.g. local dev).
loadConfig().then(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
