/**
 * Вбудований СТАТУТНИЙ тариф UA — 10-значні коди УКТЗЕД + ставки ввізного мита
 * із Закону №2697-IX «Про Митний тариф України».
 *
 * СТАТУС ДАНИХ: файл `ua_tariff10.json` наразі ПОРОЖНІЙ. Повного імпортного
 * тарифу 2697-IX у відкритому машиночитаному вигляді немає (перевірено 2026-07):
 *  - zakon.rada.gov.ua — anti-bot (curl отримує заглушку);
 *  - data.gov.ua `scsu-register-duty-rates` — лише ВИВІЗНЕ мито (28 позицій: худоба,
 *    олійні, брухт), НЕ ввізний тариф;
 *  - WITS/UNCTAD (SDMX) — лише рівень HS-6 (агрегат), без 10-значних ліній.
 *
 * Тому вбудовуємо інфраструктуру (цей лукап + пріоритет у resolve + build-скрипт
 * `scripts/build-tariff10.ts`), а не вигадані ставки. Коли офіційний файл здобуто
 * (вивантаження QDPro/1С або офіц. XLSX), `npm run build-tariff10 <file>` наповнює
 * JSON — і ставки стають авторитетними на 10-значному рівні БЕЗ ручного аплоуду.
 *
 * Пріоритет ставки у resolve: тариф користувача (runtime) > СТАТУТНИЙ (тут) >
 * реальна MFN WITS (HS-6) > груба таблиця.
 */
import { buildTariffTable, type TariffEntry, type TariffTable } from '../tariff/tariff';
import statutoryRaw from '../data/ua_tariff10.json';

/** Вбудований статутний тариф (порожній, поки не наповнено офіційним файлом). */
export const STATUTORY_TARIFF: TariffTable = buildTariffTable(statutoryRaw as TariffEntry[]);

/** Скільки 10-значних позицій наразі вбудовано (0 = ще не наповнено). */
export const STATUTORY_SIZE = STATUTORY_TARIFF.size;
