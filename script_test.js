
    const BATCH_SIZE = 25;

    function normalizeName(name) {
      if (!name) return '';
      return name.toString().toLowerCase().replace(/\s+/g, ' ').trim();
    }

    function buildNormalizedItems(sheetsByDate) {
      const itemMap = new Map();
      const reversed = [...sheetsByDate].reverse();
      
      for (const { sheet, date, name } of reversed) {
        const rows = sheet.rows;
        if (!rows || rows.length === 0) continue;
        
        let headerIdx = 0;
        while (headerIdx < rows.length && !rows[headerIdx].some(c => c && c.trim())) headerIdx++;
        if (headerIdx >= rows.length) continue;
        
        const header = rows[headerIdx].map(h => normalizeName(h));
        
        const getColIndex = (aliases) => header.findIndex(h => aliases.some(a => h.includes(a)));
        const nameIdx = getColIndex(['номенклатура', 'товар', 'наименование', 'name', 'лс', 'найменування']);
        const qtyIdx = getColIndex(['кол-ва/вес нетто, кг', 'кол-ва, кг', 'вес нетто, кг', 'вес нетто', 'кол-во', 'qty', 'кількість', 'вага']);
        const priceIdx = getColIndex(['цена закупки / цена', 'цена закупки', 'цена', 'price', 'ціна']);
        const codeIdx = getColIndex(['код / код тнвэд', 'код тнвэд', 'код', 'уктзед']);
        const prodIdx = getColIndex(['производитель', 'прозводитель', 'producer', 'виробник']);
        const dangerIdx = getColIndex(['мсдс / нюансы', 'нюансы', 'мсдс', 'опасник', 'adr']);

        for (let r = headerIdx + 1; r < rows.length; r++) {
          const row = rows[r];
          if (!row || !row.some(c => c && c.trim() && c !== '—')) continue;
          
          const rawName = nameIdx >= 0 ? row[nameIdx] : null;
          if (!rawName || !rawName.trim() || rawName === '—') continue;
          
          const normName = normalizeName(rawName);
          const qty = qtyIdx >= 0 && row[qtyIdx] !== '—' ? row[qtyIdx] : null;
          const price = priceIdx >= 0 && row[priceIdx] !== '—' ? row[priceIdx] : null;
          const code = codeIdx >= 0 && row[codeIdx] !== '—' ? row[codeIdx] : null;
          const prod = prodIdx >= 0 && row[prodIdx] !== '—' ? row[prodIdx] : null;
          const danger = dangerIdx >= 0 && row[dangerIdx] !== '—' ? row[dangerIdx] : null;

          if (!itemMap.has(normName)) {
            itemMap.set(normName, { name: rawName, qtyKg: qty, buyPricePerKg: price, uctzedCode: code, producer: prod, rawDanger: danger, sourceSheet: name, latestDate: date });
          } else {
            const existing = itemMap.get(normName);
            if (qty) existing.qtyKg = qty;
            if (price) existing.buyPricePerKg = price;
            if (code) existing.uctzedCode = code;
            if (prod) existing.producer = prod;
            if (danger) existing.rawDanger = danger;
            existing.sourceSheet = name;
            existing.latestDate = date;
          }
        }
      }
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
      <div class="loader-spinner"></div>
    </div>
  `;
    }
    function setLoaderStep(step, sub) {
      const st = document.getElementById('loaderStep');
      const su = document.getElementById('loaderSub');
      if (st && step) st.textContent = step;
      if (su && sub !== undefined) su.textContent = sub;
    }
    function hideLoader() {
      const l = document.getElementById('mainLoader');
      if (l) l.remove();
    }

    async function runAudit() {
      if (!apiKey) { alert('Спочатку введіть API ключ!'); return; }

      const url = document.getElementById('driveUrl').value.trim();

      if (!uploadedFileData && !url) {
        alert('Вставте посилання на Google Sheets або завантажте файл!');
        return;
      }

      const btn = document.getElementById('goBtn');
      const txt = document.getElementById('goTxt');
      const spin = document.getElementById('goSpin');

      btn.disabled = true; txt.textContent = 'АНАЛІЗ...'; spin.style.display = 'block';
      document.getElementById('resultsArea').innerHTML = '';
      showLoader();

      try {
        let sheets = [];
        let sourceUrl = url || 'Завантажений файл';

        if (uploadedFileData) {
          setLoaderStep('> Обробка завантаженого файлу...', 'Підготовка даних...');
          sheets = uploadedFileData;
        } else {
          setLoaderStep('> Підключення до Google Sheets...', 'Читання всіх листів...');

          const sheetId = extractSheetId(url);
          if (!sheetId) throw new Error('Невірне посилання на Google Sheets.');

          const gid = extractGid(url);

          if (gid) {
            setLoaderStep('> Читання вказаного листа...', '');
            const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
            const res = await fetch(csvUrl);
            if (!res.ok) throw new Error('Не вдалося прочитати лист. Перевірте доступ.');
            const csvText = await res.text();
            sheets = [{ name: 'Лист ' + gid, rows: parseCSV(csvText) }];
          } else {
            setLoaderStep('> Читання всіх листів таблиці...', '');
            for (let i = 0; i < 10; i++) {
              try {
                const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${i}`;
                const res = await fetch(csvUrl);
                if (res.ok) {
                  const csvText = await res.text();
                  const rows = parseCSV(csvText);
                  if (rows.length > 0) sheets.push({ name: `Лист ${i + 1}`, rows });
                }
              } catch (e) { break; }
            }
            if (sheets.length === 0) throw new Error('Не вдалося прочитати жодного листа. Перевірте доступ.');
          }
        }

        if (sheets.length === 0) throw new Error('Не знайдено даних для аналізу');

        const totalRows = sheets.reduce((sum, s) => sum + s.rows.length, 0);
        setLoaderStep(`> Прочитано ${sheets.length} листів (${totalRows} рядків)`, 'Пошук актуальних правил ЄС...');

        let euRegulations = '';
        try {
          const searchRes = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
            body: JSON.stringify({
              model: 'gpt-4o',
              max_tokens: 2000,
              messages: [{
                role: 'user',
                content: `Яка актуальна інформація станом на квітень 2026 року про:
1. Правила транзиту фармацев        // Нормалізація товарів
        setLoaderStep('> Нормалізація даних...', 'Об’єднання та дедуплікація товарів');
        const normalizedItems = buildNormalizedItems(sheetsByDate);
        if (normalizedItems.length === 0) {
            throw new Error('Не вдалося розпізнати жодного товару в таблицях.');
        }

        // Розбивка на батчі
        const batches = chunkArray(normalizedItems, BATCH_SIZE);
        setLoaderStep(`> Підготовлено \${batches.length} батчів для аналізу`, `Загалом \${normalizedItems.length} унікальних позицій`);

        let finalItems = [];
        let globalCriticalAlerts = [];
        let globalNctsList = [];
        let failedBatches = 0;

        for (let i = 0; i < batches.length; i++) {
            setLoaderStep(`> Аналіз батча \${i + 1} / \${batches.length}`, `Обробка \${batches[i].length} позицій...`);
            try {
                const batchResult = await analyzeBatch(batches[i], apiKey, euRegulations, i + 1, batches.length);
                if (batchResult.items && Array.isArray(batchResult.items)) {
                    finalItems.push(...batchResult.items);
                }
                if (batchResult.criticalAlert) globalCriticalAlerts.push(batchResult.criticalAlert);
                if (batchResult.nctsList && Array.isArray(batchResult.nctsList)) {
                    globalNctsList.push(...batchResult.nctsList);
                }
                
                const path = document.querySelector('.loader-route');
                if (path && i === 0) path.classList.add('animating');
                const nodes = document.querySelectorAll('.loader-route .node');
                if (nodes.length > 1 && i === batches.length - 1) nodes[1].classList.add('active');
            } catch (err) {
                console.error(\`Помилка батча \${i + 1}:\`, err);
                failedBatches++;
                document.getElementById('resultsArea').insertAdjacentHTML('beforeend', 
                    \`<div class="status-box error" style="display:block; margin-top:20px; text-align: left;">
                      ⚠️ Помилка обробки батча \${i + 1}: \${err.message}
                     </div>\`);
            }
        }

        if (finalItems.length === 0) {
            throw new Error('Жоден батч не був успішно оброблений. Аналіз неможливий.');
        }

        setLoaderStep('> Завершення...', 'Оформлення результатів');

        const parsed = {
             items: finalItems,
             criticalAlert: globalCriticalAlerts.length > 0 ? globalCriticalAlerts.join(' | ') : null,
             nctsList: [...new Set(globalNctsList)].slice(0, 10),
             summary: {},
             borderDelay: '12-24 год'
        };

        // ===== ТОЧНИЙ РОЗРАХУНОК МИТНИХ ПЛАТЕЖІВ НА JS =====
        const FREIGHT_MULTIPLIER = 1.10;
        const VAT_RATE = 0.20;

        let totalCustomsValue = 0, totalDuty = 0, totalVAT = 0;

        (parsed.items || []).forEach(item => {
          const qty = parseNumber(item.qtyKg);
          const price = parseNumber(item.buyPricePerKg);
          const dutyRate = parseNumber(item.dutyRatePercent);

          const customsValue = +(price * qty * FREIGHT_MULTIPLIER).toFixed(2);
          const duty = +(customsValue * dutyRate / 100).toFixed(2);
          const vat = +((customsValue + duty) * VAT_RATE).toFixed(2);

          item.qtyKg = qty;
          item.buyPricePerKg = price;
          item.dutyRatePercent = dutyRate;
          item.customsValue = customsValue;
          item.duty = duty;
          item.vat = vat;
          item.qty = qty > 0 ? qty.toLocaleString('uk-UA') + ' кг' : '—';
          item.buyPrice = price;

          totalCustomsValue += customsValue;
          totalDuty += duty;
          totalVAT += vat;
        });

        parsed.summary = {
          totalCustomsValue: +totalCustomsValue.toFixed(2),
          totalDuty: +totalDuty.toFixed(2),
          totalVAT: +totalVAT.toFixed(2),
          totalToPay: +(totalDuty + totalVAT).toFixed(2),
          borderDelay: parsed.borderDelay || '—'
        };

        hideLoader();
        
        if (failedBatches > 0) {
            document.getElementById('resultsArea').innerHTML += \`<div class="status-box error" style="display:block; margin-bottom:20px;">Аналіз завершено, але \${failedBatches} батчів не вдалося обробити. Результати можуть бути неповними.</div>\`;
        }
        
        renderResults(parsed, sourceUrl);

        uploadedFileData = null;
        document.getElementById('fileName').style.display = 'none';
        document.getElementById('fileUpload').value = '';

      } catch (e) {
        hideLoader();
        document.getElementById('resultsArea').innerHTML = \`<div class="status-box error" style="display:block;">> Помилка: \${e.message}</div>\`;
      } finally {
        btn.disabled = false; txt.textContent = 'Запустити аналіз'; spin.style.display = 'none';
      }
    } Напр: "Сухе місце, 15-25°C".

СТАВКИ МИТА для фармацевтики та хімії (dutyRatePercent):
- Фармацевтичні субстанції (АФІ, HS 2933-2942): 0-5%
- Хімічні реактиви (HS 2800-2900): 5-6.5%
- МКЦ (мікрокристалічна целюлоза, HS 3912): 6.5%
- Небезпечні хімікати (ADR): 6.5%
- Косметична сировина: 5-6.5%
- Харчові добавки: 5-10%

ПРАВИЛА РОЗРАХУНКУ РИЗИКУ (risk):
- "Критичний": наявні слова "МСДС", "НЮАНСЫ", "опасник", "ADR", є піктограми небезпеки, або потрібен дозвіл на подвійне призначення.
- "Середній": НЕМАЄ критичних факторів, АЛЕ потрібні специфічні сертифікати (GMP, CoA), температурний режим або додатковий контроль.
- "Низький": стандартні товари без специфічних обмежень та вимог до транспортування.

ІНШІ ПРАВИЛА:
- ⚠️ ЕКОНОМІЯ ТОКЕНІВ: Весь текст у JSON (notes, applications, hazardAnalysis) ПОВИНЕН БУТИ ТЕЛЕГРАФНИМ СТИЛЕМ. Щоб влізли всі товари, уникай довгих речень!
- НЕ вигадуй товари - використовуй ТІЛЬКИ з таблиці.
- Якщо є поле "цена" або "Цена закупки" - використовуй його як buyPricePerKg
- Якщо є "Кол-ва, кг" або "Вес нетто, кг" - використовуй його як qtyKg
- НЕ РАХУЙ customsValue/duty/vat - ти повертаєш тільки qtyKg, buyPricePerKg, dutyRatePercent
- УСІ ТЕКСТИ УКРАЇНСЬКОЮ МОВОЮ
- ⚠️ АБСОЛЮТНО КРИТИЧНО: ТИ ПОВИНЕН ОПРАЦЮВАТИ УСІ 100% РЯДКІВ/ТОВАРІВ З ТАБЛИЦІ. НЕ СКОРОЧУЙ, НЕ ВИДАЛЯЙ І НЕ ГРУПУЙ ТОВАРИ. СКІЛЬКИ ТОВАРІВ У ТАБЛИЦІ (АБО ЗВЕДЕНОМУ СПИСКУ), СТІЛЬКИ МАЄ БУТИ ОБ'ЄКТІВ В МАСИВІ "items".`;

        const userPrompt = `Джерело даних: ${sourceUrl}
Кількість листів: ${sheets.length}
Поточна дата: квітень 2026

ВАЖЛИВО: Листи відсортовані за датою - НАЙСВІЖІШІ ДАНІ ВГОРІ (позначені ⭐).

ПРАВИЛА ВИКОРИСТАННЯ ДАНИХ:
1. ПРИОРИТЕТ СВІЖИМ ДАНИМ: Якщо товар є в кількох листах - використовуй дані з НАЙНОВІШОГО листа (березень-квітень 2026)
2. Для ціни бери ОСТАННЮ актуальну (з найсвіжішого листа де вона є)
3. Для кількості бери дані з ФІНАЛЬНОГО/останнього листа
4. Якщо є лист "ФИНАЛЬНІЙ СОСТАВ" або "ФІНАЛЬНИЙ" - він має НАЙВИЩИЙ пріоритет

ДАНІ З УСІХ ЛИСТІВ ТАБЛИЦІ:
${allSheetsData}

Проаналізуй дані та поверни JSON з аналізом товарів використовуючи НАЙСВІЖІШУ інформацію (квітень 2026). 
⚠️ КРИТИЧНА ВИМОГА: ОБРОБИ АБСОЛЮТНО ВСІ ПОЗИЦІЇ З ТАБЛИЦІ. НЕ СКОРОЧУЙ І НЕ ОБМЕЖУЙ ВИДАЧУ ДЕКІЛЬКОМА ТОВАРАМИ. МАСИВ items ПОВИНЕН МІСТИТИ ВСІ БЕЗ ВИНЯТКУ ТОВАРИ, ЩО Є В ДАНИХ.
НЕ використовуй застарілі дані з грудня 2025 чи січня 2026 якщо є свіжіші.
НЕ вигадуй товари - використовуй тільки те що є в таблиці.`;

        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
          body: JSON.stringify({
            model: 'gpt-4o',
            max_tokens: 16000,
            temperature: 0.0,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ]
          })
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error?.message || 'API Error ' + res.status);
        }

        const data = await res.json();
        const raw = data.choices[0].message.content;
        setLoaderStep('> Отримано відповідь AI', 'Формування звіту...');
        const nodes = document.querySelectorAll('.loader-route .node');
        if (nodes.length > 1) nodes[1].classList.add('active');

        let parsed;
        try {
          let cleanJson = raw.replace(/```json|```/g, '').trim();
          cleanJson = cleanJson.replace(/(\d),(\d)/g, '$1$2');
          parsed = JSON.parse(cleanJson);
        } catch (e) {
          hideLoader();
          document.getElementById('resultsArea').innerHTML = `
        <div class="status-box error" style="display:block;">Помилка парсингу JSON:
${e.message}

Відповідь AI (перші 500 символів):
${raw.slice(0, 500)}</div>
      `;
          btn.disabled = false; txt.textContent = 'Запустити аналіз'; spin.style.display = 'none';
          return;
        }

        // ===== ТОЧНИЙ РОЗРАХУНОК МИТНИХ ПЛАТЕЖІВ НА JS =====
        const FREIGHT_MULTIPLIER = 1.10;
        const VAT_RATE = 0.20;

        let totalCustomsValue = 0, totalDuty = 0, totalVAT = 0;

        (parsed.items || []).forEach(item => {
          const qty = parseNumber(item.qtyKg);
          const price = parseNumber(item.buyPricePerKg);
          const dutyRate = parseNumber(item.dutyRatePercent);

          const customsValue = +(price * qty * FREIGHT_MULTIPLIER).toFixed(2);
          const duty = +(customsValue * dutyRate / 100).toFixed(2);
          const vat = +((customsValue + duty) * VAT_RATE).toFixed(2);

          item.qtyKg = qty;
          item.buyPricePerKg = price;
          item.dutyRatePercent = dutyRate;
          item.customsValue = customsValue;
          item.duty = duty;
          item.vat = vat;
          item.qty = qty > 0 ? qty.toLocaleString('uk-UA') + ' кг' : '—';
          item.buyPrice = price;

          totalCustomsValue += customsValue;
          totalDuty += duty;
          totalVAT += vat;
        });

        parsed.summary = {
          totalCustomsValue: +totalCustomsValue.toFixed(2),
          totalDuty: +totalDuty.toFixed(2),
          totalVAT: +totalVAT.toFixed(2),
          totalToPay: +(totalDuty + totalVAT).toFixed(2),
          borderDelay: parsed.borderDelay || '—'
        };

        hideLoader();
        renderResults(parsed, sourceUrl);

        uploadedFileData = null;
        document.getElementById('fileName').style.display = 'none';
        document.getElementById('fileUpload').value = '';

      } catch (e) {
        hideLoader();
        document.getElementById('resultsArea').innerHTML = `<div class="status-box error" style="display:block;">> Помилка: ${e.message}</div>`;
      } finally {
        btn.disabled = false; txt.textContent = 'Запустити аналіз'; spin.style.display = 'none';
      }
    }

    function extractSheetId(url) {
      const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
      return match ? match[1] : null;
    }

    function extractGid(url) {
      const match = url.match(/[#&]gid=([0-9]+)/);
      return match ? match[1] : null;
    }

    // Парсинг CSV - посимвольный с поддержкой многострочных ячеек
    function parseCSV(text) {
      text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const rows = [];
      let currentRow = [];
      let currentCell = '';
      let inQuotes = false;
      let i = 0;
      while (i < text.length) {
        const char = text[i];
        const next = text[i + 1];
        if (inQuotes) {
          if (char === '"' && next === '"') { currentCell += '"'; i += 2; continue; }
          if (char === '"') { inQuotes = false; i++; continue; }
          currentCell += char; i++;
        } else {
          if (char === '"') { inQuotes = true; i++; continue; }
          if (char === ',') { currentRow.push(currentCell.trim()); currentCell = ''; i++; continue; }
          if (char === '\n') {
            currentRow.push(currentCell.trim());
            if (currentRow.some(c => c && c.length > 0)) rows.push(currentRow);
            currentRow = []; currentCell = ''; i++; continue;
          }
          currentCell += char; i++;
        }
      }
      if (currentCell || currentRow.length > 0) {
        currentRow.push(currentCell.trim());
        if (currentRow.some(c => c && c.length > 0)) rows.push(currentRow);
      }
      return rows;
    }

    function parseNumber(val) {
      if (val == null || val === '') return 0;
      if (typeof val === 'number') return val;
      let s = String(val).trim();
      if (!s || s === '—' || s === '-') return 0;
      s = s.replace(/[$€₴£¥]/g, '').replace(/\s|\u00A0/g, '');
      if (s.includes(',') && s.includes('.')) {
        if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
          s = s.replace(/\./g, '').replace(',', '.');
        } else {
          s = s.replace(/,/g, '');
        }
      } else if (s.includes(',')) {
        const parts = s.split(',');
        if (parts.length === 2 && parts[1].length <= 2) {
          s = parts[0] + '.' + parts[1];
        } else {
          s = s.replace(/,/g, '');
        }
      }
      const n = parseFloat(s);
      return isNaN(n) ? 0 : n;
    }



    function fmt(n) {
      if (n == null || isNaN(n)) return '$0';
      return '$' + Math.round(n).toLocaleString('en-US');
    }

    function renderChecksList(checks, fallbackText) {
      if (typeof checks === 'string') {
        return `<div style="font-size:12px;color:var(--ink-2);line-height:1.5">${checks}</div>`;
      }
      if (!Array.isArray(checks) || checks.length === 0) {
        return `<div style="font-size:12px;color:var(--ink-3);font-style:italic">${fallbackText || '—'}</div>`;
      }
      const validStatuses = { green: 'green', yellow: 'yellow', red: 'red' };
      const legend = `<div class="checks-legend">
    <span><i style="background:#3fd18c"></i>Гуд</span>
    <span><i style="background:#e5b53a"></i>Увага</span>
    <span><i style="background:#ff6161"></i>Критично</span>
  </div>`;
      const items = checks.map(c => {
        const status = validStatuses[c.status] || 'yellow';
        const title = (c.item || '').replace(/</g, '&lt;');
        const note = (c.note || '').replace(/</g, '&lt;');
        return `<div class="check-item ${status}">
      <div class="check-light ${status}"></div>
      <div class="check-content">
        <div class="check-title">${title}</div>
        ${note ? `<div class="check-note">${note}</div>` : ''}
      </div>
    </div>`;
      }).join('');
      return legend + `<div class="checks-list">${items}</div>`;
    }

    function renderResults(d, url) {
      const s = d.summary || {};
      let rows = '';
      (d.items || []).forEach(item => {
        const rc = item.risk === 'Критичний' ? 'pill-r' : item.risk === 'Середній' ? 'pill-y' : 'pill-g';
        const hasAdr = item.hazardAnalysis && item.hazardAnalysis.includes('Клас');
        const hazardBadge = hasAdr ? `<span class="adr-badge">▲ ADR</span>` : '';
        const qtyDisplay = item.qty || (item.qtyKg ? item.qtyKg.toLocaleString('uk-UA') + ' кг' : '—');
        const priceDisplay = item.buyPricePerKg ? fmt(item.buyPricePerKg) + '/кг' : '—';
        const dutyRateDisplay = item.dutyRatePercent != null ? `${item.dutyRatePercent}%` : '—';

        const hazardSafe = item.hazardAnalysis && item.hazardAnalysis.includes('Не класифікується');
        const hazardClass = hazardSafe ? 'safe' : 'danger';

        rows += `<tr>
      <td style="min-width:220px;max-width:280px">
        <div class="td-name">${item.name || '—'}</div>
        <div class="td-code">${item.uctzedCode || ''}</div>
        ${item.category ? `<span class="td-category">${item.category}</span>` : ''}
        ${item.applications ? `<div class="td-apps">${item.applications.substring(0, 120)}${item.applications.length > 120 ? '…' : ''}</div>` : ''}
      </td>
      <td style="min-width:130px">
        <div class="td-qty">${qtyDisplay}</div>
        <div class="td-price">${priceDisplay}</div>
        ${hazardBadge ? `<div style="margin-top:6px">${hazardBadge}</div>` : ''}
      </td>
      <td style="min-width:160px">
        <div class="td-value-primary">${fmt(item.customsValue)}</div>
        <div class="td-value-line">мито ${dutyRateDisplay} · ${fmt(item.duty)}</div>
        <div class="td-value-vat">ПДВ · ${fmt(item.vat)}</div>
      </td>
      <td style="min-width:300px;max-width:380px">
        ${renderChecksList(item.euChecks, 'Немає даних про перевірки ЄС')}
        ${item.hazardAnalysis ? `<div class="info-card ${hazardClass}"><div class="info-card-title">Аналіз небезпеки</div><div class="info-card-body">${item.hazardAnalysis}</div></div>` : ''}
        ${item.storageRequirements ? `<div class="info-card warn"><div class="info-card-title">Зберігання</div><div class="info-card-body">${item.storageRequirements}</div></div>` : ''}
      </td>
      <td style="min-width:300px;max-width:380px">
        ${renderChecksList(item.uaChecks, 'Немає даних про розмитнення UA')}
      </td>
      <td style="min-width:120px">
        <span class="pill ${rc}">${item.risk || '—'}</span>
        <div class="pill-note">${item.riskNote || ''}</div>
      </td>
    </tr>`;
      });

      const al = d.criticalAlert
        ? `<div class="al al-red"><h4>Критичний фактор</h4><p>${d.criticalAlert}</p></div>`
        : '<div></div>';
      const nc = (d.nctsList || []).map(i => `<li>${i}</li>`).join('');

      document.getElementById('resultsArea').innerHTML = `
    <div class="sec-head">
      <span class="sec-num">01 · OVERVIEW</span>
      <span class="sec-title">Фінансова зведена</span>
      <span class="sec-line"></span>
    </div>
    <div class="metrics">
      <div class="metric">
        <div class="metric-label">Митна вартість <span class="tag">CIF</span></div>
        <div class="metric-value">${fmt(s.totalCustomsValue)}</div>
        <div class="metric-sub">CIF = FOB × 1.10 (фрахт+страх.)</div>
      </div>
      <div class="metric is-duty">
        <div class="metric-label">Мито <span class="tag">УКТЗЕД</span></div>
        <div class="metric-value">${fmt(s.totalDuty)}</div>
        <div class="metric-sub">За ставками по кожній позиції</div>
      </div>
      <div class="metric is-vat">
        <div class="metric-label">ПДВ <span class="tag">20%</span></div>
        <div class="metric-value">${fmt(s.totalVAT)}</div>
        <div class="metric-sub">(CIF + Мито) × 0.20</div>
      </div>
      <div class="metric is-total">
        <div class="metric-label">До сплати <span class="tag">ИТОГО</span></div>
        <div class="metric-value">${fmt(s.totalToPay)}</div>
        <div class="metric-sub">Мито + ПДВ · ${s.borderDelay || '—'}</div>
      </div>
    </div>
    
    <div class="sec-head">
      <span class="sec-num">02 · MANIFEST</span>
      <span class="sec-title">Склад та план перевірок</span>
      <span class="sec-line"></span>
    </div>
    <div class="tbl-card">
      <div class="tbl-head-bar">
        <span class="tbl-head-title">Manifest breakdown</span>
        <span class="tbl-head-count">${(d.items || []).length} позицій</span>
      </div>
      <div class="tbl-scroll">
        <table>
          <thead><tr>
            <th>Товар / УКТЗЕД</th>
            <th>К-сть · Ціна</th>
            <th>Вартість · Платежі</th>
            <th>🇪🇺 Перевірки в ЄС</th>
            <th>🇺🇦 Розмитнення UA</th>
            <th>Ризик</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
    
    <div class="sec-head">
      <span class="sec-num">03 · ADVISORY</span>
      <span class="sec-title">Ризики та чекліст</span>
      <span class="sec-line"></span>
    </div>
    <div class="alerts">
      ${al}
      <div class="al al-green"><h4>NCTS Phase 5 · Checklist</h4><ul>${nc}</ul></div>
    </div>`;

      const hasHigh = (d.items || []).some(i => i.risk === 'Критичний');
      const hasMed = (d.items || []).some(i => i.risk === 'Середній');
      const total = fmt((s.totalCustomsValue || 0) + (s.totalDuty || 0) + (s.totalVAT || 0));
      archive.unshift({ url, date: new Date().toLocaleDateString('uk-UA'), items: (d.items || []).length, total, hasHigh, hasMed, data: d });
      localStorage.setItem('lap_archive', JSON.stringify(archive.slice(0, 50)));
    }

    function renderArchive() {
      const list = document.getElementById('archList');
      document.getElementById('archCount').textContent = archive.length + ' records';
      if (!archive.length) {
        list.innerHTML = '<div class="arch-empty">// Архів порожній — запустіть перший аналіз</div>';
        return;
      }
      list.innerHTML = '';
      archive.forEach((a, i) => {
        const color = a.hasHigh ? 'var(--red-bright)' : a.hasMed ? 'var(--yellow)' : 'var(--green-bright)';
        const bgColor = a.hasHigh ? 'var(--red-dim)' : a.hasMed ? 'var(--yellow-dim)' : 'var(--green-dim)';
        const borderColor = a.hasHigh ? 'rgba(239,74,74,0.3)' : a.hasMed ? 'rgba(229,181,58,0.3)' : 'rgba(44,184,120,0.3)';
        const label = a.hasHigh ? 'CRITICAL' : a.hasMed ? 'MEDIUM' : 'LOW';
        const el = document.createElement('div');
        el.className = 'arch-item';
        el.innerHTML = `
      <div class="arch-dot" style="background:${color}; box-shadow:0 0 8px ${color}"></div>
      <div>
        <div class="arch-url">${a.url.length > 70 ? a.url.slice(0, 70) + '…' : a.url}</div>
        <div class="arch-meta">${a.date} · ${a.items} позицій</div>
      </div>
      <div class="arch-risk" style="color:${color};background:${bgColor};border-color:${borderColor}">${label}</div>
      <div class="arch-total">${a.total}</div>`;
        el.onclick = () => {
          document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
          document.querySelector('.nav-btn').classList.add('active');
          showPage('new', null);
          document.getElementById('driveUrl').value = a.url;
          renderResults(a.data, a.url);
          setTimeout(() => document.getElementById('resultsArea').scrollIntoView({ behavior: 'smooth' }), 100);
        };
        list.appendChild(el);
      });
    }

    const zedTopics = [
      {
        ico: '📑', topic: 'Рішення класифікації ЄС', short: 'BTI / Складні коди / УКТЗЕД', sections: [
          { title: 'BTI (Binding Tariff Information)', rows: [['Термін дії', '3 роки в усьому ЄС'], ['Запит', 'Через митний портал ЄС / e-BTI'], ['Обовʼязковість', 'Юридична сила для всіх країн'], ['Аналог в UA', 'Рішення щодо попередньої класифікації']] },
          { title: 'Типові помилки брокерів', rows: [['Спірні суміші', 'Вимагається точний % складу (CoA)'], ['Частини машин', 'Призначення vs Матеріал (Правило 3)'], ['Подвійне признач.', 'Потребує дозволу Держекспортконтролю']] },
          { title: 'Нові правила (CBAM)', rows: [['CBAM', 'Екологічне мито на імпорт в ЄС (сталь, цемент)'], ['Фарма', 'Обовʼязковий GMP-сертифікат для активних субст.']] }
        ]
      },
      {
        ico: '📊', topic: 'Оцінка та Інвойсинг', short: 'Митна вартість / Інкотермс', sections: [
          { title: 'Формування вартості (Метод 1)', rows: [['CIF (УА)', 'Invoice Value + Freight + Insurance'], ['EXW/FCA', 'Потребує чіткої довідки про вартість транспорту'], ['DAP/DDP', 'Фрахт та страх. вже включено']] },
          { title: 'Документи для підтвердження', rows: [['Основа', 'Комерційний інвойс, пакувальний лист'], ['Транспорт', 'CMR, B/L (коносамент), AWB'], ['Оплата', 'SWIFT (платіжне доручення), експортна МД']] },
          { title: 'Ризики для методики', rows: [['Зниження ціни', 'Спрацювання профілю ризику (ІАС МУ)'], ['Роялті', 'Мають включатись в митну вартість'], ['Посередники', 'Договір комісії збільшує вартість']] }
        ]
      },
      {
        ico: '🇪🇺', topic: 'Транзит ЄС · NCTS 5', short: 'T1, E-CMR, Гарантії', sections: [
          { title: 'Оновлення NCTS Phase 5', rows: [['MRN статус', 'Автоматичне відстеження по ЄС'], ['Помилки ENS', 'Призводять до зупинки в порту (до 72 год)'], ['Нові поля', 'Відправник/Одержувач на рівні House Consignment']] },
          { title: 'Фінансова гарантія', rows: [['Загальна (CG)', 'Для регулярних перевезень (АЕО / брокери)'], ['Індивідуальна', 'Разова транзакція (високий тариф)'], ['Звільнення', 'Тільки для АЕО-комбінованих (AEO F)']] },
          { title: 'Транзитні Checkpoints', rows: [['Польща-UA', 'Виключно через e-Cherha на кордоні'], ['Румунія-UA', 'Посилений ваговий контроль (+ рентген)'], ['Завершення', 'Тільки на авторизованому митному посту']] }
        ]
      },
      {
        ico: '☢️', topic: 'ADR Небезпечні вантажі', short: 'Хімія, Батареї, ADR', sections: [
          { title: 'Критичні документи', rows: [['MSDS / ПБ', 'Тільки англ + мова країни транзиту (16 пунктів)'], ['DGD', 'Dangerous Goods Declaration (авіа/море)'], ['Tremcard', 'Аварійна картка водія (з вогнегасниками)']] },
          { title: 'Літієві батареї (UN 3480/3481)', rows: [['Вимоги пакування', 'PI 965-967 (жорсткі коробки, маркування)'], ['Потужність', 'Понад 100 Wh класифікується як Class 9'], ['Транзит ЄС', 'Лише 50% SOC (стан заряду) під час перевезень']] },
          { title: 'ADR несумісність', rows: [['Клас 6.1 + 8', 'Потребує окремих транспортних засобів / відсіків'], ['Їжа + ADR', 'Суворо заборонено до сумісного LCL'], ['Охолодження', 'Для деяких хім. вантажів обовʼязковий термореєстратор']] }
        ]
      },
      {
        ico: '🏗️', topic: 'Управління LCL', short: 'Консолідація, Перевалка', sections: [
          { title: 'Морські хаби (ЄС)', rows: [['Гдиня (PL)', 'Термін перевалки: 3-5 днів, затримки восени'], ['Констанца (RO)', 'Обов’язковий сканер для збірних вантажів'], ['Гамбург (DE)', 'Автоматичний випуск T1 за наявності ENS']] },
          { title: 'Процес розформування CFS', rows: [['Строки', '+2 дні до загального транзиту'], ['Догляд', 'Якщо 1 вантаж в LCL на огляді – стоїть весь контейнер'], ['Пошкодження', 'Потребує Letter of Protest в перші 24 години']] },
          { title: 'Управління тарою', rows: [['Деревʼяна (ISPM 15)', 'Обовʼязкове тавро "Колосок", інакше повернення'], ['Паллети', 'Euro паллети потрібні для крос-докінгу']] }
        ]
      },
      {
        ico: '⚖️', topic: 'Санкції та Обмеження', short: 'Dual-Use, 17-й Пакет ЄС', sections: [
          { title: 'Подвійне призначення', rows: [['Дозвіл Держекспорт.', 'Обовʼязковий при імпорті 84, 85, 90 груп'], ['EUC', 'Сертифікат кінцевого споживача (End User)'], ['Особливості', 'Дрони, рації, спецсплави, тепловізори']] },
          { title: 'Походження товару', rows: [['Мікс сировини', 'Правило достатньої переробки (додана вартість)'], ['Сертиф. EUR.1', 'Тільки за умови прямого транспортування'], ['Антидемпінг', 'Посилено щодо сталі, труб, ламп з КНР']] },
          { title: 'Актуальні ембарго (ЄС)', rows: [['РФ / РБ', 'Абсолютна заборона транзиту високотехн. товарів'], ['Китай', 'Посилений контроль виробників мікроелектроніки']] }
        ]
      }
    ];

    function renderZed() {
      const g = document.getElementById('zedGrid');
      zedTopics.forEach((t, i) => {
        const d = document.createElement('div');
        d.className = 'zed-card';
        d.innerHTML = `<div class="zed-ico">${t.ico}</div><h4>${t.topic}</h4><p>${t.short}</p>`;
        d.onclick = () => openZed(i);
        g.appendChild(d);
      });
    }

    function openZed(i) {
      const t = zedTopics[i];
      let html = `<button class="zed-back" onclick="closeZed()">← Назад</button>
    <div class="zed-detail-title">${t.ico} ${t.topic}</div>
    <div class="zed-detail-sub">${t.short}</div>`;
      t.sections.forEach(s => {
        html += `<div class="zed-sec"><h5>${s.title}</h5>`;
        s.rows.forEach(r => { html += `<div class="zed-row"><span class="zed-k">${r[0]}</span><span class="zed-v">${r[1]}</span></div>`; });
        html += `</div>`;
      });
      const det = document.getElementById('zedDetail');
      det.innerHTML = html; det.classList.add('open');
      document.getElementById('zedGrid').style.display = 'none';
    }

    function closeZed() {
      document.getElementById('zedDetail').classList.remove('open');
      document.getElementById('zedGrid').style.display = 'grid';
    }

    async function handleFileUpload(event) {
      const file = event.target.files[0];
      if (!file) return;
      const fileNameEl = document.getElementById('fileName');
      fileNameEl.textContent = '▣ ' + file.name;
      fileNameEl.style.display = 'block';
      const reader = new FileReader();
      reader.onload = async (e) => {
        const data = new Uint8Array(e.target.result);
        if (file.name.endsWith('.csv')) {
          const text = new TextDecoder().decode(data);
          uploadedFileData = [{ name: 'Sheet1', rows: parseCSV(text) }];
        } else {
          try {
            if (typeof XLSX === 'undefined') await loadXLSX();
            const workbook = XLSX.read(data, { type: 'array', cellDates: true, cellNF: false, cellText: false });
            uploadedFileData = [];
            let totalRows = 0;
            workbook.SheetNames.forEach(sheetName => {
              const sheet = workbook.Sheets[sheetName];
              const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false, blankrows: false });
              const rows = aoa
                .map(r => r.map(c => c == null ? '' : String(c).trim()))
                .filter(r => r.some(c => c && c.length > 0));
              if (rows.length > 0) {
                uploadedFileData.push({ name: sheetName, rows });
                totalRows += rows.length;
              }
            });
            if (uploadedFileData.length > 0) {
              fileNameEl.textContent = `▣ ${file.name} · ${uploadedFileData.length} листів · ${totalRows} рядків`;
            } else {
              fileNameEl.textContent = '✕ Файл порожній';
              fileNameEl.style.color = 'var(--red-bright)';
              uploadedFileData = null;
            }
          } catch (err) {
            alert('Помилка читання Excel файлу: ' + err.message);
            uploadedFileData = null;
            fileNameEl.textContent = '✕ Помилка читання файлу';
            fileNameEl.style.color = 'var(--red-bright)';
          }
        }
        if (!uploadedFileData || uploadedFileData.length === 0) {
          uploadedFileData = null;
        } else {
          document.getElementById('driveUrl').value = '';
        }
      };
      reader.readAsArrayBuffer(file);
    }

    function loadXLSX() {
      return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }

    // Live terminal clock
    function updateClock() {
      const now = new Date();
      const hh = String(now.getUTCHours()).padStart(2, '0');
      const mm = String(now.getUTCMinutes()).padStart(2, '0');
      const el = document.getElementById('termId');
      if (el) el.textContent = `LAP-01 · ${hh}:${mm} UTC`;
    }
    setInterval(updateClock, 10000);
    updateClock();

    init();
  