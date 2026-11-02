import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { CATEGORIES } from './game/data.js';
import { COPY, formatCopy, getCopy } from './i18n.js';

test('English and Persian provide the same complete translation keys', () => {
  assert.deepEqual(Object.keys(COPY.fa).sort(), Object.keys(COPY.en).sort());

  for (const key of Object.keys(COPY.en)) {
    const english = COPY.en[key];
    const persian = COPY.fa[key];
    if (typeof english === 'string') {
      assert.equal(typeof persian, 'string', `Invalid Persian translation: ${key}`);
      assert.notEqual(english.trim(), '');
      assert.notEqual(persian.trim(), '');
    } else {
      assert.deepEqual(Object.keys(persian).sort(), Object.keys(english).sort(), `Missing nested translation: ${key}`);
    }
  }
});

test('all UI translation references and data-backed category labels are present', async () => {
  const appSource = await readFile(new URL('./App.jsx', import.meta.url), 'utf8');
  const references = [...appSource.matchAll(/\btext\.([A-Za-z]\w*)/g)].map((match) => match[1]);
  for (const key of references) assert.ok(key in COPY.en && key in COPY.fa, `Missing translation: ${key}`);

  for (const category of CATEGORIES) {
    for (const language of Object.values(COPY)) {
      assert.ok(language.categorySubtitles[category.id], `Missing ${category.id} subtitle`);
      assert.equal(language.modeNames[category.id]?.length, category.modes.length, `Missing ${category.id} mode translations`);
    }
  }
});

test('unknown languages fall back to English and interpolation avoids undefined text', () => {
  assert.equal(getCopy('unknown'), COPY.en);
  assert.equal(formatCopy(COPY.fa.answeredProgress, { answered: 2, total: 3 }), '2 از 3 پاسخ داده شد');
  assert.equal(formatCopy('Value: {missing}', {}), 'Value: ');
});
