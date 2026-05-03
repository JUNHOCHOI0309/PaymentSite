import { useEffect } from "react";
import { buildApiUrl } from "../../lib/applicationApi";

const faviconHref = buildApiUrl("/api/home/gallery-image?key=favicon%2Ffavicon.ico");

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
