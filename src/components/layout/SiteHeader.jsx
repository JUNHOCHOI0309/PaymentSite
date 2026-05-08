import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

export function SiteHeader() {
  const [isScrolled, setIsScrolled] = useState(false);

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
          <Link to="/">HOME</Link>
          <Link to="/apply">대회신청</Link>
          <Link to="/lookup">신청조회</Link>
          <div className="site-header__dropdown">
            <button className="site-header__dropdown-trigger" type="button">
              대회소개
            </button>
            <div className="site-header__dropdown-menu">
              <Link to="/mmk-intro">MMK 소개</Link>
              <Link to="/competition-intro">대회 소개</Link>
            </div>
          </div>
        </nav>
      </div>
    </header>
  );
}
