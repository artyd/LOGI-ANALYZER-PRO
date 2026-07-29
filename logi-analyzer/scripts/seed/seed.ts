/**
 * Заливка мігрованих довідників у Neon Postgres.
 * Запуск (після налаштування DATABASE_URL):
 *   npx tsx scripts/seed/seed.ts
 *
 * УВАГА: потребує живої БД — у Фазі 1 без Neon НЕ запускався. Перевірити при деплої.
 */
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '../../lib/db/schema';
import {
  PRODUCT_ORIGIN_KB,
  MANUFACTURER_KB,
  ADR_SUBSTANCE_DB,
  UKTZED_CODE_DB,
  HS_DUTY_TABLE,
  PRECURSOR_WATCH,
} from '../../lib/data';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL не задано.');
  const db = drizzle(neon(url), { schema });

  const today = new Date().toISOString().slice(0, 10);

  // Джерело + версія (KB-міграція)
  const [source] = await db
    .insert(schema.datasetSource)
    .values({ name: 'index.html v2.3 KB', kind: 'KB', url: 'local' })
    .returning();
  const [version] = await db
    .insert(schema.datasetVersion)
    .values({
      sourceId: source.id,
      versionLabel: 'migrated-from-index.html-v2.3',
      validFrom: today,
    })
    .returning();
  const dv = version.id;

  // product_origin
  await db.insert(schema.productOrigin).values(
    PRODUCT_ORIGIN_KB.map((e) => ({
      aliases: e.keys,
      originType: e.originType,
      productionMethod: e.productionMethod,
      category: e.category,
      confidence: e.confidence,
      datasetVersionId: dv,
    })),
  );

  // manufacturer
  await db.insert(schema.manufacturer).values(
    MANUFACTURER_KB.map((e) => ({
      name: e.keys[0] ?? '',
      aliases: e.keys,
      country: e.country ?? null,
      originHint: e.originType ?? null,
      gmpStatus: e.gmpStatus ?? null,
      datasetVersionId: dv,
    })),
  );

  // adr_substance
  await db.insert(schema.adrSubstance).values(
    ADR_SUBSTANCE_DB.map((e) => ({
      aliases: e.keys,
      unNumber: e.un,
      class: e.class,
      packingGroup: e.pg,
      label: e.label,
      description: e.desc,
      datasetVersionId: dv,
    })),
  );

  // precursor
  await db.insert(schema.precursor).values(
    PRECURSOR_WATCH.map((e) => ({
      nameRegex: e.name.source,
      codeRegex: e.code.source,
      schedule: e.table,
      note: e.note,
      datasetVersionId: dv,
    })),
  );

  // hs_code (уктзед10 з довідника кодів) + code_alias
  const seenCode = new Set<string>();
  const hsRows: (typeof schema.hsCode.$inferInsert)[] = [];
  const aliasRows: (typeof schema.codeAlias.$inferInsert)[] = [];
  for (const e of UKTZED_CODE_DB) {
    const code = e.code.replace(/\D/g, '').slice(0, 10);
    if (code.length === 10 && !seenCode.has(code)) {
      seenCode.add(code);
      hsRows.push({ code, level: 'uktzed10', parentCode: code.slice(0, 6), descriptionUk: e.name });
    }
    for (const k of e.keys) aliasRows.push({ code, aliasText: k, source: 'UKTZED_CODE_DB' });
  }
  if (hsRows.length) await db.insert(schema.hsCode).values(hsRows);
  if (aliasRows.length) await db.insert(schema.codeAlias).values(aliasRows);

  // duty_rate (груба HS_DUTY_TABLE → kb_coarse)
  await db.insert(schema.dutyRate).values(
    Object.entries(HS_DUTY_TABLE).map(([code, rate]) => ({
      code,
      regime: 'UA_MFN',
      ratePercent: String(rate),
      source: 'kb_coarse',
      datasetVersionId: dv,
    })),
  );

  console.log(
    `Залито: origin=${PRODUCT_ORIGIN_KB.length}, manuf=${MANUFACTURER_KB.length}, adr=${ADR_SUBSTANCE_DB.length}, precursor=${PRECURSOR_WATCH.length}, hs=${hsRows.length}, alias=${aliasRows.length}, duty=${Object.keys(HS_DUTY_TABLE).length}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
