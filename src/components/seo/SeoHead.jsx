import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import seoPages from "../../data/seoPages.json";

const { defaultDescription, defaultTitle, pages, siteName, siteUrl } = seoPages;

const pageByPath = new Map(pages.map((page) => [page.path, page]));

const nonIndexablePrefixes = [
  "/admin",
  "/apply/detail",
  "/apply/consent",
  "/apply/review",
  "/apply/complete",
  "/apply/spectator/consent",
  "/apply/spectator/review",
  "/apply/spectator/complete",
  "/apply/stage-services/detail",
  "/apply/stage-services/review",
  "/apply/stage-services/complete",
  "/lookup",
  "/refund",
  "/payment",
  "/stage-services/payment",
  "/spectators/payment",
  "/kcp-test",
  "/fail",
  "/stage-services/fail",
  "/spectators/fail",
  "/preview",
];

function getSeoPage(pathname) {
  return pageByPath.get(pathname) || null;
}

function isIndexablePath(pathname, page) {
  if (page) {
    return page.indexable;
  }

  return !nonIndexablePrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function upsertMeta(selector, attributes) {
  let element = document.head.querySelector(selector);

  if (!element) {
    element = document.createElement("meta");
    document.head.appendChild(element);
  }

  Object.entries(attributes).forEach(([name, value]) => {
    element.setAttribute(name, value);
  });
}

function upsertCanonical(href) {
  let element = document.head.querySelector('link[rel="canonical"]');

  if (!element) {
    element = document.createElement("link");
    element.setAttribute("rel", "canonical");
    document.head.appendChild(element);
  }

  element.setAttribute("href", href);
}

export function SeoHead() {
  const { pathname } = useLocation();

  useEffect(() => {
    const page = getSeoPage(pathname);
    const title = page?.title || defaultTitle;
    const description = page?.description || defaultDescription;
    const canonicalPath = pathname === "/" ? "" : pathname.replace(/\/$/, "");
    const canonicalUrl = `${siteUrl}${canonicalPath}`;
    const indexable = isIndexablePath(pathname, page);

    document.title = title;
    document.documentElement.lang = "ko";
    upsertMeta('meta[name="description"]', { name: "description", content: description });
    upsertMeta('meta[name="robots"]', {
      name: "robots",
      content: indexable ? "index, follow" : "noindex, nofollow, noarchive",
    });
    upsertMeta('meta[property="og:title"]', { property: "og:title", content: title });
    upsertMeta('meta[property="og:description"]', { property: "og:description", content: description });
    upsertMeta('meta[property="og:type"]', { property: "og:type", content: "website" });
    upsertMeta('meta[property="og:site_name"]', { property: "og:site_name", content: siteName });
    upsertMeta('meta[property="og:url"]', { property: "og:url", content: canonicalUrl });
    upsertCanonical(canonicalUrl);
  }, [pathname]);

  return null;
}
