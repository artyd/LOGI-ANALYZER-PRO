const engines = [
  { k: "Розрахунок платежів", v: "Митна вартість за Incoterms, мито, ПДВ 20/7/0 — детерміновано" },
  { k: "Класифікація УКТЗЕД", v: "Підбір коду + ставка за тарифом (з позначкою джерела)" },
  { k: "Походження товару", v: "356 правил: ферментація / синтез / тваринне / рослинне" },
  { k: "Прекурсори та ADR", v: "Контроль ДСКН, UN-номер та клас небезпеки" },
];

export default function Home() {
  return (
    <main style={{ maxWidth: 920, margin: "0 auto", padding: "48px 24px 64px", width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
        <span
          style={{
            fontFamily: "var(--font-geist-mono), monospace",
            fontSize: 11,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--accent)",
            border: "1px solid var(--accent)",
            borderRadius: 999,
            padding: "3px 10px",
          }}
        >
          ● ONLINE · v3
        </span>
        <span style={{ fontFamily: "var(--font-geist-mono), monospace", fontSize: 11, color: "var(--ink-2)" }}>
          Freight Intelligence Terminal
        </span>
      </div>

      <h1 style={{ fontSize: 40, fontWeight: 700, lineHeight: 1.1, margin: "8px 0 14px" }}>
        LOGI-<span style={{ color: "var(--accent)" }}>ANALYZER</span> PRO
      </h1>
      <p style={{ color: "var(--ink-2)", fontSize: 16, maxWidth: 680, margin: "0 0 36px", lineHeight: 1.5 }}>
        Аналіз збірних вантажів (фарм / хім) на транзит через ЄС та імпорт в Україну:
        митні платежі, коди УКТЗЕД, походження товару та комплаєнс-перевірки.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 14,
          marginBottom: 36,
        }}
      >
        {engines.map((e) => (
          <div
            key={e.k}
            style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, padding: "16px 18px" }}
          >
            <div style={{ fontWeight: 600, marginBottom: 6 }}>{e.k}</div>
            <div style={{ color: "var(--ink-2)", fontSize: 14, lineHeight: 1.45 }}>{e.v}</div>
          </div>
        ))}
      </div>

      <div
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--line)",
          borderRadius: 12,
          padding: "18px 20px",
          display: "flex",
          flexWrap: "wrap",
          gap: 16,
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <div style={{ fontFamily: "var(--font-geist-mono), monospace", fontSize: 12, color: "var(--accent)" }}>
            СТАТУС РОЗРОБКИ
          </div>
          <div style={{ color: "var(--ink-2)", fontSize: 14, marginTop: 4, maxWidth: 520 }}>
            Рушії розрахунку готові й покриті тестами (42 ✓). Повний UI-термінал аналізу — у розробці.
          </div>
        </div>
        <a
          href="/api/ai"
          style={{
            fontFamily: "var(--font-geist-mono), monospace",
            fontSize: 13,
            color: "var(--bg)",
            background: "var(--accent)",
            borderRadius: 8,
            padding: "10px 16px",
            fontWeight: 600,
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          API: /api/ai →
        </a>
      </div>

      <footer
        style={{
          marginTop: 48,
          color: "var(--ink-2)",
          fontSize: 12,
          fontFamily: "var(--font-geist-mono), monospace",
        }}
      >
        © 2026 · Next.js + TypeScript · deterministic customs engines
      </footer>
    </main>
  );
}
