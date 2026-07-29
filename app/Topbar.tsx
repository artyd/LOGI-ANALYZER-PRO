'use client';

import { useEffect, useState } from 'react';

export default function Topbar() {
  const [light, setLight] = useState(false);

  useEffect(() => {
    setLight(document.documentElement.classList.contains('theme-light'));
  }, []);

  function toggle() {
    const isLight = document.documentElement.classList.toggle('theme-light');
    setLight(isLight);
    try {
      localStorage.setItem('lap_theme', isLight ? 'light' : 'dark');
    } catch {
      /* ignore */
    }
  }

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="brand">
          <div className="brand-mark">◧</div>
          <div>
            <div className="brand-title">LOGI-ANALYZER PRO</div>
            <div className="brand-sub">Freight Intelligence Terminal</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="chip">● ONLINE · v3</span>
          <button className="icon-btn" onClick={toggle} title="Тема" aria-label="Перемкнути тему">
            {light ? '☾' : '☀'}
          </button>
        </div>
      </div>
    </header>
  );
}
