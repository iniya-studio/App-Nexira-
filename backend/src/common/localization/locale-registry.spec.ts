import {
  ENABLED_LOCALES,
  TARGET_LOCALES,
  getEnabledLocales,
  isEnabledLocale,
  isTargetLocale,
  normalizeLocaleCode,
} from './locale-registry';

describe('backend locale registry', () => {
  it('contains the complete approved 20-locale V1 target set', () => {
    expect(Object.keys(TARGET_LOCALES)).toEqual([
      'en', 'fa', 'ar', 'es', 'fr', 'de', 'pt', 'ru', 'tr', 'hi',
      'id', 'ja', 'ko', 'zh-CN', 'bn', 'ur', 'it', 'nl', 'th', 'vi',
    ]);
    expect(Object.keys(TARGET_LOCALES)).toHaveLength(20);
  });

  it('marks only locales with complete current packs as enabled', () => {
    expect(ENABLED_LOCALES).toEqual(['en', 'fa']);
    expect(getEnabledLocales().map((locale) => locale.code)).toEqual(['en', 'fa']);
    expect(isEnabledLocale('en')).toBe(true);
    expect(isEnabledLocale('fa')).toBe(true);
    expect(isEnabledLocale('ar')).toBe(false);
  });

  it('records RTL direction for all three RTL target locales', () => {
    expect(TARGET_LOCALES.fa.direction).toBe('rtl');
    expect(TARGET_LOCALES.ar.direction).toBe('rtl');
    expect(TARGET_LOCALES.ur.direction).toBe('rtl');
    expect(Object.values(TARGET_LOCALES).filter((locale) => locale.direction === 'rtl')).toHaveLength(3);
  });

  it('canonicalizes BCP-47 casing without corrupting target locale identifiers', () => {
    expect(normalizeLocaleCode('zh-cn')).toBe('zh-CN');
    expect(normalizeLocaleCode('ZH-CN')).toBe('zh-CN');
    expect(normalizeLocaleCode('FA')).toBe('fa');
    expect(normalizeLocaleCode('en')).toBe('en');
  });

  it('rejects unknown and malformed locale identifiers', () => {
    expect(isTargetLocale('zh-CN')).toBe(true);
    expect(isTargetLocale('zh-cn')).toBe(false);
    expect(isTargetLocale('xx')).toBe(false);
    expect(isTargetLocale(null)).toBe(false);
    expect(isEnabledLocale('xx')).toBe(false);
  });
});
