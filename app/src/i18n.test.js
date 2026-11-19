import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { CATEGORIES, normalizeProfile } from './game/data.js';
import { DEFAULT_LOCALE, formatLocaleNumber, getLocaleConfig, getSupportedLocales, getTargetLocales, isSupportedLocale, isTargetLocale, resolveLocale } from './locales.js';
import { COPY, formatCopy, getCategoryTitle, getCopy, getQuestionCopy, PERSIAN_QUESTIONS } from './i18n.js';

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


test('home screen copy is centralized and complete for every active locale', () => {
  const keys = ['matchModes', 'duelDescription', 'aiDescription', 'quickBattle', 'quickBattleNote', 'yourStats', 'matches', 'bestScore', 'accuracy', 'store'];
  for (const locale of ['en', 'fa']) {
    for (const key of keys) assert.ok(COPY[locale].home[key]?.trim(), `Missing ${locale} home copy: ${key}`);
  }
});


test('store screen copy is centralized and complete for every active locale', () => {
  const keys = ['eyebrow', 'title', 'description', 'collection', 'heroTitle', 'heroDescription', 'catalogPreview', 'categories', 'paymentsOff', 'emptyTitle', 'emptyDescription', 'explore', 'preview', 'viewStyle', 'fairness', 'close', 'cosmeticPreview', 'modalNotice'];
  for (const locale of ['en', 'fa']) {
    for (const key of keys) assert.ok(COPY[locale].store[key]?.trim(), `Missing ${locale} store copy: ${key}`);
  }
});


test('competitive match gameplay copy is centralized and has complete English/Persian coverage', async () => {
  const keys = ['unavailable', 'retry', 'serverMatch', 'localPreview', 'submittingAnswer', 'waitingForJudge', 'preparingQuestion', 'answersBeingJudged', 'answerSendingSecurely', 'aiPreparingMatch', 'matchStateBackend', 'submissionNeedsRetry', 'retrySameAnswer', 'checkServerStatus', 'syncPaused', 'retrySynchronization', 'nextTurn', 'passDevice', 'ready', 'roundResults', 'onlineRoundSettled', 'scriptedOpponentNoAI', 'you', 'opponent', 'activeTurn', 'typeAnswer', 'submitAnswer', 'backendAiJudge', 'localPreviewNotAI', 'serverResult', 'localResult', 'youWin', 'opponentWins', 'playerTwoWins', 'nexiraAiWins', 'scriptedOpponentWins', 'draw', 'authoritativeResult', 'localResultNotSaved', 'matchmakingEnded'];
  for (const locale of ['en', 'fa']) {
    for (const key of keys) assert.ok(COPY[locale].match[key]?.trim(), `Missing ${locale} match gameplay copy: ${key}`);
  }
  const appSource = await readFile(new URL('./App.jsx', import.meta.url), 'utf8');
  const matchStart = appSource.indexOf("{screen === 'match-game'");
  const matchEnd = appSource.indexOf("{screen === 'results'");
  const matchUi = appSource.slice(matchStart, matchEnd);
  assert.equal(matchUi.includes("language === 'fa'"), false, 'Match gameplay UI must use the centralized locale dictionary.');
  const matchResultsStart = appSource.indexOf("{screen === 'match-results'");
  const profileStart = appSource.indexOf("{screen === 'profile'");
  const matchResultsUi = appSource.slice(matchResultsStart, profileStart);
  assert.equal(matchResultsUi.includes("language === 'fa'"), false, 'Match results UI must use the centralized locale dictionary.');
});

test('competitive matchmaking copy is centralized and explicitly locale-independent', () => {
  const keys = ['competitiveOnline', 'competitiveTesting', 'competitivePreview', 'onlineOneVsOne', 'testingOneVsOne', 'localOneVsOne', 'onlineOpponent', 'acceptanceGate', 'passAndPlay', 'online', 'testing', 'local', 'onlineOneVsAi', 'previewOneVsAi', 'serverAi', 'scriptedAi', 'offline', 'findingOpponent', 'matchmakingDescription', 'searchActive', 'selectedCategory', 'language', 'queueRecovery', 'cancelSearch'];
  for (const locale of ['en', 'fa']) {
    for (const key of keys) assert.ok(COPY[locale].match[key]?.trim(), `Missing ${locale} match copy: ${key}`);
  }
  assert.match(COPY.en.match.onlineOpponent, /language does not limit matchmaking/i);
  assert.match(COPY.fa.match.onlineOpponent, /زبان مانع/);
  assert.match(COPY.en.match.matchmakingDescription, /language does not restrict matchmaking/i);
  assert.match(COPY.fa.match.matchmakingDescription, /زبان انتخابی محدودیتی/);
});

