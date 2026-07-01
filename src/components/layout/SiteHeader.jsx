import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useLanguage } from "../../context/LanguageContext";

export function SiteHeader() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();
  const { locale, setLocale, t } = useLanguage();
  const mobileSections = useMemo(
    () => [
      {
        key: "home",
        links: [{ to: "/", label: t("header.home") }],
      },
      {
        key: "competition-intro",
        title: t("header.competitionIntro"),
        links: [
          { to: "/mmk-intro", label: t("header.mmkIntro") },
          { to: "/competition-intro", label: t("header.competitionGuide") },
        ],
      },
      {
        key: "organization",
        links: [{ to: "/organization", label: t("header.organizationPage") }],
      },
      {
        key: "apply",
        title: t("header.apply"),
        links: [
          { to: "/apply", label: t("header.applyDiscipline") },
          { to: "/apply/stage-services", label: t("header.applyStageService") },
        ],
      },
      {
        key: "lookup",
        links: [{ to: "/lookup", label: t("header.lookup") }],
      },
      {
        key: "archive",
        title: t("header.archive"),
        links: [
          { to: "/hall-of-fame", label: t("header.hallOfFame") },
          { to: "/sponsors", label: t("header.sponsors") },
        ],
      },
    ],
    [t],
  );

  useEffect(() => {
    function handleScroll() {
      setIsScrolled(window.scrollY > 8);
    }

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!isMobileMenuOpen) {
      document.body.style.removeProperty("overflow");
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isMobileMenuOpen]);

  function handleMobileOverlayClick(event) {
    if (event.target === event.currentTarget) {
      setIsMobileMenuOpen(false);
    }
  }

  return (
    <header className={`site-header ${isScrolled ? "site-header--scrolled" : ""}`}>
      <div className="site-header__inner">
        <Link to="/" className="site-header__brand">
          MMKorea
        </Link>
        <nav className="site-header__nav">
          <Link to="/">{t("header.home")}</Link>
          <div className="site-header__dropdown">
            <button className="site-header__dropdown-trigger" type="button">
              {t("header.competitionIntro")}
            </button>
            <div className="site-header__dropdown-menu">
              <Link to="/mmk-intro">{t("header.mmkIntro")}</Link>
              <Link to="/competition-intro">{t("header.competitionGuide")}</Link>
            </div>
          </div>
          <Link to="/organization">{t("header.organizationPage")}</Link>
          <div className="site-header__dropdown">
            <button className="site-header__dropdown-trigger" type="button">
              {t("header.apply")}
            </button>
            <div className="site-header__dropdown-menu">
              <Link to="/apply">{t("header.applyDiscipline")}</Link>
              <Link to="/apply/stage-services">{t("header.applyStageService")}</Link>
            </div>
          </div>
          <Link to="/lookup">{t("header.lookup")}</Link>
          <div className="site-header__dropdown">
            <button className="site-header__dropdown-trigger" type="button">
              {t("header.archive")}
            </button>
            <div className="site-header__dropdown-menu">
              <Link to="/hall-of-fame">{t("header.hallOfFame")}</Link>
              <Link to="/sponsors">{t("header.sponsors")}</Link>
            </div>
          </div>
        </nav>
        <div className="site-header__controls">
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
          <button
            aria-expanded={isMobileMenuOpen}
            aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
            className={`site-header__menu-button ${isMobileMenuOpen ? "site-header__menu-button--active" : ""}`}
            onClick={() => setIsMobileMenuOpen((current) => !current)}
            type="button"
          >
            <span className="site-header__menu-button-line" />
            <span className="site-header__menu-button-line" />
            <span className="site-header__menu-button-line" />
          </button>
        </div>
      </div>
      <div
        className={`site-header__mobile-overlay ${
          isMobileMenuOpen ? "site-header__mobile-overlay--open" : ""
        }`}
        onClick={handleMobileOverlayClick}
      >
        <nav className="site-header__mobile-panel" aria-label="Mobile navigation">
          {mobileSections.map((section) => (
            <div className="site-header__mobile-section" key={section.key}>
              {section.title ? (
                <p className="site-header__mobile-section-title">{section.title}</p>
              ) : null}
              <div className="site-header__mobile-links">
                {section.links.map((link) => (
                  <Link
                    className="site-header__mobile-link"
                    key={link.to}
                    onClick={() => setIsMobileMenuOpen(false)}
                    to={link.to}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </div>
    </header>
  );
}
