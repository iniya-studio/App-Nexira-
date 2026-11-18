export const LOCALE_REGISTRY = Object.freeze({
  en: Object.freeze({
    code: 'en',
    nativeName: 'English',
    englishName: 'English',
    intlLocale: 'en-US',
    direction: 'ltr',
  }),
  fa: Object.freeze({
    code: 'fa',
    nativeName: 'فارسی',
    englishName: 'Persian',
    intlLocale: 'fa-IR',
    direction: 'rtl',
  }),
});

export const DEFAULT_LOCALE = 'en';

export function isSupportedLocale(locale) {
  return typeof locale === 'string' && Object.hasOwn(LOCALE_REGISTRY, locale);
}

export function resolveLocale(locale) {
  return isSupportedLocale(locale) ? locale : DEFAULT_LOCALE;
}

export function getLocaleConfig(locale) {
  return LOCALE_REGISTRY[resolveLocale(locale)];
}

export function getSupportedLocales() {
  return Object.values(LOCALE_REGISTRY);
}
