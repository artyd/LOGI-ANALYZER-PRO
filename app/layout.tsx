import type { Metadata } from "next";
import { JetBrains_Mono, Instrument_Sans, Instrument_Serif } from "next/font/google";
import "./globals.css";
import Topbar from "./Topbar";

const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", weight: ["400", "500", "600"] });
const sans = Instrument_Sans({ subsets: ["latin"], variable: "--font-sans", weight: ["400", "500", "600", "700"] });
const serif = Instrument_Serif({ subsets: ["latin"], variable: "--font-serif", weight: "400", style: ["normal", "italic"] });

export const metadata: Metadata = {
  title: "LOGI-ANALYZER PRO · Freight Intelligence Terminal",
  description:
    "Аналіз збірних вантажів на транзит через ЄС та імпорт в Україну: митні платежі, УКТЗЕД, походження, комплаєнс.",
};

// Встановлюємо тему до гідратації, щоб не було миготіння.
const themeScript = `(function(){try{var t=localStorage.getItem('lap_theme');if(t==='light')document.documentElement.classList.add('theme-light');}catch(e){}})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="uk" className={`${mono.variable} ${sans.variable} ${serif.variable} h-full`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full">
        <div id="app">
          <Topbar />
          {children}
        </div>
      </body>
    </html>
  );
}
