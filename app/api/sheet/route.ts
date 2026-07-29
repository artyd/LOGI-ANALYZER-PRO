import { z } from 'zod';
import * as XLSX from 'xlsx';

export const runtime = 'nodejs';
export const maxDuration = 30;

const Body = z.object({ url: z.string().min(8) });

function extractSheetId(url: string): string | null {
  const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : null;
}

export async function POST(req: Request): Promise<Response> {
  let body;
  try {
    body = Body.parse(await req.json());
  } catch (e) {
    return Response.json({ error: `Некоректний запит: ${(e as Error).message}` }, { status: 400 });
  }

  const id = extractSheetId(body.url);
  if (!id) {
    return Response.json({ error: 'Не схоже на посилання Google Sheets.' }, { status: 400 });
  }

  const exportUrl = `https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`;
  let buf: ArrayBuffer;
  try {
    const res = await fetch(exportUrl);
    if (!res.ok) {
      return Response.json(
        { error: `Не вдалося завантажити таблицю (HTTP ${res.status}). Переконайтесь, що доступ «Усі з посиланням».` },
        { status: 502 },
      );
    }
    buf = await res.arrayBuffer();
  } catch (e) {
    return Response.json({ error: `Помилка мережі: ${(e as Error).message}` }, { status: 502 });
  }

  try {
    const wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true, cellNF: false, cellText: false });
    const sheets = wb.SheetNames.map((name) => ({
      name,
      rows: XLSX.utils.sheet_to_json(wb.Sheets[name], {
        header: 1,
        defval: '',
        raw: false,
        blankrows: false,
      }) as (string | number | null)[][],
    }));
    return Response.json({ sheets });
  } catch (e) {
    return Response.json({ error: `Не вдалося розібрати таблицю: ${(e as Error).message}` }, { status: 502 });
  }
}
