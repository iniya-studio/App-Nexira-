import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { CATEGORIES, normalizeProfile } from './game/data.js';
import { CATEGORY_CATALOG, CATEGORY_IDS, getCategoryById } from './game/categoryCatalog.js';
import { DEFAULT_LOCALE, formatLocaleDate, formatLocaleNumber, getLocaleConfig, getLocalePluralCategory, getSupportedLocales, getTargetLocales, isSupportedLocale, isTargetLocale, normalizeLocaleCode, resolveLocale } from './locales.js';
import { COPY, formatCopy, getCategoryTitle, getCopy, getLocalizedApiError, getQuestionCopy, PERSIAN_QUESTIONS } from './i18n.js';

test('the canonical category catalog contains exactly 23 categories and 115 unique subcategories with English and Persian copy', () => {
  const expectedIds = [
    'gaming', 'movies-tv', 'music', 'sports', 'technology', 'internet-social-media',
    'anime-manga', 'superheroes-comics', 'geography', 'history', 'space', 'science',
    'cars-motorsports', 'animals-nature', 'food-drinks', 'art-design', 'books-stories',
    'culture-lifestyle', 'brands-business', 'mythology-legends', 'travel-tourism',
    'education-mathematics', 'fashion-beauty',
  ];
  assert.deepEqual(CATEGORY_IDS, expectedIds);
  assert.equal(CATEGORY_CATALOG.length, 23);
  const allSubcategoryIds = [];
  for (const category of CATEGORY_CATALOG) {
    assert.equal(category.subcategories.length, 5, `Expected five subcategories for ${category.id}`);
    assert.ok(COPY.en.categoryNames[category.id], `Missing English category name: ${category.id}`);
    assert.ok(COPY.fa.categoryNames[category.id], `Missing Persian category name: ${category.id}`);
    assert.ok(COPY.en.categorySubtitles[category.id], `Missing English category subtitle: ${category.id}`);
    assert.ok(COPY.fa.categorySubtitles[category.id], `Missing Persian category subtitle: ${category.id}`);
    for (const subcategoryId of category.subcategories) {
      allSubcategoryIds.push(`${category.id}:${subcategoryId}`);
      assert.ok(COPY.en.categorySubcategories[category.id]?.[subcategoryId], `Missing English subcategory: ${category.id}/${subcategoryId}`);
      assert.ok(COPY.fa.categorySubcategories[category.id]?.[subcategoryId], `Missing Persian subcategory: ${category.id}/${subcategoryId}`);
    }
  }
  assert.equal(allSubcategoryIds.length, 115);
  assert.equal(new Set(allSubcategoryIds).size, 115);
  assert.equal(getCategoryById('gaming').id, 'gaming');
  assert.equal(getCategoryById('unknown'), null);
});

test('category selection renders the canonical catalog and retains server-AI match context', async () => {
  const appSource = await readFile(new URL('./App.jsx', import.meta.url), 'utf8');
  assert.ok(appSource.includes("import { CATEGORY_CATALOG } from './game/categoryCatalog.js'"));
  assert.ok(appSource.includes('{CATEGORY_CATALOG.map((item, index) => {'));
  assert.ok(appSource.includes('setRun({ categoryId: item.id, category: item })'));
  assert.ok(appSource.includes("{screen === 'subcategories'"));
  assert.ok(appSource.includes('selectedCategory.subcategories.map((subcategoryId, index)'));
  assert.ok(appSource.includes('subcategoryId: category?.subcategoryId'));
  assert.ok(appSource.includes('text.categorySubcategories[selectedCategory.id]?.[subcategoryId]'));
  assert.ok(appSource.includes('Array.isArray(category?.subcategories)'));
  assert.ok(appSource.includes('const selectedCategory = categoryById(run?.categoryId) ?? run?.category ?? null'));
  assert.ok(appSource.includes('run?.category ?? null'));
});

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



test('home brand tagline and navigation accessibility label are localized', async () => {
  assert.equal(COPY.en.brandTagline, 'PLAY · COMPETE · WIN');
  assert.equal(COPY.fa.brandTagline, 'بازی کن · رقابت کن · پیروز شو');
  const appSource = await readFile(new URL('./App.jsx', import.meta.url), 'utf8');
  assert.ok(appSource.includes('{text.brandTagline}'));
  assert.ok(appSource.includes('aria-label={`${text.navHome} · NEXIRA`}'));
  assert.equal(appSource.includes('PLAY · COMPETE · WIN'), false);
  assert.equal(appSource.includes('NEXIRA Home'), false);
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
  assert.equal(formatCopy(COPY.fa.answeredProgress, { answered: 2, total: 3 }, 'fa'), '\u20682\u2069 از \u20683\u2069 پاسخ داده شد');
  assert.equal(formatCopy('Value: {missing}', {}), 'Value: ');
});

