import React, { createContext, useContext, useState, useCallback } from 'react';
import { en } from './en';
import { id } from './id';

const dictionaries = { en, id };
const LANG_KEY = 'lxd_lang';

function resolveLang(l) {
  return dictionaries[l] ? l : 'en';
}

const I18nContext = createContext({ lang: 'en', t: (k) => k, setLanguage: () => {} });

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(() => resolveLang(localStorage.getItem(LANG_KEY)));

  const setLanguage = useCallback((l) => {
    const resolved = resolveLang(l);
    localStorage.setItem(LANG_KEY, resolved);
    setLangState(resolved);
  }, []);

  const t = useCallback(
    (key, vars) => {
      const dict = dictionaries[lang] || en;
      let str = dict[key] ?? en[key] ?? key;
      if (vars) {
        Object.keys(vars).forEach((k) => {
          str = str.split(`{${k}}`).join(vars[k]);
        });
      }
      return str;
    },
    [lang]
  );

  return <I18nContext.Provider value={{ lang, t, setLanguage }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
