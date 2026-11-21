import { resolveLocale } from '../locales.js';

export const STORAGE_KEY = 'nexira.profile.v1';

export const DEFAULT_PROFILE = {
  playerName: 'OPERATOR',
  level: 1,
  xp: 0,
  totalXp: 0,
  latestScore: 0,
  bestScore: 0,
  battles: 0,
  correctAnswers: 0,
  totalAnswers: 0,
  categoryStats: {},
  recentRuns: [],
  claimedRunIds: [],
  settings: { language: 'en', reducedMotion: false, sound: false },
};

export const MODE_TIMES = [7, 9, 10];

export function normalizeProfile(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...DEFAULT_PROFILE, settings: { ...DEFAULT_PROFILE.settings } };
  const safeInt = (input, fallback = 0) => Number.isSafeInteger(input) && input >= 0 ? input : fallback;
  const settings = value.settings && typeof value.settings === 'object' ? value.settings : {};
  return {
    ...DEFAULT_PROFILE,
    ...value,
    playerName: typeof value.playerName === 'string' ? value.playerName.slice(0, 20) : DEFAULT_PROFILE.playerName,
    level: Math.max(1, safeInt(value.level, 1)),
    xp: safeInt(value.xp),
    totalXp: safeInt(value.totalXp),
    latestScore: safeInt(value.latestScore),
    bestScore: safeInt(value.bestScore),
    battles: safeInt(value.battles),
    correctAnswers: safeInt(value.correctAnswers),
    totalAnswers: safeInt(value.totalAnswers),
    categoryStats: value.categoryStats && typeof value.categoryStats === 'object' && !Array.isArray(value.categoryStats) ? value.categoryStats : {},
    recentRuns: Array.isArray(value.recentRuns) ? value.recentRuns.filter((run) => run && typeof run === 'object').slice(0, 20) : [],
    claimedRunIds: Array.isArray(value.claimedRunIds) ? [...new Set(value.claimedRunIds.filter((runId) => typeof runId === 'string'))] : [],
    settings: {
      ...DEFAULT_PROFILE.settings,
      ...settings,
      language: resolveLocale(settings.language),
      reducedMotion: Boolean(settings.reducedMotion),
      sound: Boolean(settings.sound),
    },
  };
}

export function loadProfile(storage = globalThis.localStorage) {
  try {
    const saved = storage?.getItem(STORAGE_KEY);
    return saved ? normalizeProfile(JSON.parse(saved)) : normalizeProfile(DEFAULT_PROFILE);
  } catch {
    return normalizeProfile(DEFAULT_PROFILE);
  }
}

export function saveProfile(profile, storage = globalThis.localStorage) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(normalizeProfile(profile)));
    return Boolean(storage);
  } catch {
    return false;
  }
}

export const LANGUAGE_SELECTION_KEY = 'nexira.language-selection.v1';

export function hasCompletedLanguageSelection(storage = globalThis.localStorage) {
  try {
    return storage?.getItem(LANGUAGE_SELECTION_KEY) === 'completed';
  } catch {
    return false;
  }
}

export function completeLanguageSelection(storage = globalThis.localStorage) {
  try {
    storage?.setItem(LANGUAGE_SELECTION_KEY, 'completed');
    return Boolean(storage);
  } catch {
    return false;
  }
}