test('every question and answer option has Persian display text without changing answer order', () => {
  for (const category of CATEGORIES) {
    const translations = PERSIAN_QUESTIONS[category.id];
    assert.equal(translations?.length, category.questions.length, `Missing ${category.id} questions`);

    for (const [index, original] of category.questions.entries()) {
      const translation = translations[index];
      assert.equal(original.id, `${category.id}.q${String(index + 1).padStart(2, '0')}`);
      assert.equal(translation.id, original.id, `Question ID mismatch for ${category.id} question ${index + 1}`);
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


test('question translations are resolved by stable IDs, not array positions', () => {
  for (const category of CATEGORIES) {
    const ids = category.questions.map(({ id }) => id);
    assert.equal(new Set(ids).size, ids.length, 'Duplicate question IDs in ' + category.id);
    for (const question of category.questions) {
      const localized = getQuestionCopy('fa', category.id, 999, question);
      const translation = PERSIAN_QUESTIONS[category.id].find(({ id }) => id === question.id);
      assert.ok(translation, 'Missing Persian translation for ' + question.id);
      assert.equal(localized.prompt, translation.prompt);
      assert.deepEqual(localized.options, translation.options);
      assert.equal(localized.answer, question.answer);
    }
  }
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

test('matchmaking language labels use native locale metadata for every target locale', async () => {
  const appSource = await readFile(new URL('./App.jsx', import.meta.url), 'utf8');
  assert.ok(appSource.includes('{getLocaleConfig(matchmakingView?.language ?? language).nativeName}'));
  assert.equal(appSource.includes("matchmakingView?.language ?? language) === 'fa' ? 'فارسی' : 'English'"), false);

  for (const locale of getTargetLocales()) {
    assert.ok(locale.nativeName.trim(), `Missing native language label: ${locale.code}`);
  }
});

test('number, date, and plural formatters support every target Intl locale', () => {
  const sampleDate = new Date('2026-11-20T12:00:00.000Z');
  const allowedPluralCategories = new Set(['zero', 'one', 'two', 'few', 'many', 'other']);

  for (const locale of getTargetLocales()) {
    assert.ok(formatLocaleNumber(12345.67, locale.code), `Number formatting failed for ${locale.code}`);
    assert.ok(formatLocaleDate(sampleDate, locale.code, { dateStyle: 'medium' }), `Date formatting failed for ${locale.code}`);
    for (const value of [0, 1, 2, 5, 11, 21, 1.5]) {
      assert.ok(allowedPluralCategories.has(getLocalePluralCategory(value, locale.code)), `Invalid plural category for ${locale.code}`);
    }
  }
});

test('frontend locale canonicalization matches the backend BCP-47 policy', () => {
  assert.equal(normalizeLocaleCode(' FA '), 'fa');
  assert.equal(normalizeLocaleCode('zh-cn'), 'zh-CN');
  assert.equal(normalizeLocaleCode('ZH-CN'), 'zh-CN');
  assert.equal(normalizeLocaleCode('en'), 'en');
  assert.equal(normalizeLocaleCode(null), '');

  assert.equal(resolveLocale('FA'), 'fa');
  assert.equal(resolveLocale(' fa '), 'fa');
  assert.equal(resolveLocale('zh-cn'), DEFAULT_LOCALE, 'Canonical but disabled locales must remain disabled');
  assert.equal(getLocaleConfig('ZH-CN').code, 'zh-CN');
  assert.equal(resolveLocale('unknown'), DEFAULT_LOCALE);
});

test('profile locale migration preserves supported locales and safely resets unknown locales', () => {
  assert.equal(normalizeProfile({ settings: { language: 'fa' } }).settings.language, 'fa');
  assert.equal(normalizeProfile({ settings: { language: 'en' } }).settings.language, 'en');
  assert.equal(normalizeProfile({ settings: { language: 'ar' } }).settings.language, DEFAULT_LOCALE);
  assert.equal(normalizeProfile({ settings: { language: '__proto__' } }).settings.language, DEFAULT_LOCALE);
});

test('ranking screen copy is centralized and complete for every active locale', async () => {
  const keys = [
    'description', 'scopeLabel', 'global', 'seasonal', 'globalLeaderboard',
    'seasonLeaderboard', 'top50', 'loading', 'loadError', 'retry',
    'connectAccount', 'guestEligibility', 'noActiveSeason', 'yourPosition',
    'rankingPoints', 'wins', 'pointsAbbr', 'losses', 'noResults', 'pointsPolicy',
  ];
  for (const locale of ['en', 'fa']) {
    for (const key of keys) {
      assert.ok(COPY[locale].ranking[key]?.trim(), `Missing ${locale} ranking copy: ${key}`);
    }
  }

  const appSource = await readFile(new URL('./App.jsx', import.meta.url), 'utf8');
  const rankingsStart = appSource.indexOf("{screen === 'rankings'");
  const storeStart = appSource.indexOf("{screen === 'store'");
  const rankingsUi = appSource.slice(rankingsStart, storeStart);
  assert.ok(rankingsStart >= 0 && storeStart > rankingsStart, 'Ranking screen boundaries must exist');
  assert.equal(rankingsUi.includes("language === 'fa'"), false, 'Ranking UI must use the centralized locale dictionary.');
});




test('profile and account status UI copy has complete English/Persian parity', async () => {
  assert.deepEqual(Object.keys(COPY.fa.profile).sort(), Object.keys(COPY.en.profile).sort());
  assert.deepEqual(Object.keys(COPY.fa.profile.sessionStatus).sort(), Object.keys(COPY.en.profile.sessionStatus).sort());
  for (const key of Object.keys(COPY.en.profile)) {
    if (key === 'sessionStatus') continue;
    assert.ok(COPY.en.profile[key]?.trim(), `Missing English profile copy: ${key}`);
    assert.ok(COPY.fa.profile[key]?.trim(), `Missing Persian profile copy: ${key}`);
  }
  const appSource = await readFile(new URL('./App.jsx', import.meta.url), 'utf8');
  const profileStart = appSource.indexOf("{screen === 'profile'");
  const storeStart = appSource.indexOf("{screen === 'store'");
  const profileUi = appSource.slice(profileStart, storeStart);
  assert.ok(profileStart >= 0 && storeStart > profileStart, 'Profile screen boundaries must exist');
  assert.equal(profileUi.includes("language === 'fa'"), false, 'Profile UI must use centralized locale dictionaries.');
});

test('session lifecycle state stores machine-readable errors instead of raw exception messages', async () => {
  const lifecycleSource = await readFile(new URL('./api/sessionLifecycle.js', import.meta.url), 'utf8');
  assert.match(lifecycleSource, /function toSessionErrorDescriptor/);
  assert.equal(/error:\s*error instanceof Error \? error\.message/.test(lifecycleSource), false);
  assert.equal(/accountDataError:\s*error instanceof Error \? error\.message/.test(lifecycleSource), false);
});

test('all lifecycle session states have localized labels and raw lifecycle errors are never rendered', async () => {
  const requiredStates = ['idle', 'initializing', 'guest', 'authenticated', 'offline', 'error', 'unsupported', 'signed-out', 'unknown'];
  for (const locale of ['en', 'fa']) {
    const labels = COPY[locale].profile.sessionStatus;
    for (const state of requiredStates) {
      assert.equal(typeof labels[state], 'string', `Missing ${locale} session state: ${state}`);
      assert.ok(labels[state].trim(), `Empty ${locale} session state: ${state}`);
    }
  }
  const appSource = await readFile(new URL('./App.jsx', import.meta.url), 'utf8');
  assert.match(appSource, /text\.profile\.sessionStatus\[sessionState\.status\]/);
  assert.equal(appSource.includes('{sessionState.error}'), false);
  assert.equal(appSource.includes('{sessionState.accountDataError}'), false);
});

test('account and session UI copy is centralized with complete English/Persian parity', async () => {
  const english = COPY.en.account;
  const persian = COPY.fa.account;
  assert.deepEqual(Object.keys(persian).sort(), Object.keys(english).sort());
  const requiredKeys = ['network_error', 'request_aborted', 'session_changed', 'recovery_window_expired', 'authorization_failed', 'conflict', 'invalid_input', 'rate_limited', 'server_error', 'generic_error', 'account_data_unavailable', 'session_active', 'session_revoked', 'session_expired', 'session_unknown'];

  const localizedCount = formatLocaleNumber(2, 'fa');
  assert.equal(
    formatCopy(persian.password_changed_result_sessionsrevoked_other_se, { sessionsRevoked: localizedCount, revokedSessions: localizedCount }, 'fa'),
    `رمز عبور تغییر کرد و \u2068${localizedCount}\u2069 نشست دیگر بسته شد.`,
  );
  assert.equal(
    formatCopy(persian.all_sessions_were_revoked_result_revokedsessions, { revokedSessions: localizedCount }, 'fa'),
    `همه نشست‌ها باطل شدند (\u2068${localizedCount}\u2069).`,
  );
  for (const key of requiredKeys) {
    assert.ok(english[key]?.trim(), `Missing English account state copy: ${key}`);
    assert.ok(persian[key]?.trim(), `Missing Persian account state copy: ${key}`);
  }


  for (const key of Object.keys(english)) {
    assert.equal(typeof english[key], 'string', `Invalid English account copy: ${key}`);
    assert.equal(typeof persian[key], 'string', `Invalid Persian account copy: ${key}`);
    assert.ok(english[key].trim(), `Empty English account copy: ${key}`);
    assert.ok(persian[key].trim(), `Empty Persian account copy: ${key}`);
    const placeholders = (value) => [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
    assert.deepEqual(placeholders(persian[key]), placeholders(english[key]), `Placeholder mismatch: ${key}`);
  }

  const component = await readFile(new URL('./components/AccountSessionPanel.jsx', import.meta.url), 'utf8');
  const references = [...component.matchAll(/copy\.account\.([A-Za-z]\w*)/g)].map((match) => match[1]);
  assert.ok(references.length >= 80, 'Account/session component must use the centralized account namespace.');
  for (const key of references) assert.ok(key in english && key in persian, `Missing account translation: ${key}`);
  assert.equal(/\bisFa\b|language\s*===\s*['"]fa['"]/.test(component), false, 'Account/session UI must not branch directly on locale.');
  assert.equal(component.includes("'fa-IR'") || component.includes("'en-US'"), false, 'Account/session date formatting must use locale metadata.');
});

test('shared API error copy is neutral across account and gameplay screens', () => {
  for (const locale of ['en', 'fa']) {
    const copy = COPY[locale].account;
    for (const key of ['authorization_failed', 'conflict', 'invalid_input', 'generic_error']) {
      assert.doesNotMatch(copy[key], /account|حساب/i, `${locale} ${key} must not assume an account-only context`);
    }
  }
});

test('server-originated API errors always resolve to safe localized copy', () => {
  for (const locale of ['en', 'fa']) {
    const copy = COPY[locale].account;
    assert.equal(getLocalizedApiError({ code: 'NETWORK_ERROR', message: 'raw server secret' }, copy), copy.network_error);
    assert.equal(getLocalizedApiError({ code: 'REQUEST_ABORTED' }, copy), copy.request_aborted);
    assert.equal(getLocalizedApiError({ code: 'SESSION_SUPERSEDED' }, copy), copy.session_changed);
    assert.equal(getLocalizedApiError({ code: 'SESSION_EXPIRED' }, copy), copy.session_expired);
    assert.equal(getLocalizedApiError({ code: 'SESSION_REVOKED' }, copy), copy.session_expired);
    assert.equal(getLocalizedApiError({ code: 'CONVERSION_RECOVERY_EXPIRED', status: 410 }, copy), copy.recovery_window_expired);
    assert.equal(getLocalizedApiError({ code: 'CONVERSION_NOT_COMMITTED', status: 409 }, copy), copy.conflict);
    assert.equal(getLocalizedApiError({ code: 'CONVERSION_RECOVERY_EXPIRED' }, copy), copy.recovery_window_expired);
    assert.equal(getLocalizedApiError({ code: 'QUESTION_GENERATION_FAILED' }, copy), copy.server_error);
    assert.equal(getLocalizedApiError({ code: 'MATCH_CANCELLED' }, copy), copy.server_error);
    assert.equal(getLocalizedApiError({ status: 401 }, copy), copy.authorization_failed);
    assert.equal(getLocalizedApiError({ status: 403 }, copy), copy.authorization_failed);
    assert.equal(getLocalizedApiError({ status: 409 }, copy), copy.conflict);
    assert.equal(getLocalizedApiError({ status: 400 }, copy), copy.invalid_input);
    assert.equal(getLocalizedApiError({ status: 422 }, copy), copy.invalid_input);
    assert.equal(getLocalizedApiError({ status: 429 }, copy), copy.rate_limited);
    assert.equal(getLocalizedApiError({ status: 503 }, copy), copy.server_error);
    assert.equal(getLocalizedApiError({ code: 'UNRECOGNIZED_BACKEND_CODE', message: 'raw payload' }, copy), copy.generic_error);
    assert.equal(getLocalizedApiError('UNRECOGNIZED_BACKEND_CODE', copy), copy.generic_error);
    assert.equal(getLocalizedApiError({ message: 'untrusted raw message' }, copy), copy.generic_error);
    assert.equal(getLocalizedApiError(null, copy), copy.generic_error);
  }
});

test('progression and online-match UI never render raw API error messages', async () => {
  const appSource = await readFile(new URL('./App.jsx', import.meta.url), 'utf8');
  assert.match(appSource, /\{text\.ranking\.loadError\}/);
  assert.match(appSource, /getLocalizedApiError\(matchError \|\| matchView\.error, text\.account\)/);
  assert.equal(appSource.includes('{progressionError}</div>'), false);
  assert.equal(appSource.includes('{matchError}</p>'), false);
  assert.equal(appSource.includes('{matchError || matchView.error}'), false);
  assert.equal(/setMatchError\(error\.message\)/.test(appSource), false);
  assert.match(appSource, /matchView\.error\?\.status === 409 \|\| matchError\?\.status === 409/);
  assert.match(appSource, /matchView\.error\?\.status !== 409 && matchError\?\.status !== 409/);
  assert.match(appSource, /text\.match\.submissionNeedsSync/);
  assert.match(appSource, /text\.match\.checkServerStatus/);
  for (const locale of ['en', 'fa']) {
    assert.ok(COPY[locale].match.submissionNeedsSync.trim(), `Missing ${locale} non-retryable submission copy`);
  }
});


function collectTranslationLeaves(value, prefix = '') {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectTranslationLeaves(item, prefix ? `${prefix}[${index}]` : `[${index}]`));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => collectTranslationLeaves(item, prefix ? `${prefix}.${key}` : key));
  }
  return [{ key: prefix, value }];
}

function readStaticPath(root, path) {
  return path.replace(/\[(\d+)\]/g, '.$1').replace(/^\./, '').split('.').reduce((value, key) => value?.[key], root);
}

test('English and Persian translation trees have recursive shape, non-empty leaves, and placeholder parity', () => {
  const englishLeaves = collectTranslationLeaves(COPY.en);
  const persianLeaves = collectTranslationLeaves(COPY.fa);
  assert.deepEqual(
    persianLeaves.map(({ key }) => key).sort(),
    englishLeaves.map(({ key }) => key).sort(),
    'Every nested translation key and array position must exist in both baseline locales',
  );

  const placeholders = (value) => [...value.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)].map((match) => match[1]).sort();
  for (const { key, value: englishValue } of englishLeaves) {
    const persianValue = readStaticPath(COPY.fa, key.replace(/\[(\d+)\]/g, '.$1'));
    assert.equal(typeof englishValue, 'string', `English translation leaf must be a string: ${key}`);
    assert.equal(typeof persianValue, 'string', `Persian translation leaf must be a string: ${key}`);
    assert.ok(englishValue.trim(), `Empty English translation: ${key}`);
    assert.ok(persianValue.trim(), `Empty Persian translation: ${key}`);
    assert.deepEqual(placeholders(persianValue), placeholders(englishValue), `Interpolation placeholder mismatch: ${key}`);
  }
});

test('all statically referenced nested UI translation paths exist in both baseline locales', async () => {
  const appSource = await readFile(new URL('./App.jsx', import.meta.url), 'utf8');
  const paths = [...appSource.matchAll(/\btext((?:\.[A-Za-z][A-Za-z0-9_]*){1,4})/g)]
    .map((match) => match[1].slice(1))
    .filter((path) => !path.includes('['));
  for (const path of new Set(paths)) {
    assert.ok(readStaticPath(COPY.en, path) !== undefined, `Missing English UI translation path: ${path}`);
    assert.ok(readStaticPath(COPY.fa, path) !== undefined, `Missing Persian UI translation path: ${path}`);
  }
});

test('Store catalog, navigation, and exit confirmation copy are fully dictionary-backed', async () => {
  const tabs = ['featured', 'frames', 'profile', 'effects', 'inventory'];
  const items = ['prism-frame', 'ion-frame', 'signal-plate', 'orbit-plate', 'pulse-entry', 'nova-response'];
  for (const locale of ['en', 'fa']) {
    for (const tab of tabs) assert.ok(COPY[locale].store.tabs[tab]?.trim(), `Missing ${locale} Store tab: ${tab}`);
    for (const item of items) {
      for (const key of ['title', 'description', 'type']) assert.ok(COPY[locale].store.items[item][key]?.trim(), `Missing ${locale} Store item copy: ${item}.${key}`);
    }
    assert.ok(COPY[locale].navStore?.trim());
    for (const key of ['matchTitle', 'challengeTitle', 'description', 'stay', 'leave']) assert.ok(COPY[locale].exitConfirmation[key]?.trim());
  }
  const appSource = await readFile(new URL('./App.jsx', import.meta.url), 'utf8');
  assert.equal(appSource.includes("language === 'fa'"), false, 'App UI must not contain Persian-only rendering branches.');
  for (const marker of ['tab.en', 'tab.fa', 'item.title.en', 'item.title.fa', 'storePreviewItem.title.en', 'storePreviewItem.title.fa']) {
    assert.equal(appSource.includes(marker), false, `Store display copy must not be hardcoded: ${marker}`);
  }
});

test('frontend and backend locale metadata stay in parity', async () => {
  const backendRegistry = await readFile(new URL('../../backend/src/common/localization/locale-registry.ts', import.meta.url), 'utf8');
  const frontendLocales = getTargetLocales();

  assert.equal(frontendLocales.length, 20, 'The frontend target registry must contain exactly 20 locales');
  assert.equal(new Set(frontendLocales.map(({ code }) => code)).size, 20, 'Locale codes must be unique');
  assert.deepEqual(frontendLocales.map(({ code }) => code), [
    'en', 'fa', 'ar', 'es', 'fr', 'de', 'pt', 'ru', 'tr', 'hi',
    'id', 'ja', 'ko', 'zh-CN', 'bn', 'ur', 'it', 'nl', 'th', 'vi',
  ]);

  for (const locale of frontendLocales) {
    assert.ok(locale.nativeName.trim(), `Missing native name for ${locale.code}`);
    assert.ok(locale.englishName.trim(), `Missing English name for ${locale.code}`);
    assert.ok(['ltr', 'rtl'].includes(locale.direction), `Invalid direction for ${locale.code}`);
    assert.equal(Intl.getCanonicalLocales(locale.intlLocale)[0], locale.intlLocale, `Invalid Intl locale for ${locale.code}`);

    const entryPrefix = locale.code === 'zh-CN' ? "'zh-CN':" : `${locale.code}:`;
    const backendEntry = backendRegistry.split('\n').find((line) => line.trim().startsWith(entryPrefix));
    assert.ok(backendEntry, `Backend registry is missing ${locale.code}`);
    const metadata = backendEntry.match(/nativeName: '([^']+)', englishName: '([^']+)', intlLocale: '([^']+)', direction: '(ltr|rtl)'/);
    assert.ok(metadata, `Backend metadata is malformed for ${locale.code}`);
    assert.deepEqual(
      { nativeName: metadata[1], englishName: metadata[2], intlLocale: metadata[3], direction: metadata[4] },
      { nativeName: locale.nativeName, englishName: locale.englishName, intlLocale: locale.intlLocale, direction: locale.direction },
      `Frontend/backend locale metadata mismatch for ${locale.code}`,
    );
  }

  assert.deepEqual(getSupportedLocales().map(({ code }) => code), ['en', 'fa']);
  assert.match(backendRegistry, /export const ENABLED_LOCALES = Object\.freeze\(\['en', 'fa'\] as const\);/);
  assert.equal(getLocaleConfig('ko').nativeName, '한국어');
});


test('primary UI copy alignment uses logical text direction in the base stylesheet', async () => {
  const styles = await readFile(new URL('./styles.css', import.meta.url), 'utf8');
  for (const selector of [
    '.top-profile-copy',
    '.primary-button',
    '.daily-button',
    '.home-quicklinks button',
    '.category-tile',
    '.mode-option',
    '.answer-button',
  ]) {
    const start = styles.indexOf(`${selector}{`);
    assert.notEqual(start, -1, `Missing base style rule: ${selector}`);
    const end = styles.indexOf('}', start);
    const rule = styles.slice(start, end);
    assert.ok(rule.includes('text-align:start'), `${selector} must align with the active writing direction`);
  }
  assert.equal(styles.includes('text-align:left'), false, 'Physical left alignment must not remain in the base UI stylesheet.');
  assert.ok(styles.includes('padding-inline:17px'), 'The mobile bottom sheet must use direction-aware horizontal padding.');
});