test('all game categories have localized display names in English and Persian', () => {
  for (const category of CATEGORIES) {
    assert.ok(COPY.en.categoryNames[category.id], `Missing English category name: ${category.id}`);
    assert.ok(COPY.fa.categoryNames[category.id], `Missing Persian category name: ${category.id}`);
    assert.equal(getCategoryTitle('fa', category.id), COPY.fa.categoryNames[category.id]);
    assert.equal(getCategoryTitle('en', category.id), COPY.en.categoryNames[category.id]);
  }
  assert.equal(getCategoryTitle('unknown', 'memory'), 'Memory');
  assert.equal(getCategoryTitle('fa', 'unknown', 'Fallback'), 'Fallback');
});

test('unknown languages fall back to English and interpolation avoids undefined text', () => {
  assert.equal(getCopy('unknown'), COPY.en);
  assert.equal(formatCopy(COPY.fa.answeredProgress, { answered: 2, total: 3 }), '2 از 3 پاسخ داده شد');
  assert.equal(formatCopy('Value: {missing}', {}), 'Value: ');
});

test('every question and answer option has Persian display text without changing answer order', () => {
  for (const category of CATEGORIES) {
    const translations = PERSIAN_QUESTIONS[category.id];
    assert.equal(translations?.length, category.questions.length, `Missing ${category.id} questions`);

    for (const [index, original] of category.questions.entries()) {
      const translation = translations[index];
      assert.ok(translation.prompt.trim(), `Missing ${category.id} question ${index + 1}`);
      assert.equal(translation.options.length, original.options.length, `Option count changed for ${category.id} question ${index + 1}`);
      assert.ok(translation.options.every((option) => option.trim()), `Missing option for ${category.id} question ${index + 1}`);
      const localized = getQuestionCopy('fa', category.id, index, original);
      assert.equal(localized.prompt, translation.prompt);
      assert.deepEqual(localized.options, translation.options);
      assert.equal(localized.answer, original.answer, `Correct answer index changed for ${category.id} question ${index + 1}`);
      assert.equal(getQuestionCopy('en', category.id, index, original), original);
    }
  }

  assert.deepEqual(PERSIAN_QUESTIONS.language[1].options, CATEGORIES.find(({ id }) => id === 'language').questions[1].options);
  assert.deepEqual(PERSIAN_QUESTIONS.science[1].options, CATEGORIES.find(({ id }) => id === 'science').questions[1].options);
});

test('locale registry contains the complete 20-locale target set without enabling incomplete packs', async () => {
  const expectedTargets = ['en', 'fa', 'ar', 'es', 'fr', 'de', 'pt', 'ru', 'tr', 'hi', 'id', 'ja', 'ko', 'zh-CN', 'bn', 'ur', 'it', 'nl', 'th', 'vi'];
  assert.deepEqual(getTargetLocales().map(({ code }) => code), expectedTargets);
  assert.deepEqual(getSupportedLocales().map(({ code }) => code), ['en', 'fa']);
  assert.equal(DEFAULT_LOCALE, 'en');

  for (const locale of expectedTargets) assert.equal(isTargetLocale(locale), true);
  for (const locale of ['en', 'fa']) assert.equal(isSupportedLocale(locale), true);
  for (const locale of expectedTargets.filter((locale) => !['en', 'fa'].includes(locale))) {
    assert.equal(isSupportedLocale(locale), false, `Incomplete locale must remain disabled: ${locale}`);
    assert.equal(resolveLocale(locale), DEFAULT_LOCALE);
  }

  assert.equal(isTargetLocale('unknown'), false);
  assert.equal(isSupportedLocale('ar'), false);
  assert.equal(resolveLocale('fa'), 'fa');
  assert.equal(resolveLocale(null), DEFAULT_LOCALE);
  assert.equal(getLocaleConfig('fa').direction, 'rtl');
  assert.equal(getLocaleConfig('ar').direction, 'rtl');
  assert.equal(getLocaleConfig('ur').direction, 'rtl');
  assert.equal(getLocaleConfig('en').direction, 'ltr');
  assert.equal(getLocaleConfig('zh-CN').intlLocale, 'zh-CN');
  assert.equal(formatLocaleNumber(1234.5, 'fa'), new Intl.NumberFormat('fa-IR').format(1234.5));

  const backendRegistry = await readFile(new URL('../../backend/src/common/localization/locale-registry.ts', import.meta.url), 'utf8');
  assert.ok(backendRegistry.includes("export const ENABLED_LOCALES = Object.freeze(['en', 'fa'] as const);"));
  for (const locale of expectedTargets) {
    assert.match(backendRegistry, new RegExp(`(^|\\n)\\s*${locale === 'zh-CN' ? `['"]zh-CN['"]` : locale}:`, 'm'), `Backend target registry is missing ${locale}`);
  }
});

test('profile locale migration preserves supported locales and safely resets unknown locales', () => {
  assert.equal(normalizeProfile({ settings: { language: 'fa' } }).settings.language, 'fa');
  assert.equal(normalizeProfile({ settings: { language: 'en' } }).settings.language, 'en');
  assert.equal(normalizeProfile({ settings: { language: 'ar' } }).settings.language, DEFAULT_LOCALE);
  assert.equal(normalizeProfile({ settings: { language: '__proto__' } }).settings.language, DEFAULT_LOCALE);
});
