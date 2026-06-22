import { Link } from "react-router-dom";
import { useLanguage } from "../../context/LanguageContext";

export function SiteFooter() {
  const { t } = useLanguage();

  return (
    <footer className="site-footer">
      <div>
        <p className="site-footer__brand">MMKorea</p>
        <p className="site-footer__meta">{t("footer.meta")}</p>
        <p className="site-footer__meta">상점아이디(MID) : mmkore4r0w</p>
      </div>
      <div className="site-footer__links">
        <Link to="/privacy">{t("footer.privacy")}</Link>
        <Link to="/terms">{t("footer.terms")}</Link>
        <Link to="/lookup">{t("footer.lookup")}</Link>
      </div>
    </footer>
  );
}
