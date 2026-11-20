import { isTargetLocale, normalizeLocaleCode } from './locales.js';

const FONT_IMPORTERS = Object.freeze({
  en: () => import('@fontsource-variable/inter/wght.css'),
  fa: () => import('@fontsource-variable/noto-sans-arabic/wght.css'),
  ar: () => import('@fontsource-variable/noto-sans-arabic/wght.css'),
  es: () => import('@fontsource-variable/inter/wght.css'),
  fr: () => import('@fontsource-variable/inter/wght.css'),
  de: () => import('@fontsource-variable/inter/wght.css'),
  pt: () => import('@fontsource-variable/inter/wght.css'),
  ru: () => import('@fontsource-variable/inter/wght.css'),
  tr: () => import('@fontsource-variable/inter/wght.css'),
  hi: () => import('@fontsource-variable/noto-sans-devanagari/wght.css'),
  id: () => import('@fontsource-variable/inter/wght.css'),
  ja: () => import('@fontsource-variable/noto-sans-jp/wght.css'),
  ko: () => import('@fontsource-variable/noto-sans-kr/wght.css'),
  'zh-CN': () => import('@fontsource-variable/noto-sans-sc/wght.css'),
  bn: () => import('@fontsource-variable/noto-sans-bengali/wght.css'),
  ur: () => import('@fontsource/noto-nastaliq-urdu/400.css'),
  it: () => import('@fontsource-variable/inter/wght.css'),
  nl: () => import('@fontsource-variable/inter/wght.css'),
  th: () => import('@fontsource-variable/noto-sans-thai/wght.css'),
  vi: () => import('@fontsource-variable/inter/wght.css'),
});

const FONT_FAMILIES = Object.freeze({
  en: '"Inter Variable", sans-serif',
  fa: '"Noto Sans Arabic Variable", "Inter Variable", sans-serif',
  ar: '"Noto Sans Arabic Variable", "Inter Variable", sans-serif',
  es: '"Inter Variable", sans-serif',
  fr: '"Inter Variable", sans-serif',
  de: '"Inter Variable", sans-serif',
  pt: '"Inter Variable", sans-serif',
  ru: '"Inter Variable", sans-serif',
  tr: '"Inter Variable", sans-serif',
  hi: '"Noto Sans Devanagari Variable", "Inter Variable", sans-serif',
  id: '"Inter Variable", sans-serif',
  ja: '"Noto Sans JP Variable", "Inter Variable", sans-serif',
  ko: '"Noto Sans KR Variable", "Inter Variable", sans-serif',
  'zh-CN': '"Noto Sans SC Variable", "Inter Variable", sans-serif',
  bn: '"Noto Sans Bengali Variable", "Inter Variable", sans-serif',
  ur: '"Noto Nastaliq Urdu", "Noto Sans Arabic Variable", "Inter Variable", sans-serif',
  it: '"Inter Variable", sans-serif',
  nl: '"Inter Variable", sans-serif',
  th: '"Noto Sans Thai Variable", "Inter Variable", sans-serif',
  vi: '"Inter Variable", sans-serif',
});

export function getLocaleFontConfig(locale) {
  const normalized = normalizeLocaleCode(locale);
  const code = isTargetLocale(normalized) ? normalized : 'en';
  return Object.freeze({ code, family: FONT_FAMILIES[code] });
}

export function createLocaleFontLoader({
  importers = FONT_IMPORTERS,
  documentRef = () => globalThis.document,
} = {}) {
  let latestRequest = 0;

  return async function loadLocaleFont(locale) {
    const { code, family } = getLocaleFontConfig(locale);
    const requestId = ++latestRequest;
    const targetDocument = typeof documentRef === 'function' ? documentRef() : documentRef;
    if (!targetDocument?.documentElement?.style?.setProperty) {
      throw new Error('Locale font loading requires a document root.');
    }

    let fallback = false;
    try {
      await importers[code]();
    } catch (error) {
      if (code === 'en') throw error;
      await importers.en();
      fallback = true;
    }

    if (requestId !== latestRequest) {
      return { locale: code, applied: false, stale: true, fallback };
    }

    targetDocument.documentElement.style.setProperty('--font-body', fallback ? FONT_FAMILIES.en : family);
    targetDocument.documentElement.dataset.localeFont = fallback ? 'en' : code;
    return { locale: code, applied: true, stale: false, fallback };
  };
}

export const loadLocaleFont = createLocaleFontLoader();
