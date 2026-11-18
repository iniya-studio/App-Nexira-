export type LocaleDirection = 'ltr' | 'rtl';

export type LocaleDefinition = Readonly<{
  code: string;
  nativeName: string;
  englishName: string;
  intlLocale: string;
  direction: LocaleDirection;
}>;

/**
 * Global V1 target registry. A target locale is not automatically enabled:
 * enablement requires complete UI/game-content packs and release QA.
 */
export const TARGET_LOCALES: Readonly<Record<string, LocaleDefinition>> = Object.freeze({
  en: Object.freeze({ code: 'en', nativeName: 'English', englishName: 'English', intlLocale: 'en-US', direction: 'ltr' }),
  fa: Object.freeze({ code: 'fa', nativeName: 'فارسی', englishName: 'Persian', intlLocale: 'fa-IR', direction: 'rtl' }),
  ar: Object.freeze({ code: 'ar', nativeName: 'العربية', englishName: 'Arabic', intlLocale: 'ar', direction: 'rtl' }),
  es: Object.freeze({ code: 'es', nativeName: 'Español', englishName: 'Spanish', intlLocale: 'es', direction: 'ltr' }),
  fr: Object.freeze({ code: 'fr', nativeName: 'Français', englishName: 'French', intlLocale: 'fr', direction: 'ltr' }),
  de: Object.freeze({ code: 'de', nativeName: 'Deutsch', englishName: 'German', intlLocale: 'de', direction: 'ltr' }),
  pt: Object.freeze({ code: 'pt', nativeName: 'Português', englishName: 'Portuguese', intlLocale: 'pt', direction: 'ltr' }),
  ru: Object.freeze({ code: 'ru', nativeName: 'Русский', englishName: 'Russian', intlLocale: 'ru', direction: 'ltr' }),
  tr: Object.freeze({ code: 'tr', nativeName: 'Türkçe', englishName: 'Turkish', intlLocale: 'tr', direction: 'ltr' }),
  hi: Object.freeze({ code: 'hi', nativeName: 'हिन्दी', englishName: 'Hindi', intlLocale: 'hi', direction: 'ltr' }),
  id: Object.freeze({ code: 'id', nativeName: 'Bahasa Indonesia', englishName: 'Indonesian', intlLocale: 'id', direction: 'ltr' }),
  ja: Object.freeze({ code: 'ja', nativeName: '日本語', englishName: 'Japanese', intlLocale: 'ja', direction: 'ltr' }),
  ko: Object.freeze({ code: 'ko', nativeName: '한국어', englishName: 'Korean', intlLocale: 'ko', direction: 'ltr' }),
  'zh-CN': Object.freeze({ code: 'zh-CN', nativeName: '简体中文', englishName: 'Simplified Chinese', intlLocale: 'zh-CN', direction: 'ltr' }),
  bn: Object.freeze({ code: 'bn', nativeName: 'বাংলা', englishName: 'Bengali', intlLocale: 'bn', direction: 'ltr' }),
  ur: Object.freeze({ code: 'ur', nativeName: 'اردو', englishName: 'Urdu', intlLocale: 'ur', direction: 'rtl' }),
  it: Object.freeze({ code: 'it', nativeName: 'Italiano', englishName: 'Italian', intlLocale: 'it', direction: 'ltr' }),
  nl: Object.freeze({ code: 'nl', nativeName: 'Nederlands', englishName: 'Dutch', intlLocale: 'nl', direction: 'ltr' }),
  th: Object.freeze({ code: 'th', nativeName: 'ไทย', englishName: 'Thai', intlLocale: 'th', direction: 'ltr' }),
  vi: Object.freeze({ code: 'vi', nativeName: 'Tiếng Việt', englishName: 'Vietnamese', intlLocale: 'vi', direction: 'ltr' }),
});

export const ENABLED_LOCALES = Object.freeze(['en', 'fa'] as const);

export function isTargetLocale(locale: unknown): locale is keyof typeof TARGET_LOCALES {
  return typeof locale === 'string' && Object.hasOwn(TARGET_LOCALES, locale);
}

export function isEnabledLocale(locale: unknown): locale is (typeof ENABLED_LOCALES)[number] {
  return typeof locale === 'string' && (ENABLED_LOCALES as readonly string[]).includes(locale);
}

export function getEnabledLocales(): readonly LocaleDefinition[] {
  return ENABLED_LOCALES.map((locale) => TARGET_LOCALES[locale]);
}
