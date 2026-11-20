import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocaleFontLoader, getLocaleFontConfig } from './localeFonts.js';

function createDocument() {
  const properties = new Map();
  return {
    documentElement: {
      style: { setProperty: (name, value) => properties.set(name, value) },
      dataset: {},
      properties,
    },
  };
}

test('locale font configuration maps script-specific families', () => {
  assert.equal(getLocaleFontConfig('fa').code, 'fa');
  assert.match(getLocaleFontConfig('fa').family, /Noto Sans Arabic/);
  assert.match(getLocaleFontConfig('ur').family, /Noto Nastaliq Urdu/);
  assert.match(getLocaleFontConfig('ja').family, /Noto Sans JP/);
  assert.equal(getLocaleFontConfig('unknown').code, 'en');
});

test('font loader applies the selected locale after its import resolves', async () => {
  const documentRef = createDocument();
  let imported = '';
  const loader = createLocaleFontLoader({
    documentRef,
    importers: {
      en: async () => { imported = 'en'; },
      fa: async () => { imported = 'fa'; },
    },
  });
  const result = await loader('fa');
  assert.equal(imported, 'fa');
  assert.equal(result.applied, true);
  assert.equal(documentRef.documentElement.dataset.localeFont, 'fa');
  assert.match(documentRef.documentElement.properties.get('--font-body'), /Noto Sans Arabic/);
});

test('a stale font request cannot override the latest selected locale', async () => {
  const documentRef = createDocument();
  let resolvePersian;
  const persianImport = new Promise((resolve) => { resolvePersian = resolve; });
  const loader = createLocaleFontLoader({
    documentRef,
    importers: { en: async () => {}, fa: () => persianImport },
  });
  const staleRequest = loader('fa');
  const latestRequest = await loader('en');
  resolvePersian();
  const staleResult = await staleRequest;
  assert.equal(latestRequest.applied, true);
  assert.equal(staleResult.stale, true);
  assert.equal(documentRef.documentElement.dataset.localeFont, 'en');
  assert.match(documentRef.documentElement.properties.get('--font-body'), /Inter Variable/);
});

test('a script font import failure safely falls back to Inter', async () => {
  const documentRef = createDocument();
  const loader = createLocaleFontLoader({
    documentRef,
    importers: { en: async () => {}, fa: async () => { throw new Error('font chunk unavailable'); } },
  });
  const result = await loader('fa');
  assert.equal(result.fallback, true);
  assert.equal(documentRef.documentElement.dataset.localeFont, 'en');
  assert.match(documentRef.documentElement.properties.get('--font-body'), /Inter Variable/);
});
