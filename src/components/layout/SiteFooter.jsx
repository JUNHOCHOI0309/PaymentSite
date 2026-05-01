import { Link } from "react-router-dom";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div>
        <p className="site-footer__brand">MMKorea</p>
        <p className="site-footer__meta">Competition Landing + Application Flow Skeleton</p>
      </div>
      <div className="site-footer__links">
        <Link to="/privacy">개인정보 처리안내</Link>
        <Link to="/terms">참가 유의사항</Link>
        <Link to="/lookup">신청 조회</Link>
      </div>
    </footer>
  );
}
