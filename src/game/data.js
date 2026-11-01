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

export const CATEGORIES = [
  {
    id: 'memory', title: 'Memory', subtitle: 'Hold the signal.', icon: 'brain', tone: 'cyan',
    modes: ['Pattern Recall', 'Sequence', 'Rapid Recall'],
    questions: [
      { prompt: 'Signal: triangle · hexagon · circle · hexagon. Which shape repeated?', options: ['Triangle', 'Circle', 'Hexagon', 'Square'], answer: 2 },
      { prompt: 'Remember the pattern: cyan, gold, pink. What was second?', options: ['Cyan', 'Gold', 'Pink', 'Green'], answer: 1 },
      { prompt: 'Which number appeared first: 7 · 2 · 9 · 4?', options: ['2', '4', '7', '9'], answer: 2 },
    ],
  },
  {
    id: 'logic', title: 'Logic', subtitle: 'Find the weak link.', icon: 'scan', tone: 'purple',
    modes: ['Pattern Logic', 'Deduction', 'Sequence'],
    questions: [
      { prompt: 'Complete the sequence: 3, 6, 12, 24, ...', options: ['36', '42', '48', '54'], answer: 2 },
      { prompt: 'All VEX are NEX. All NEX are RAS. What must be true?', options: ['All RAS are VEX', 'All VEX are RAS', 'No VEX are RAS', 'Some NEX are not VEX'], answer: 1 },
      { prompt: 'Which number breaks the pattern: 4, 9, 16, 25, 36, 48?', options: ['9', '16', '36', '48'], answer: 3 },
    ],
  },
  {
    id: 'mathematics', title: 'Mathematics', subtitle: 'Numbers do not lie.', icon: 'sigma', tone: 'gold',
    modes: ['Quick Maths', 'Number Sense', 'Mental Sprint'],
    questions: [
      { prompt: 'What is 18% of 200?', options: ['18', '32', '36', '42'], answer: 2 },
      { prompt: 'Solve fast: 7 × 8 − 9', options: ['45', '47', '49', '51'], answer: 1 },
      { prompt: 'What is the next prime after 23?', options: ['25', '27', '29', '31'], answer: 2 },
    ],
  },
  {
    id: 'knowledge', title: 'General Knowledge', subtitle: 'Know more. Move fast.', icon: 'globe', tone: 'pink',
    modes: ['World Signals', 'Icons', 'Rapid Recall'],
    questions: [
      { prompt: 'Which planet has the most visible rings?', options: ['Mars', 'Saturn', 'Venus', 'Mercury'], answer: 1 },
      { prompt: 'Which ocean is the largest?', options: ['Atlantic', 'Indian', 'Arctic', 'Pacific'], answer: 3 },
      { prompt: 'How many sides does a hexagon have?', options: ['5', '6', '7', '8'], answer: 1 },
    ],
  },
  {
    id: 'reaction', title: 'Reaction', subtitle: 'Choose under pressure.', icon: 'bolt', tone: 'green',
    modes: ['Fast Signal', 'Rapid Choice', 'Pressure Test'],
    questions: [
      { prompt: 'Which symbol is different?', options: ['▲', '▲', '▶', '▲'], answer: 2 },
      { prompt: 'Tap the only even prime number.', options: ['1', '2', '3', '5'], answer: 1 },
      { prompt: 'Which direction is opposite to north?', options: ['East', 'West', 'South', 'North-east'], answer: 2 },
    ],
  },
  {
    id: 'focus', title: 'Focus', subtitle: 'Filter the noise.', icon: 'target', tone: 'cyan',
    modes: ['Signal Focus', 'Detail Scan', 'Steady Aim'],
    questions: [
      { prompt: 'Count the letter A: ARENA SIGNAL ALPHA', options: ['4', '5', '6', '7'], answer: 1 },
      { prompt: 'Which pair is identical?', options: ['NEX1RA / NEXIRA', 'NEXIRA / NEXIRA', 'NEXlRA / NEXIRA', 'NEXlRA / NEX1RA'], answer: 1 },
      { prompt: 'Select the only descending sequence.', options: ['2, 4, 6', '9, 7, 5', '3, 5, 4', '8, 6, 7'], answer: 1 },
    ],
  },
  {
    id: 'language', title: 'Language', subtitle: 'Read between the lines.', icon: 'languages', tone: 'purple',
    modes: ['Word Sprint', 'Word Link', 'Quick Read'],
    questions: [
      { prompt: 'Choose the closest meaning to “rapid”.', options: ['Slow', 'Swift', 'Quiet', 'Careful'], answer: 1 },
      { prompt: 'Which word is spelled correctly?', options: ['Occasion', 'Ocassion', 'Occaision', 'Occation'], answer: 0 },
      { prompt: 'Complete the pair: book is to read as music is to ...', options: ['Draw', 'Listen', 'Write', 'Build'], answer: 1 },
    ],
  },
  {
    id: 'science', title: 'Science', subtitle: 'Decode the natural world.', icon: 'atom', tone: 'gold',
    modes: ['Science Signals', 'Element Scan', 'Discovery'],
    questions: [
      { prompt: 'Which gas do plants absorb from the atmosphere?', options: ['Oxygen', 'Nitrogen', 'Carbon dioxide', 'Helium'], answer: 2 },
      { prompt: 'What is the chemical symbol for gold?', options: ['Ag', 'Au', 'Go', 'Gd'], answer: 1 },
      { prompt: 'Which force keeps planets in orbit?', options: ['Friction', 'Magnetism', 'Gravity', 'Pressure'], answer: 2 },
    ],
  },
];

export const MODE_TIMES = [15, 25, 35];

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
      language: settings.language === 'fa' ? 'fa' : 'en',
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