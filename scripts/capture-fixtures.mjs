#!/usr/bin/env node
/**
 * Captures small, real API responses into tests/fixtures/ so the services
 * layer (Phase 3) can be tested offline and deterministically.
 *
 * Usage:  npm run fixtures            (province 28 = Madrid by default)
 *         npm run fixtures -- 46      (another province code)
 *
 * Run it once, check the files look right, and commit them.
 * Re-run only when an API changes its format.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROVINCE = (process.argv[2] ?? '28').padStart(2, '0');
const MAX_STATIONS = 25;
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'tests', 'fixtures');

const MITECO = 'https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes';
const NOMINATIM = 'https://nominatim.openstreetmap.org';
const OSRM = 'https://router.project-osrm.org/route/v1/driving';

// Nominatim's usage policy asks every client to identify itself.
const USER_AGENT = 'gasolineras-fixtures/0.1 (+https://github.com/oscarpg/gasolineras)';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function mitecoDate(d) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${d.getFullYear()}`;
}

async function get(url, accept = 'application/json') {
  const res = await fetch(url, { headers: { Accept: accept, 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

function trimMitecoJson(text) {
  const json = JSON.parse(text);
  return { ...json, ListaEESSPrecio: (json.ListaEESSPrecio ?? []).slice(0, MAX_STATIONS) };
}

function trimMitecoXml(text) {
  const items = text.match(/<EESSPrecio>[\s\S]*?<\/EESSPrecio>/g) ?? [];
  if (items.length === 0) return text;
  const start = text.indexOf(items[0]);
  const end = text.indexOf(items[items.length - 1]) + items[items.length - 1].length;
  return text.slice(0, start) + items.slice(0, MAX_STATIONS).join('\n') + text.slice(end);
}

async function save(name, content) {
  const body = typeof content === 'string' ? content : JSON.stringify(content, null, 2) + '\n';
  await writeFile(join(OUT_DIR, name), body, 'utf8');
  console.log(`  ✔ ${name} (${(Buffer.byteLength(body) / 1024).toFixed(1)} KB)`);
}

async function step(label, fn) {
  try {
    await fn();
  } catch (err) {
    console.error(`  ✖ ${label}: ${err.message}`);
    if (/certificate|UNABLE_TO_VERIFY|SELF_SIGNED/i.test(String(err.cause ?? err))) {
      console.error('    Hint: retry with   NODE_OPTIONS=--use-system-ca npm run fixtures');
    }
    process.exitCode = 1;
  }
}

await mkdir(OUT_DIR, { recursive: true });
console.log(`Capturing fixtures for province ${PROVINCE} → ${OUT_DIR}`);

const yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 1);

await step('MITECO province (JSON)', async () => {
  const text = await get(`${MITECO}/EstacionesTerrestres/FiltroProvincia/${PROVINCE}`);
  await save(`miteco-province-${PROVINCE}.json`, trimMitecoJson(text));
});

await step('MITECO province (XML)', async () => {
  const text = await get(`${MITECO}/EstacionesTerrestres/FiltroProvincia/${PROVINCE}`, 'application/xml');
  await save(`miteco-province-${PROVINCE}.xml`, trimMitecoXml(text));
});

await step('MITECO history (yesterday, JSON)', async () => {
  const text = await get(
    `${MITECO}/EstacionesTerrestresHist/FiltroProvincia/${mitecoDate(yesterday)}/${PROVINCE}`,
  );
  await save(`miteco-history-${PROVINCE}.json`, trimMitecoJson(text));
});

await step('Nominatim search', async () => {
  const q = encodeURIComponent('Puerta del Sol, Madrid');
  const text = await get(`${NOMINATIM}/search?format=json&addressdetails=1&limit=1&q=${q}`);
  await save('nominatim-search.json', JSON.parse(text));
});

await sleep(1100); // Nominatim: max 1 request per second

await step('Nominatim reverse', async () => {
  const text = await get(`${NOMINATIM}/reverse?format=json&addressdetails=1&lat=40.4168&lon=-3.7038`);
  await save('nominatim-reverse.json', JSON.parse(text));
});

await step('OSRM route', async () => {
  // Puerta del Sol → Puerta de Toledo (short route, small file)
  const text = await get(`${OSRM}/-3.7038,40.4168;-3.7110,40.4067?overview=full&geometries=geojson`);
  await save('osrm-route.json', JSON.parse(text));
});

console.log(process.exitCode ? 'Done, with errors (see above).' : 'Done.');
