import { create } from 'zustand';
import type { Lang } from './translations';

interface I18nState {
  lang: Lang;
  setLang: (lang: Lang) => void;
}

export const useI18nStore = create<I18nState>((set) => ({
  lang: 'ja',
  setLang: (lang) => set({ lang }),
}));
