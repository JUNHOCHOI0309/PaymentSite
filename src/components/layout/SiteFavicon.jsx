import { useEffect } from "react";
import { buildPublicMediaUrl } from "../../lib/applicationApi";

const faviconHref = buildPublicMediaUrl("favicon/favicon.ico");

export function SiteFavicon() {
  useEffect(() => {
    let link = document.querySelector("link[rel='icon']");

    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }

    link.type = "image/x-icon";
    link.href = faviconHref;
  }, []);

  return null;
}
