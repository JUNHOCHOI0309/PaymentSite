import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useLanguage } from "../../context/LanguageContext";

export function SiteHeader() {
  const [isScrolled, setIsScrolled] = useState(false);
  const { locale, setLocale, t } = useLanguage();

  useEffect(() => {
    function handleScroll() {
      setIsScrolled(window.scrollY > 8);
    }

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header className={`site-header ${isScrolled ? "site-header--scrolled" : ""}`}>
      <div className="site-header__inner">
        <Link to="/" className="site-header__brand">
          MMKorea
        </Link>
        <nav className="site-header__nav">
          <Link to="/">{t("header.home")}</Link>
          <Link to="/apply">{t("header.apply")}</Link>
          <Link to="/lookup">{t("header.lookup")}</Link>
          <div className="site-header__dropdown">
            <button className="site-header__dropdown-trigger" type="button">
              {t("header.competitionIntro")}
            </button>
            <div className="site-header__dropdown-menu">
              <Link to="/mmk-intro">{t("header.mmkIntro")}</Link>
              <Link to="/competition-intro">{t("header.competitionGuide")}</Link>
            </div>
          </div>
        </nav>
        <div className="site-header__language" aria-label={t("language.toggleLabel")}>
          <button
            className={`site-header__language-button ${locale === "ko" ? "site-header__language-button--active" : ""}`}
            onClick={() => setLocale("ko")}
            type="button"
          >
            {t("language.ko")}
          </button>
          <button
            className={`site-header__language-button ${locale === "en" ? "site-header__language-button--active" : ""}`}
            onClick={() => setLocale("en")}
            type="button"
          >
            {t("language.en")}
          </button>
        </div>
      </div>
    </header>
  );
}
