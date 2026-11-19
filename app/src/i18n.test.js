import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { CATEGORIES, normalizeProfile } from './game/data.js';
import { DEFAULT_LOCALE, formatLocaleNumber, getLocaleConfig, getSupportedLocales, getTargetLocales, isSupportedLocale, isTargetLocale, resolveLocale } from './locales.js';
import { COPY, formatCopy, getCategoryTitle, getCopy, getLocalizedApiError, getQuestionCopy, PERSIAN_QUESTIONS } from './i18n.js';

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
    formatCopy(persian.password_changed_result_sessionsrevoked_other_se, { sessionsRevoked: localizedCount }),
    `رمز عبور تغییر کرد و ${localizedCount} نشست دیگر بسته شد.`,
  );
  assert.equal(
    formatCopy(persian.all_sessions_were_revoked_result_revokedsessions, { revokedSessions: localizedCount }),
    `همه نشست‌ها باطل شدند (${localizedCount}).`,
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

test('server-originated API errors always resolve to safe localized copy', () => {
  for (const locale of ['en', 'fa']) {
    const copy = COPY[locale].account;
    assert.equal(getLocalizedApiError({ code: 'NETWORK_ERROR', message: 'raw server secret' }, copy), copy.network_error);
    assert.equal(getLocalizedApiError({ code: 'REQUEST_ABORTED' }, copy), copy.request_aborted);
    assert.equal(getLocalizedApiError({ code: 'SESSION_SUPERSEDED' }, copy), copy.session_changed);
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
});

