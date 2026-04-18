      return Array.from(itemMap.values());
    }

    function chunkArray(arr, size) {
      const result = [];
      for (let i = 0; i < arr.length; i += size) {
        result.push(arr.slice(i, i + size));
      }
      return result;
    }

    async function analyzeBatch(batch, apiKey, euRegulations, batchIndex, totalBatches) {
      const systemPrompt = \`Ти — професійний аналітик міжнародної логістики та митного оформлення фармацевтичних та хімічних вантажів.
ПОТОЧНА ДАТА: КВІТЕНЬ 2026.

\${euRegulations ? \`АКТУАЛЬНІ ПРАВИЛА ТА ВИМОГИ ЄС:
\${euRegulations}\` : ''}

ТВОЯ ЗАДАЧА:
Проаналізуй БАТЧ товарів (переданий у JSON). ОБОВ'ЯЗКОВО зберігай всі позиції. Їх рівно \${batch.length}.
1. Для кожного товару розрахуй митні платежі (dutyRatePercent, напр. 6.5 для 6.5%). Якщо ціни/кількості немає, поверни їх як 0.
2. Сформуй euChecks (ОБОВ'ЯЗКОВО 4–7 пунктів на товар).
3. Сформуй uaChecks (ОБОВ'ЯЗКОВО 3–6 пунктів на товар).
4. УСЯ ІНФОРМАЦІЯ ТІЛЬКИ УКРАЇНСЬКОЮ МОВОЮ.

ФОРМАТ СУВОРО JSON:
{
  "items": [
    {
      "name": "назва",
      "uctzedCode": "код",
      "qtyKg": число,
      "buyPricePerKg": число,
      "dutyRatePercent": число,
      "category": "АФІ / Хімія...",
      "applications": "опис",
      "hazardAnalysis": "ADR клас або 'безпечний'",
      "storageRequirements": "умови",
      "euChecks": [ { "item": "...", "status": "green|yellow|red", "note": "..." } ],
      "uaChecks": [ { "item": "...", "status": "green|yellow|red", "note": "..." } ],
      "risk": "Критичний|Середній|Низький",
      "riskNote": "Ризик, наявність ADR/МСДС"
    }
  ],
  "criticalAlert": "якщо є небезпечні товари - детально словами, інакше null",
  "nctsList": ["пункт", "пункт"]
}

⚠️ КРИТИЧНО ВАЖЛИВО: Ти ПОВИНЕН повернути ТОЧНО \${batch.length} об'єктів у "items". НЕ ПРОПУСКАЙ ЖОДНОГО НАДАНОГО ТОВАРУ.\`;

      const userPrompt = \`БАТЧ ТОВАРІВ НА АНАЛІЗ (\${batch.length} шт):
\${JSON.stringify(batch)}

Уважно перевір щоб в items було рівно \${batch.length} об'єктів. Відповідь виключно в JSON!\`;

      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
        body: JSON.stringify({
          model: 'gpt-4o',
          temperature: 0.0,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ]
        })
      });

      if (!res.ok) throw new Error('API Error ' + res.status);
      const data = await res.json();
      try {
        return JSON.parse(data.choices[0].message.content.replace(/\`\`\`json|\`\`\`/g, '').trim());
      } catch (e) {
        throw new Error('Помилка парсингу JSON для батчу ' + batchIndex);
      }
    }

    let apiKey = localStorage.getItem('lap_key') || '';
    let archive = JSON.parse(localStorage.getItem('lap_archive') || '[]');
    let uploadedFileData = null;

    function init() {
      const savedTheme = localStorage.getItem('lap_theme');
      if (savedTheme === 'light') {
        document.documentElement.classList.add('theme-light');
      }

      if (apiKey) {
        document.getElementById('keyBanner').classList.add('hidden');
        document.getElementById('apiDot').classList.add('ok');
        document.getElementById('apiStatusTxt').textContent = 'API ONLINE';
      }
      renderZed();
    }

    function toggleTheme() {
      const isLight = document.documentElement.classList.toggle('theme-light');
      localStorage.setItem('lap_theme', isLight ? 'light' : 'dark');
    }

    function saveKey() {
      const v = document.getElementById('keyInput').value.trim();
      if (!v.startsWith('sk-')) { alert('Невірний формат ключа. Має починатись з sk-...'); return; }
      apiKey = v;
      localStorage.setItem('lap_key', v);
      document.getElementById('keyBanner').classList.add('hidden');
      document.getElementById('apiDot').classList.add('ok');
      document.getElementById('apiStatusTxt').textContent = 'API ONLINE';
    }

    function showPage(name, btn) {
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.getElementById('page-' + name).classList.add('active');
      if (btn) btn.classList.add('active');
      if (name === 'arch') renderArchive();
    }

    function showLoader() {
      const ra = document.getElementById('resultsArea');
      ra.innerHTML = `
    <div class="loader-overlay" id="mainLoader">
      <div class="loader-route">
        <div class="node active">EU</div>
        <div class="path"><div class="path-fill"></div></div>
        <div class="node">UA</div>
      </div>
      <div class="loader-step" id="loaderStep">> Ініціалізація аналізу...</div>
      <div class="loader-sub" id="loaderSub">Підготовка до запуску</div>