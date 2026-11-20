import { isSupportedLocale, normalizeLocaleCode } from './locales.js';

const FONT_IMPORTERS = Object.freeze({
  en: () => import('@fontsource-variable/inter/wght.css'),
  fa: () => import('@fontsource-variable/noto-sans-arabic/wght.css'),
});

const FONT_FAMILIES = Object.freeze({
  en: '"Inter Variable", sans-serif',
  fa: '"Noto Sans Arabic Variable", "Inter Variable", sans-serif',
});

export function getLocaleFontConfig(locale) {
  const normalized = normalizeLocaleCode(locale);
  const code = isSupportedLocale(normalized) ? normalized : 'en';
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
