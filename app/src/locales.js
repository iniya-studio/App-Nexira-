export const LOCALE_REGISTRY = Object.freeze({
  en: Object.freeze({ code: 'en', nativeName: 'English', englishName: 'English', intlLocale: 'en-US', direction: 'ltr', enabled: true }),
  fa: Object.freeze({ code: 'fa', nativeName: 'فارسی', englishName: 'Persian', intlLocale: 'fa-IR', direction: 'rtl', enabled: true }),
  ar: Object.freeze({ code: 'ar', nativeName: 'العربية', englishName: 'Arabic', intlLocale: 'ar', direction: 'rtl', enabled: false }),
  es: Object.freeze({ code: 'es', nativeName: 'Español', englishName: 'Spanish', intlLocale: 'es', direction: 'ltr', enabled: false }),
  fr: Object.freeze({ code: 'fr', nativeName: 'Français', englishName: 'French', intlLocale: 'fr', direction: 'ltr', enabled: false }),
  de: Object.freeze({ code: 'de', nativeName: 'Deutsch', englishName: 'German', intlLocale: 'de', direction: 'ltr', enabled: false }),
  pt: Object.freeze({ code: 'pt', nativeName: 'Português (Brasil)', englishName: 'Brazilian Portuguese', intlLocale: 'pt-BR', direction: 'ltr', enabled: false }),
  ru: Object.freeze({ code: 'ru', nativeName: 'Русский', englishName: 'Russian', intlLocale: 'ru', direction: 'ltr', enabled: false }),
  tr: Object.freeze({ code: 'tr', nativeName: 'Türkçe', englishName: 'Turkish', intlLocale: 'tr', direction: 'ltr', enabled: false }),
  hi: Object.freeze({ code: 'hi', nativeName: 'हिन्दी', englishName: 'Hindi', intlLocale: 'hi', direction: 'ltr', enabled: false }),
  id: Object.freeze({ code: 'id', nativeName: 'Bahasa Indonesia', englishName: 'Indonesian', intlLocale: 'id', direction: 'ltr', enabled: false }),
  ja: Object.freeze({ code: 'ja', nativeName: '日本語', englishName: 'Japanese', intlLocale: 'ja', direction: 'ltr', enabled: false }),
  ko: Object.freeze({ code: 'ko', nativeName: '한국어', englishName: 'Korean', intlLocale: 'ko', direction: 'ltr', enabled: false }),
  'zh-CN': Object.freeze({ code: 'zh-CN', nativeName: '简体中文', englishName: 'Simplified Chinese', intlLocale: 'zh-CN', direction: 'ltr', enabled: false }),
  bn: Object.freeze({ code: 'bn', nativeName: 'বাংলা', englishName: 'Bengali', intlLocale: 'bn', direction: 'ltr', enabled: false }),
  ur: Object.freeze({ code: 'ur', nativeName: 'اردو', englishName: 'Urdu', intlLocale: 'ur-PK', direction: 'rtl', enabled: false }),
  it: Object.freeze({ code: 'it', nativeName: 'Italiano', englishName: 'Italian', intlLocale: 'it', direction: 'ltr', enabled: false }),
  nl: Object.freeze({ code: 'nl', nativeName: 'Nederlands', englishName: 'Dutch', intlLocale: 'nl', direction: 'ltr', enabled: false }),
  th: Object.freeze({ code: 'th', nativeName: 'ไทย', englishName: 'Thai', intlLocale: 'th', direction: 'ltr', enabled: false }),
  vi: Object.freeze({ code: 'vi', nativeName: 'Tiếng Việt', englishName: 'Vietnamese', intlLocale: 'vi', direction: 'ltr', enabled: false }),
});

export const DEFAULT_LOCALE = 'en';

export function normalizeLocaleCode(locale) {
  if (typeof locale !== 'string') return '';
  const trimmed = locale.trim();
  try {
    return Intl.getCanonicalLocales(trimmed)[0] ?? trimmed;
  } catch {
    return trimmed;
  }
}

export function isTargetLocale(locale) {
  return typeof locale === 'string' && Object.hasOwn(LOCALE_REGISTRY, locale);
}

export function isSupportedLocale(locale) {
  const normalized = normalizeLocaleCode(locale);
  return isTargetLocale(normalized) && LOCALE_REGISTRY[normalized].enabled === true;
}

export function resolveLocale(locale) {
  const normalized = normalizeLocaleCode(locale);
  return isSupportedLocale(normalized) ? normalized : DEFAULT_LOCALE;
}

export function getLocaleConfig(locale) {
  const normalized = normalizeLocaleCode(locale);
  return LOCALE_REGISTRY[isTargetLocale(normalized) ? normalized : DEFAULT_LOCALE];
}

export function getTargetLocales() {
  return Object.values(LOCALE_REGISTRY);
}

export function getSupportedLocales() {
  return getTargetLocales().filter(({ enabled }) => enabled);
}

export function formatLocaleNumber(value, locale, options) {
  return new Intl.NumberFormat(getLocaleConfig(locale).intlLocale, options).format(value);
}

export function formatLocaleDate(value, locale, options) {
  return new Intl.DateTimeFormat(getLocaleConfig(locale).intlLocale, options).format(value);
}

export function getLocalePluralCategory(value, locale, options) {
  return new Intl.PluralRules(getLocaleConfig(locale).intlLocale, options).select(value);
}
