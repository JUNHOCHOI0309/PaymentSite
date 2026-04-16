import { Link } from "react-router-dom";
import { Button } from "../common/Button";

export function SiteHeader() {
  return (
    <header className="site-header">
      <Link to="/" className="site-header__brand">
        SHERLYY
      </Link>
      <nav className="site-header__nav">
        <Link to="/">Home</Link>
        <Link to="/apply">Apply</Link>
        <Link to="/lookup">Lookup</Link>
        <Link to="/terms">Terms</Link>
      </nav>
      <div className="site-header__actions">
        <Link to="/apply">
          <Button variant="secondary">신청하기</Button>
        </Link>
      </div>
    </header>
  );
}
