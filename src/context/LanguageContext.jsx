import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getTranslation } from "../lib/translations";

const STORAGE_KEY = "site-language";
const defaultLocale = "ko";

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [locale, setLocale] = useState(defaultLocale);

  useEffect(() => {
    try {
      const savedLocale = window.localStorage.getItem(STORAGE_KEY);

      if (savedLocale === "ko" || savedLocale === "en") {
        setLocale(savedLocale);
      }
    } catch (error) {
      console.error("Failed to load saved language:", error);
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, locale);
    } catch (error) {
      console.error("Failed to persist language:", error);
    }

    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo(() => ({
    locale,
    setLocale,
    t(key, fallback = key) {
      return getTranslation(locale, key) ?? fallback;
    },
  }), [locale]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);

  if (!context) {
    throw new Error("useLanguage must be used within LanguageProvider");
  }

  return context;
}
