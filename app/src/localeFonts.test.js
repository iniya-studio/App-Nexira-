import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocaleFontLoader, getLocaleFontConfig } from './localeFonts.js';
import { getTargetLocales } from './locales.js';

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

test('every target locale resolves to a script-appropriate font family', () => {
  const expectedFamilies = {
    en: /Inter Variable/,
    fa: /Noto Sans Arabic/,
    ar: /Noto Sans Arabic/,
    es: /Inter Variable/,
    fr: /Inter Variable/,
    de: /Inter Variable/,
    pt: /Inter Variable/,
    ru: /Inter Variable/,
    tr: /Inter Variable/,
    hi: /Noto Sans Devanagari/,
    id: /Inter Variable/,
    ja: /Noto Sans JP/,
    ko: /Noto Sans KR/,
    'zh-CN': /Noto Sans SC/,
    bn: /Noto Sans Bengali/,
    ur: /Noto Nastaliq Urdu/,
    it: /Inter Variable/,
    nl: /Inter Variable/,
    th: /Noto Sans Thai/,
    vi: /Inter Variable/,
  };

  assert.deepEqual(Object.keys(expectedFamilies).sort(), getTargetLocales().map(({ code }) => code).sort());
  for (const locale of getTargetLocales()) {
    const config = getLocaleFontConfig(locale.code);
    assert.equal(config.code, locale.code);
    assert.match(config.family, expectedFamilies[locale.code], `Wrong font family for ${locale.code}`);
  }
  assert.equal(getLocaleFontConfig('unknown').code, 'en');
});

test('font loader imports and applies the selected target locale font', async () => {
  const documentRef = createDocument();
  const imported = [];
  const importers = Object.fromEntries(getTargetLocales().map(({ code }) => [code, async () => imported.push(code)]));
  const loader = createLocaleFontLoader({ documentRef, importers });

  for (const locale of getTargetLocales()) {
    const result = await loader(locale.code);
    assert.equal(result.applied, true);
    assert.equal(result.locale, locale.code);
    assert.equal(documentRef.documentElement.dataset.localeFont, locale.code);
    assert.match(documentRef.documentElement.properties.get('--font-body'), getLocaleFontConfig(locale.code).family.includes('Noto') ? /Noto/ : /Inter/);
  }
  assert.deepEqual(imported, getTargetLocales().map(({ code }) => code));
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
    importers: { en: async () => {}, ja: async () => { throw new Error('font chunk unavailable'); } },
  });
  const result = await loader('ja');
  assert.equal(result.fallback, true);
  assert.equal(documentRef.documentElement.dataset.localeFont, 'en');
  assert.match(documentRef.documentElement.properties.get('--font-body'), /Inter Variable/);
});

test('a failed script font and failed English fallback reject without applying a font', async () => {
  const documentRef = createDocument();
  const loader = createLocaleFontLoader({
    documentRef,
    importers: {
      en: async () => { throw new Error('English font chunk unavailable'); },
      ja: async () => { throw new Error('Japanese font chunk unavailable'); },
    },
  });

  await assert.rejects(loader('ja'), /English font chunk unavailable/);
  assert.equal(documentRef.documentElement.dataset.localeFont, undefined);
  assert.equal(documentRef.documentElement.properties.has('--font-body'), false);
});

test('a failed English font import rejects without applying an invalid font', async () => {
  const documentRef = createDocument();
  const loader = createLocaleFontLoader({
    documentRef,
    importers: { en: async () => { throw new Error('English font chunk unavailable'); } },
  });

  await assert.rejects(loader('en'), /English font chunk unavailable/);
  assert.equal(documentRef.documentElement.dataset.localeFont, undefined);
  assert.equal(documentRef.documentElement.properties.has('--font-body'), false);
});

test('font loader rejects clearly when the document root or style API is unavailable', async () => {
  const importers = { en: async () => {} };
  const missingDocument = createLocaleFontLoader({ documentRef: null, importers });
  const missingStyle = createLocaleFontLoader({
    documentRef: { documentElement: { dataset: {} } },
    importers,
  });

  await assert.rejects(missingDocument('en'), /requires a document root/);
  await assert.rejects(missingStyle('en'), /requires a document root/);
});

test('a stale fallback import cannot override a newer font selection', async () => {
  const documentRef = createDocument();
  let rejectJapanese;
  let resolveEnglishFallback;
  const japaneseImport = new Promise((_, reject) => { rejectJapanese = reject; });
  const englishFallback = new Promise((resolve) => { resolveEnglishFallback = resolve; });
  const loader = createLocaleFontLoader({
    documentRef,
    importers: {
      en: () => englishFallback,
      ja: () => japaneseImport,
      fa: async () => {},
    },
  });

  const staleRequest = loader('ja');
  rejectJapanese(new Error('Japanese chunk unavailable'));
  await Promise.resolve();
  const latestRequest = await loader('fa');
  resolveEnglishFallback();
  const staleResult = await staleRequest;

  assert.equal(latestRequest.applied, true);
  assert.equal(staleResult.stale, true);
  assert.equal(staleResult.fallback, true);
  assert.equal(documentRef.documentElement.dataset.localeFont, 'fa');
  assert.match(documentRef.documentElement.properties.get('--font-body'), /Noto Sans Arabic/);
});
