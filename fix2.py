import re

with open('index.html', 'r', encoding='utf-8', errors='surrogateescape') as f:
    content = f.read()

correct_analyzeBatch = """    async function analyzeBatch(batch, apiKey, euRegulations, batchIndex, totalBatches) {
      const systemPrompt = `Ти — професійний аналітик міжнародної логістики та митного оформлення фармацевтичних та хімічних вантажів.
ПОТОЧНА ДАТА: КВІТЕНЬ 2026.

${euRegulations ? `АКТУАЛЬНІ ПРАВИЛА ТА ВИМОГИ ЄС:\\n${euRegulations}` : ''}

ТВОЯ ЗАДАЧА:
Проаналізуй БАТЧ товарів (переданий у JSON). ОБОВ'ЯЗКОВО зберігай всі позиції. Їх рівно ${batch.length}.
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

⚠️ КРИТИЧНО ВАЖЛИВО: Ти ПОВИНЕН повернути ТОЧНО ${batch.length} об'єктів у "items". НЕ ПРОПУСКАЙ ЖОДНОГО НАДАНОГО ТОВАРУ.`;

      const userPrompt = `БАТЧ ТОВАРІВ НА АНАЛІЗ (${batch.length} шт):\\n${JSON.stringify(batch)}

Уважно перевір щоб в items було рівно ${batch.length} об'єктів. Відповідь виключно в JSON!`;

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
        return JSON.parse(data.choices[0].message.content.replace(/```json|```/g, '').trim());
      } catch (e) {
        throw new Error('Помилка парсингу JSON для батчу ' + batchIndex);
      }
    }"""

def replacer(match):
    return correct_analyzeBatch + '\\n\\n    '

content = re.sub(r'async function analyzeBatch.*?\}\s*(?=let apiKey = localStorage)', replacer, content, flags=re.DOTALL)

with open('index.html', 'w', encoding='utf-8', errors='surrogateescape') as f:
    f.write(content)
print("FIX DONE")
