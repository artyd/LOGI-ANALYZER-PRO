import {
  pgTable,
  serial,
  integer,
  text,
  varchar,
  numeric,
  boolean,
  timestamp,
  date,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';

/**
 * Довідкова модель Neon Postgres.
 * Кожен довідковий рядок посилається на dataset_version → point-in-time,
 * аудит і відкат без мутацій (нова версія + вікно валідності).
 */

// ── Версіонування джерел даних ────────────────────────────────────
export const datasetSource = pgTable('dataset_source', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  // 'UA_TARIFF' | 'EU_TARIC' | 'VAT' | 'EXCISE' | 'SANCTIONS' | 'DUAL_USE' | 'KB' | 'FX' ...
  kind: varchar('kind', { length: 32 }).notNull(),
  url: text('url'),
  license: text('license'),
  retrievedAt: timestamp('retrieved_at', { withTimezone: true }).defaultNow(),
});

export const datasetVersion = pgTable('dataset_version', {
  id: serial('id').primaryKey(),
  sourceId: integer('source_id').notNull().references(() => datasetSource.id),
  versionLabel: text('version_label').notNull(),
  validFrom: date('valid_from').notNull(),
  validTo: date('valid_to'), // null → чинна
  importedAt: timestamp('imported_at', { withTimezone: true }).defaultNow(),
  rowCount: integer('row_count'),
  checksum: text('checksum'),
});

// ── Коди і тариф ──────────────────────────────────────────────────
export const hsCode = pgTable(
  'hs_code',
  {
    code: varchar('code', { length: 10 }).primaryKey(),
    // 'chapter' | 'heading' | 'subheading' | 'uktzed10'
    level: varchar('level', { length: 12 }).notNull(),
    parentCode: varchar('parent_code', { length: 10 }),
    descriptionUk: text('description_uk'),
    descriptionEn: text('description_en'),
  },
  (t) => [index('hs_code_parent_idx').on(t.parentCode)],
);

export const dutyRate = pgTable(
  'duty_rate',
  {
    id: serial('id').primaryKey(),
    code: varchar('code', { length: 10 }).notNull(),
    // 'UA_MFN' | 'UA_EU_DCFTA' | 'EU_ERGA_OMNES' | 'EU_PREF'
    regime: varchar('regime', { length: 16 }).notNull(),
    originGroup: varchar('origin_group', { length: 32 }),
    ratePercent: numeric('rate_percent', { precision: 6, scale: 3 }),
    // специфічна/комбінована ставка: { amount, currency, unit }
    rateSpecificJson: jsonb('rate_specific_json'),
    // 'db' | 'kb_coarse' — джерело точності
    source: varchar('source', { length: 16 }).notNull().default('db'),
    datasetVersionId: integer('dataset_version_id').references(() => datasetVersion.id),
  },
  (t) => [index('duty_rate_code_idx').on(t.code, t.regime)],
);

export const vatRate = pgTable(
  'vat_rate',
  {
    id: serial('id').primaryKey(),
    code: varchar('code', { length: 10 }).notNull(),
    country: varchar('country', { length: 2 }).notNull().default('UA'),
    ratePercent: numeric('rate_percent', { precision: 5, scale: 2 }).notNull(), // 20 | 7 | 0
    requiresRegistration: boolean('requires_registration').notNull().default(false),
    conditionNote: text('condition_note'),
    datasetVersionId: integer('dataset_version_id').references(() => datasetVersion.id),
  },
  (t) => [index('vat_rate_code_idx').on(t.code)],
);

export const exciseRate = pgTable('excise_rate', {
  id: serial('id').primaryKey(),
  code: varchar('code', { length: 10 }).notNull(),
  basis: varchar('basis', { length: 16 }), // 'per_kg' | 'per_l' | 'ad_valorem'
  amount: numeric('amount', { precision: 12, scale: 4 }),
  currency: varchar('currency', { length: 3 }),
  unit: varchar('unit', { length: 16 }),
  datasetVersionId: integer('dataset_version_id').references(() => datasetVersion.id),
});

/** Аліаси/ключі для класифікації (замінюють наївний substring-пошук). */
export const codeAlias = pgTable(
  'code_alias',
  {
    id: serial('id').primaryKey(),
    code: varchar('code', { length: 10 }).notNull(),
    aliasText: text('alias_text').notNull(),
    lang: varchar('lang', { length: 4 }), // 'uk' | 'ru' | 'en'
    source: varchar('source', { length: 24 }), // 'UKTZED_CODE_DB' ...
  },
  // pg_trgm GIN-індекс додається в міграції SQL (gin_trgm_ops).
  (t) => [index('code_alias_code_idx').on(t.code)],
);

// ── Довідники (міграція з index.html KB) ──────────────────────────
export const productOrigin = pgTable('product_origin', {
  id: serial('id').primaryKey(),
  aliases: jsonb('aliases').notNull(), // string[]
  originType: varchar('origin_type', { length: 24 }),
  productionMethod: text('production_method'),
  category: text('category'),
  confidence: varchar('confidence', { length: 8 }),
  datasetVersionId: integer('dataset_version_id').references(() => datasetVersion.id),
});

export const manufacturer = pgTable('manufacturer', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  aliases: jsonb('aliases'), // string[]
  country: varchar('country', { length: 2 }),
  originHint: varchar('origin_hint', { length: 24 }),
  gmpStatus: text('gmp_status'),
  datasetVersionId: integer('dataset_version_id').references(() => datasetVersion.id),
});

export const adrSubstance = pgTable('adr_substance', {
  id: serial('id').primaryKey(),
  aliases: jsonb('aliases'), // string[]
  unNumber: varchar('un_number', { length: 8 }),
  class: varchar('class', { length: 8 }),
  packingGroup: varchar('packing_group', { length: 4 }),
  label: text('label'),
  description: text('description'),
  datasetVersionId: integer('dataset_version_id').references(() => datasetVersion.id),
});

export const precursor = pgTable('precursor', {
  id: serial('id').primaryKey(),
  nameUk: text('name_uk'),
  nameEn: text('name_en'),
  nameRegex: text('name_regex'), // з PRECURSOR_WATCH
  codeRegex: text('code_regex'),
  schedule: integer('schedule'), // таблиця ООН 1-4 (0 = наркотик)
  note: text('note'),
  datasetVersionId: integer('dataset_version_id').references(() => datasetVersion.id),
});

// ── Експертний рулбук (AI не перезаписує) ─────────────────────────
export const rule = pgTable(
  'rule',
  {
    id: serial('id').primaryKey(),
    code: varchar('code', { length: 32 }).notNull(),
    // 'origin' | 'eu_transit' | 'ua_import' | 'adr' | 'precursor' | 'vat' | 'sanctions'
    scope: varchar('scope', { length: 16 }).notNull(),
    appliesWhen: jsonb('applies_when').notNull(), // предикат
    effect: jsonb('effect').notNull(), // пункти чеклиста / режим ПДВ / документи
    severity: varchar('severity', { length: 12 }), // 'red' | 'yellow' | 'green'
    citationUrl: text('citation_url'),
    priority: integer('priority').notNull().default(100),
    active: boolean('active').notNull().default(true),
    datasetVersionId: integer('dataset_version_id').references(() => datasetVersion.id),
  },
  (t) => [index('rule_scope_idx').on(t.scope, t.priority)],
);

// Фаза 2+: sanctions_entry та doc_chunk (pgvector) додаються пізніше.
