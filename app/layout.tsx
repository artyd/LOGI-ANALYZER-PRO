import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LOGI-ANALYZER PRO · Freight Intelligence Terminal",
  description:
    "Аналіз збірних вантажів на транзит через ЄС та імпорт в Україну: митні платежі, УКТЗЕД, походження, комплаєнс.",
};

const themeScript = `(function(){try{var t=localStorage.getItem('lap_theme');if(t==='light')document.documentElement.classList.add('theme-light');}catch(e){}})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="uk">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Instrument+Sans:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&display=swap"
          rel="stylesheet"
        />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
