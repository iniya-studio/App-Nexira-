import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {normalizeProfile} from './game/data.js';
import {QUESTION_FIXTURES} from './game/questionFixtures.js';
import { QUESTION_TRANSLATIONS } from './game/questionTranslations.js';
import { CATEGORY_TRANSLATIONS } from './game/categoryTranslations.js';
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

test('every available translated category pack covers all 23 categories, subtitles and 115 subcategories', () => {
  const categoryLocales = Object.keys(CATEGORY_TRANSLATIONS).sort();
  assert.deepEqual(categoryLocales, ['ar', 'bn', 'de', 'es', 'fr', 'hi', 'id', 'it', 'ja', 'ko', 'nl', 'pt', 'ru', 'th', 'tr', 'ur', 'vi', 'zh-CN']);
  for (const locale of categoryLocales) {
    const pack = CATEGORY_TRANSLATIONS[locale];
    assert.ok(pack, `Missing category pack: ${locale}`);
    for (const category of CATEGORY_CATALOG) {
      assert.ok(pack.categoryNames[category.id]?.trim(), `Missing ${locale} category name: ${category.id}`);
      assert.ok(pack.categorySubtitles[category.id]?.trim(), `Missing ${locale} category subtitle: ${category.id}`);
      for (const subcategoryId of category.subcategories) {
        assert.ok(pack.categorySubcategories[category.id]?.[subcategoryId]?.trim(), `Missing ${locale} subcategory: ${category.id}/${subcategoryId}`);
      }
      assert.deepEqual(Object.keys(pack.categorySubcategories[category.id]).sort(), [...category.subcategories].sort(), `Unexpected subcategory key in ${locale}/${category.id}`);
    }
    assert.deepEqual(Object.keys(pack.categoryNames).sort(), Object.keys(COPY.en.categoryNames).sort());
    assert.deepEqual(Object.keys(pack.categorySubtitles).sort(), Object.keys(COPY.en.categorySubtitles).sort());
  }
});

test('every disabled target locale stays fail-closed even when a partial category pack exists', () => {
  const enabled = new Set(getSupportedLocales().map(({ code }) => code));
  const disabledTargets = getTargetLocales().filter(({ code }) => !enabled.has(code));
  assert.equal(disabledTargets.length, 18);
  for (const { code } of disabledTargets) {
    assert.equal(isSupportedLocale(code), false, `Disabled locale became supported: ${code}`);
    assert.equal(getCopy(code).categoryNames.gaming, getCopy('en').categoryNames.gaming,
      `Partial category copy leaked through the UI resolver for ${code}`);
    assert.equal(getCopy(code).store.title, getCopy('en').store.title,
      `Partial UI copy leaked through the UI resolver for ${code}`);
  }
});

test('legacy categories are absent while 24 fixtures are preserved',async()=>{const d=await readFile(new URL('./game/data.js',import.meta.url),'utf8');const a=await readFile(new URL('./App.jsx',import.meta.url),'utf8');assert.equal(QUESTION_FIXTURES.length,24);assert.equal(new Set(QUESTION_FIXTURES.map(q=>q.id)).size,24);assert.equal(d.includes('export const CATEGORIES'),false);assert.equal(a.includes('CATEGORIES'),false);assert.equal(a.includes("screen === 'modes'"),false);assert.equal(a.includes("setScreen('modes')"),false);});

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

