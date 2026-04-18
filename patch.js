const fs = require('fs');

try {
  let content = fs.readFileSync('index.html', 'utf8');

  // 1. Prepend helpers to `<script>`
  if (content.includes('let apiKey = localStorage.getItem') && !content.includes('function analyzeBatch')) {
    content = content.replace(
      /  <script>\s+let apiKey = localStorage\.getItem/,
      `  <script>
    const BATCH_SIZE = 25;

    function normalizeName(name) {
      if (!name) return '';
      return name.toString().toLowerCase().replace(/\\s+/g, ' ').trim();
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
            if (qty && qty !== '—') existing.qtyKg = qty;
            if (price && price !== '—') existing.buyPricePerKg = price;
            if (code && code !== '—') existing.uctzedCode = code;
            if (prod && prod !== '—') existing.producer = prod;
            if (danger && danger !== '—') existing.rawDanger = danger;
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

\${euRegulations ? \\\`АКТУАЛЬНІ ПРАВИЛА ТА ВИМОГИ ЄС:
\${euRegulations}\\\` : ''}

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
        return JSON.parse(data.choices[0].message.content.replace(/\\\`\\\`\\\`json|\\\`\\\`\\\`/g, '').trim());
      } catch (e) {
        throw new Error('Помилка парсингу JSON для батчу ' + batchIndex);
      }
    }

    let apiKey = localStorage.getItem`
    );
  }

  // 2. Replace runAudit body
  const blockStart = "        let allSheetsData = '';";
  const blockEnd = "        uploadedFileData = null;\n        document.getElementById('fileName').style.display = 'none';\n        document.getElementById('fileUpload').value = '';\n\n      } catch (e) {";

  const idxStart = content.indexOf(blockStart);
  const idxEnd = content.indexOf(blockEnd);

  if (idxStart !== -1 && idxEnd !== -1) {
    const before = content.substring(0, idxStart);
    const after = content.substring(idxEnd + blockEnd.length); // so 'after' starts with exactly the body of catch

    const replacement = `
        const sheetsByDate = sheets.map((sheet, idx) => {
          const dateMatch = sheet.name.match(/(\\d{1,2})[\\.\\-\\/](\\d{1,2})[\\.\\-\\/](\\d{4})/);
          let date = null;
          if (dateMatch) {
            const day = parseInt(dateMatch[1]);
            const month = parseInt(dateMatch[2]);
            const year = parseInt(dateMatch[3]);
            date = new Date(year, month - 1, day);
          }
          return { sheet, idx, date, name: sheet.name };
        }).sort((a, b) => {
          if (a.date && b.date) return b.date - a.date;
          if (a.date) return -1;
          if (b.date) return 1;
          return 0;
        });

        // Нормалізація товарів
        setLoaderStep('> Нормалізація даних...', 'Об’єднання та дедуплікація товарів');
        const normalizedItems = buildNormalizedItems(sheetsByDate);
        if (normalizedItems.length === 0) {
            throw new Error('Не вдалося розпізнати жодного товару в таблицях.');
        }

        // Розбивка на батчі
        const batches = chunkArray(normalizedItems, BATCH_SIZE);
        setLoaderStep(\`> Підготовлено \${batches.length} батчів для аналізу\`, \`Загалом \${normalizedItems.length} унікальних позицій\`);

        let finalItems = [];
        let globalCriticalAlerts = [];
        let globalNctsList = [];
        let failedBatches = 0;

        for (let i = 0; i < batches.length; i++) {
            setLoaderStep(\`> Аналіз батча \${i + 1} / \${batches.length}\`, \`Обробка \${batches[i].length} позицій...\`);
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

      } catch (e) {`;

    content = before + replacement + after;
  }

  // 3. Remove formatTableForAI
  const ftStart = "function formatTableForAI(rows) {";
  const formatTableEndIdx = content.indexOf("return output;\n    }", content.indexOf(ftStart));
  if (content.indexOf(ftStart) > -1 && formatTableEndIdx > -1) {
      const ftEndString = "return output;\n    }";
      let beforeFt = content.substring(0, content.indexOf(ftStart));
      let afterFt = content.substring(formatTableEndIdx + ftEndString.length);
      content = beforeFt + afterFt;
  }

  fs.writeFileSync('index.html', content, 'utf8');
  console.log('PATCH_SUCCESS');
} catch (e) {
  console.error('PATCH_ERROR:', e);
}
