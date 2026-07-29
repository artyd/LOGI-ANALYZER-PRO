// Типізовані завантажувачі мігрованих довідників (з index.html → JSON).
// Ці ж дані використовуються сид-скриптами для заливки в Postgres.
import productOriginRaw from './product_origin_kb.json';
import manufacturerRaw from './manufacturer_kb.json';
import adrRaw from './adr_substance_db.json';
import uktzedRaw from './uktzed_code_db.json';
import hsDutyRaw from './hs_duty_table.json';
import precursorRaw from './precursor_watch.json';

export interface ProductOriginEntry {
  keys: string[];
  originType: string;
  productionMethod: string;
  category: string;
  confidence: string;
}
export interface ManufacturerEntry {
  keys: string[];
  originType?: string;
  productionMethod?: string;
  gmpStatus?: string;
  country?: string;
}
export interface AdrEntry {
  keys: string[];
  un: string;
  class: string;
  pg: string;
  label: string;
  desc: string;
}
export interface UktzedEntry {
  keys: string[];
  code: string;
  name: string;
}
export type HsDutyTable = Record<string, number>;

interface RegexJson { __regex: true; source: string; flags: string }
interface PrecursorRaw {
  name: RegexJson;
  code: RegexJson;
  table: number;
  note: string;
}
export interface PrecursorEntry {
  name: RegExp;
  code: RegExp;
  table: number;
  note: string;
}

export const PRODUCT_ORIGIN_KB = productOriginRaw as ProductOriginEntry[];
export const MANUFACTURER_KB = manufacturerRaw as ManufacturerEntry[];
export const ADR_SUBSTANCE_DB = adrRaw as AdrEntry[];
export const UKTZED_CODE_DB = uktzedRaw as UktzedEntry[];
export const HS_DUTY_TABLE = hsDutyRaw as HsDutyTable;

// Регідратація regex з {__regex, source, flags}
export const PRECURSOR_WATCH: PrecursorEntry[] = (precursorRaw as PrecursorRaw[]).map((p) => ({
  name: new RegExp(p.name.source, p.name.flags),
  code: new RegExp(p.code.source, p.code.flags),
  table: p.table,
  note: p.note,
}));