test('English and Persian translation trees have recursive key and placeholder parity', () => {
  const inspect = (source, translated, path = 'root') => {
    assert.equal(typeof translated, typeof source, `Type mismatch at ${path}`);
    if (typeof source === 'string') {
      assert.ok(source.trim(), `Empty source string at ${path}`);
      assert.ok(translated.trim(), `Empty translated string at ${path}`);
      const placeholders = value => [...value.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map(match => match[1]).sort();
      assert.deepEqual(placeholders(translated), placeholders(source), `Interpolation placeholders differ at ${path}`);
      return;
    }
    if (Array.isArray(source)) {
      assert.ok(Array.isArray(translated), `Expected array at ${path}`);
      assert.equal(translated.length, source.length, `Array length differs at ${path}`);
      source.forEach((value, index) => inspect(value, translated[index], `${path}[${index}]`));
      return;
    }
    if (source && typeof source === 'object') {
      assert.deepEqual(Object.keys(translated).sort(), Object.keys(source).sort(), `Nested keys differ at ${path}`);
      for (const key of Object.keys(source)) inspect(source[key], translated[key], `${path}.${key}`);
    }
  };
  inspect(COPY.en, COPY.fa);
});

test('all UI translation references are present',async()=>{const a=await readFile(new URL('./App.jsx',import.meta.url),'utf8');const refs=[...a.matchAll(/\btext\.([A-Za-z]\w*)/g)].map(m=>m[1]);for(const k of refs)assert.ok(k in COPY.en&&k in COPY.fa);});



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

test('quick battle preview metadata is localized and has no component-owned English fallback', async () => {
  assert.equal(COPY.en.home.quickBattle, 'Quick Battle');
  assert.equal(COPY.en.home.quickBattleMode, 'Speed Sprint');
  assert.equal(COPY.fa.home.quickBattle, 'نبرد سریع');
  assert.equal(COPY.fa.home.quickBattleMode, 'رقابت سرعتی');
  const appSource = await readFile(new URL('./App.jsx', import.meta.url), 'utf8');
  assert.match(appSource, /title: text\.home\.quickBattle/);
  assert.match(appSource, /modes: \[text\.home\.quickBattleMode\]/);
  assert.equal(appSource.includes("title:'Quick Battle'"), false);
  assert.equal(appSource.includes("modes:['Speed Sprint']"), false);
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

test('current product categories have localized names',()=>{for(const c of CATEGORY_CATALOG){assert.ok(COPY.en.categoryNames[c.id]);assert.ok(COPY.fa.categoryNames[c.id]);}});

test('unknown languages fall back to English and interpolation avoids undefined text', () => {
  assert.equal(getCopy('unknown'), COPY.en);
  assert.equal(formatCopy(COPY.fa.answeredProgress, { answered: 2, total: 3 }, 'fa'), '\u20682\u2069 از \u20683\u2069 پاسخ داده شد');
  assert.equal(formatCopy('Value: {missing}', {}), 'Value: ');
});

test('all 24 fixtures resolve Persian copy by stable question ID',()=>{assert.equal(Object.keys(PERSIAN_QUESTIONS).length,24);for(const q of QUESTION_FIXTURES){const t=PERSIAN_QUESTIONS[q.id];assert.ok(t);const l=getQuestionCopy('fa',q);assert.equal(l.prompt,t.prompt);assert.deepEqual(l.options,t.options);assert.equal(l.answer,q.answer);assert.strictEqual(getQuestionCopy('en',q),q);}});

test('question lookup fails closed for disabled locales and missing translations', () => {
  assert.throws(() => getQuestionCopy('de', QUESTION_FIXTURES[0]), {
    name: 'RangeError',
    message: /not enabled for locale "de"/,
  });
  assert.throws(() => getQuestionCopy('fa', { ...QUESTION_FIXTURES[0], id: 'missing.question' }), {
    name: 'RangeError',
    message: /translation is missing for locale "fa"/,
  });
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

test('runtime locale infrastructure applies document language, direction, font, and RTL navigation consistently', async () => {
  const appSource = await readFile(new URL('./App.jsx', import.meta.url), 'utf8');
  const directionSource = await readFile(new URL('./app.css', import.meta.url), 'utf8');
  const layoutSource = await readFile(new URL('./styles.css', import.meta.url), 'utf8');

  assert.match(appSource, /document\.documentElement\.lang\s*=\s*language/);
  assert.match(appSource, /document\.documentElement\.dir\s*=\s*localeConfig\.direction/);
  assert.match(appSource, /dir=\{localeConfig\.direction\}/);
  assert.match(appSource, /loadLocaleFont\(language\)/);
  assert.match(appSource, /const handleLanguageChange = useCallback\(async \(value\) => \{/);
  assert.match(appSource, /if \(!getSupportedLocales\(\)\.some\(\(locale\) => locale\.code === value\)\) return/);
  assert.match(appSource, /const result = await loadLocaleFont\(value\)/);
  assert.match(appSource, /if \(!result\.applied \|\| requestId !== languageChangeRequestRef\.current\) return/);
  assert.match(appSource, /document\.documentElement\.dir = localeConfig\.direction;[\s\S]*?\}, \[language\]\)/);

  for (const selector of ['.back-link svg', '.tile-arrow svg', '.mode-arrow svg', '.setting-action svg', '.primary-arrow']) {
    assert.ok(directionSource.includes(`[dir="rtl"] ${selector}`), `Missing RTL mirroring for ${selector}`);
  }
  assert.match(layoutSource, /text-align:\s*start/);
  assert.match(layoutSource, /(?:margin|padding|inset)-(?:inline|block)/);
  assert.doesNotMatch(layoutSource, /text-align:\s*left\b/);
});


test('a locale cannot be enabled until its full UI, category and question content exists', () => {
  for (const locale of getSupportedLocales()) {
    const copy = COPY[locale.code];
    assert.ok(copy, `Enabled locale has no UI dictionary: ${locale.code}`);
    for (const category of CATEGORY_CATALOG) {
      assert.ok(copy.categoryNames?.[category.id], `Enabled locale missing category name: ${locale.code}/${category.id}`);
      assert.ok(copy.categorySubtitles?.[category.id], `Enabled locale missing category subtitle: ${locale.code}/${category.id}`);
      for (const subcategory of category.subcategories) {
        assert.ok(copy.categorySubcategories?.[category.id]?.[subcategory], `Enabled locale missing subcategory: ${locale.code}/${category.id}/${subcategory}`);
      }
    }
    for (const question of QUESTION_FIXTURES) {
      assert.doesNotThrow(() => getQuestionCopy(locale.code, question), `Enabled locale missing question: ${locale.code}/${question.id}`);
    }
  }
  assert.deepEqual(getSupportedLocales().map(({ code }) => code).sort(), ['en', 'fa']);
});

test('All 18 translated offline question packs cover all 24 fixtures without English prompt fallback or answer drift', () => {
  const fixtureIds = QUESTION_FIXTURES.map(({ id }) => id).sort();
  const translatedLocales = getTargetLocales().filter(({ code }) => !['en', 'fa'].includes(code)).map(({ code }) => code);
  assert.equal(translatedLocales.length, 18);
  assert.deepEqual(Object.keys(QUESTION_TRANSLATIONS).sort(), [...translatedLocales].sort(),
    'Question translation packs must match the 18 non-English/non-Persian target locales exactly');
  for (const locale of translatedLocales) {
    const pack = QUESTION_TRANSLATIONS[locale];
    assert.ok(pack, `Missing question pack: ${locale}`);
    assert.deepEqual(Object.keys(pack).sort(), fixtureIds, `Question ID coverage mismatch for ${locale}`);
    for (const question of QUESTION_FIXTURES) {
      const translated = pack[question.id];
      assert.equal(typeof translated.prompt, 'string');
      assert.ok(translated.prompt.trim(), `Empty prompt: ${locale}/${question.id}`);
      assert.notEqual(translated.prompt.trim(), question.prompt.trim(),
        `English prompt fallback leaked into ${locale}/${question.id}`);
      assert.equal(translated.options.length, question.options.length, `Option count changed: ${locale}/${question.id}`);
      if (question.id === 'language.q02') {
        assert.deepEqual(translated.options, question.options,
          `English spelling choices must remain exact in ${locale}/${question.id}`);
      }
      if (question.id.startsWith('focus.')) {
        assert.deepEqual(translated.options, question.options,
          `Latin visual/counting tokens must remain exact in ${locale}/${question.id}`);
      }
      for (const option of translated.options) {
        assert.equal(typeof option, 'string');
        assert.ok(option.trim(), `Empty option: ${locale}/${question.id}`);
      }
      assert.ok(Number.isInteger(question.answer));
      assert.ok(question.answer >= 0 && question.answer < translated.options.length);
      assert.equal(Object.hasOwn(translated, 'answer'), false,
        `A translated pack must not override the canonical answer index for ${locale}/${question.id}`);
      assert.ok(question.answer >= 0 && question.answer < translated.options.length,
        `Canonical answer index is outside the translated options for ${locale}/${question.id}`);
    }
  }
});

test('Spanish UI dictionary has complete recursive key, type, array and placeholder parity', () => {
  const inspect = (source, translated, path = 'root') => {
    assert.equal(typeof translated, typeof source, `Type mismatch at ${path}`);
    if (typeof source === 'string') {
      assert.ok(source.trim(), `Empty English source at ${path}`);
      assert.ok(translated.trim(), `Empty Spanish translation at ${path}`);
      const placeholders = value => [...value.matchAll(/\\{([A-Za-z0-9_]+)\\}/g)].map(match => match[1]).sort();
      assert.deepEqual(placeholders(translated), placeholders(source), `Interpolation placeholders differ at ${path}`);
      return;
    }
    if (Array.isArray(source)) {
      assert.ok(Array.isArray(translated), `Expected array at ${path}`);
      assert.equal(translated.length, source.length, `Array length differs at ${path}`);
      source.forEach((value, index) => inspect(value, translated[index], `${path}[${index}]`));
      return;
    }
    if (source && typeof source === 'object') {
      assert.deepEqual(Object.keys(translated).sort(), Object.keys(source).sort(), `Nested keys differ at ${path}`);
      for (const key of Object.keys(source)) inspect(source[key], translated[key], `${path}.${key}`);
    }
  };
  assert.ok(COPY.es, 'Spanish UI dictionary is not registered');
  inspect(COPY.en, COPY.es);
});

