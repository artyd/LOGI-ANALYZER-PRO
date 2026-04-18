import re

with open('index.html', 'r', encoding='utf-8', errors='surrogateescape') as f:
    content = f.read()

correct_runAudit = """    async function runAudit() {
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
                content: `Яка актуальна інформація станом на квітень 2026 року про:\n1. Правила транзиту фармацевтичних і хімічних вантажів через ЄС.\n2. Нові вимоги у системі NCTS Phase 5, які запрацювали у 2025/2026 роках.`
              }]
            })
          });
          const d = await searchRes.json();
          if(d.choices && d.choices[0] && d.choices[0].message) {
            euRegulations = d.choices[0].message.content;
          }
          setLoaderStep('> ЄС правила оновлено', 'Підготовка промпту');
        } catch (err) {
          console.warn('Не вдалося завантажити правила ЄС:', err);
        }

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
        setLoaderStep(`> Підготовлено ${batches.length} батчів для аналізу`, `Загалом ${normalizedItems.length} унікальних позицій`);

        let finalItems = [];
        let globalCriticalAlerts = [];
        let globalNctsList = [];
        let failedBatches = 0;

        for (let i = 0; i < batches.length; i++) {
            setLoaderStep(`> Аналіз батча ${i + 1} / ${batches.length}`, `Обробка ${batches[i].length} позицій...`);
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
                console.error(`Помилка батча ${i + 1}:`, err);
                failedBatches++;
                document.getElementById('resultsArea').insertAdjacentHTML('beforeend', 
                    `<div class="status-box error" style="display:block; margin-top:20px; text-align: left;">
                      ⚠️ Помилка обробки батча ${i + 1}: ${err.message}
                     </div>`);
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
            document.getElementById('resultsArea').innerHTML += `<div class="status-box error" style="display:block; margin-bottom:20px;">Аналіз завершено, але ${failedBatches} батчів не вдалося обробити. Результати можуть бути неповними.</div>`;
        }
        
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
    }"""

def replacer(match):
    return correct_runAudit + '\\n\\n    function extractSheetId(url)'

content = re.sub(r'async function runAudit\(\) \{.*?function extractSheetId\(url\)', replacer, content, flags=re.DOTALL)

with open('index.html', 'w', encoding='utf-8', errors='surrogateescape') as f:
    f.write(content)
print("FIX DONE")
