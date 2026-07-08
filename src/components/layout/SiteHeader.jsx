import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useLanguage } from "../../context/LanguageContext";

export function SiteHeader() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const lockedScrollYRef = useRef(0);
  const location = useLocation();
  const { locale, setLocale, t } = useLanguage();
  const mmkCommitteeLabel = locale === "ko" ? "MMK조직위원회" : "MMK Committee";
  const committeePageLabel = locale === "ko" ? "조직위원회" : "Committee";
  const mobileQuickLinks = useMemo(
    () => [
      { key: "home", to: "/", label: t("header.home") },
      { key: "competition-intro", to: "/competition-intro", label: t("header.competitionIntro") },
      { key: "apply", to: "/apply", label: t("header.apply") },
      { key: "lookup", to: "/lookup", label: t("header.lookup") },
    ],
    [t],
  );
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
        key: "apply",
        title: t("header.apply"),
        links: [
          { to: "/apply", label: t("header.applyDiscipline") },
          { to: "/apply/stage-services", label: t("header.applyStageService") },
          { to: "/apply/guide", label: t("header.applyGuide") },
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
      {
        key: "mmk-committee",
        title: mmkCommitteeLabel,
        links: [
          { to: "/organization-committee", label: committeePageLabel },
          { to: "/organization", label: t("header.organizationPage") },
        ],
      },
    ],
    [committeePageLabel, mmkCommitteeLabel, t],
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
      const restoreScrollY = lockedScrollYRef.current;

      document.body.style.removeProperty("overflow");
      document.body.style.removeProperty("position");
      document.body.style.removeProperty("top");
      document.body.style.removeProperty("left");
      document.body.style.removeProperty("right");
      document.body.style.removeProperty("width");
      document.documentElement.style.removeProperty("overscroll-behavior");

      if (restoreScrollY) {
        window.scrollTo(0, restoreScrollY);
      }

      return undefined;
    }

    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyPosition = document.body.style.position;
    const previousBodyTop = document.body.style.top;
    const previousBodyLeft = document.body.style.left;
    const previousBodyRight = document.body.style.right;
    const previousBodyWidth = document.body.style.width;
    const previousOverscrollBehavior = document.documentElement.style.overscrollBehavior;
    const scrollY = window.scrollY;

    lockedScrollYRef.current = scrollY;
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.width = "100%";
    document.documentElement.style.overscrollBehavior = "none";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.position = previousBodyPosition;
      document.body.style.top = previousBodyTop;
      document.body.style.left = previousBodyLeft;
      document.body.style.right = previousBodyRight;
      document.body.style.width = previousBodyWidth;
      document.documentElement.style.overscrollBehavior = previousOverscrollBehavior;
      window.scrollTo(0, lockedScrollYRef.current);
    };
  }, [isMobileMenuOpen]);

  function handleMobileOverlayClick(event) {
    if (event.target === event.currentTarget) {
      setIsMobileMenuOpen(false);
    }
  }

  function isQuickLinkActive(to) {
    if (to === "/") {
      return location.pathname === "/";
    }

    return location.pathname === to || location.pathname.startsWith(`${to}/`);
  }

  return (
    <header className={`site-header ${isScrolled ? "site-header--scrolled" : ""}`}>
      <div className="site-header__inner">
        <div className="site-header__main-row">
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
            <div className="site-header__dropdown">
              <button className="site-header__dropdown-trigger" type="button">
                {t("header.apply")}
              </button>
              <div className="site-header__dropdown-menu">
                <Link to="/apply">{t("header.applyDiscipline")}</Link>
                <Link to="/apply/stage-services">{t("header.applyStageService")}</Link>
                <Link to="/apply/guide">{t("header.applyGuide")}</Link>
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
            <div className="site-header__dropdown">
              <button className="site-header__dropdown-trigger" type="button">
                {mmkCommitteeLabel}
              </button>
              <div className="site-header__dropdown-menu">
                <Link to="/organization-committee">{committeePageLabel}</Link>
                <Link to="/organization">{t("header.organizationPage")}</Link>
              </div>
            </div>
          </nav>
          <div className="site-header__controls">
            <div
              className="site-header__language site-header__language--desktop"
              aria-label={t("language.toggleLabel")}
            >
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
        <nav className="site-header__mobile-quick-nav" aria-label="Mobile quick navigation">
          {mobileQuickLinks.map((link) => (
            <Link
              className={`site-header__mobile-quick-link ${
                isQuickLinkActive(link.to) ? "site-header__mobile-quick-link--active" : ""
              }`.trim()}
              key={link.key}
              to={link.to}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
      <div
        className={`site-header__mobile-overlay ${
          isMobileMenuOpen ? "site-header__mobile-overlay--open" : ""
        }`}
        onClick={handleMobileOverlayClick}
      >
        <nav className="site-header__mobile-panel" aria-label="Mobile navigation">
          <div className="site-header__mobile-language">
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
