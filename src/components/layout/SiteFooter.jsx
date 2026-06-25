import { Link } from "react-router-dom";
import { useLanguage } from "../../context/LanguageContext";

export function SiteFooter() {
  const { t } = useLanguage();

  return (
    <footer className="site-footer">
      <div>
        <p className="site-footer__brand">MMKorea</p>
        <p className="site-footer__meta">{t("footer.meta")}</p>
        <p className="site-footer__meta">상호명 : 모델라인 컴퍼니(주)</p>
        <p className="site-footer__meta">사업자 등록번호 : 188-88-01118</p>
        <p className="site-footer__meta">대표자명 : 박응준</p>
        <p className="site-footer__meta">
          사업장 주소 : 서울특별시 강남구 강남대로160길 15, 2층 (신사동)
        </p>
        <p className="site-footer__meta">사업장 전화번호 : 02-379-2222</p>
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
