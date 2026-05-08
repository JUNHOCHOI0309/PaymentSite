import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";

export function PageShell({ children, hero = false, className = "" }) {
  return (
    <div className={`site-shell ${hero ? "site-shell--hero" : ""} ${className}`.trim()}>
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter />
    </div>
  );
}
