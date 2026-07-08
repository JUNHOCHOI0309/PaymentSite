import { Link } from "react-router-dom";
import { useLanguage } from "../../context/LanguageContext";

export function SiteFooter() {
  const { locale, t } = useLanguage();
  const applyGuideLabel = locale === "ko" ? "신청 안내" : "Application Guide";
  const companyInfo = [
    { label: "상호명", value: "모델라인 컴퍼니(주)" },
    { label: "사업자 등록번호", value: "188-88-01118" },
    { label: "대표자명", value: "박응준" },
    { label: "사업장 주소", value: "서울특별시 강남구 강남대로160길 15, 2층 (신사동)" },
    { label: "사업장 전화번호", value: "02-379-2222" },
    { label: "통신판매업신고번호", value: "제 2026-서울강남-03786 호" },
  ];

  return (
    <footer className="site-footer">
      <div className="site-footer__content">
        <div>
          <p className="site-footer__brand">MMKorea</p>
          <div className="site-footer__meta-group">
            {companyInfo.map((item) => (
              <p className="site-footer__meta" key={item.label}>
                <span className="site-footer__meta-label">{item.label}</span>{" "}
                <span>{item.value}</span>
              </p>
            ))}
          </div>
        </div>
        <div className="site-footer__links">
          <Link to="/apply/guide">{applyGuideLabel}</Link>
          <Link to="/privacy">{t("footer.privacy")}</Link>
          <Link to="/terms">{t("footer.terms")}</Link>
          <Link to="/lookup">{t("footer.lookup")}</Link>
        </div>
      </div>
      <p className="site-footer__copyright">Copyright © 2026 MMKorea All rights reserved.</p>
    </footer>
  );
}
