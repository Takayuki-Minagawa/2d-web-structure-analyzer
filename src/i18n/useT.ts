import { useCallback } from 'react';
import { useI18nStore } from './i18nStore';
import { translations, type TKey } from './translations';

export function useT() {
  const lang = useI18nStore((s) => s.lang);
  const t = useCallback((key: TKey) => translations[lang][key], [lang]);
  return t;
}
