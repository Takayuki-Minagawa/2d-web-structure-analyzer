import { create } from 'zustand';
import type { Lang } from './translations';

function loadLang(): Lang {
  try {
    const v = localStorage.getItem('lang');
    if (v === 'ja' || v === 'en') return v;
  } catch { /* ignore */ }
  return 'ja';
}

function saveLang(lang: Lang) {
  try { localStorage.setItem('lang', lang); } catch { /* ignore */ }
}

interface I18nState {
  lang: Lang;
  setLang: (lang: Lang) => void;
}

export const useI18nStore = create<I18nState>((set) => ({
  lang: loadLang(),
  setLang: (lang) => { saveLang(lang); set({ lang }); },
}));
