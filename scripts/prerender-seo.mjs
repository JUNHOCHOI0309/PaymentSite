import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const distDirectory = path.join(projectRoot, "dist");
const seoPagesPath = path.join(projectRoot, "src", "data", "seoPages.json");
const seoStructuredDataPath = path.join(projectRoot, "src", "data", "seoStructuredData.json");

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function replaceOrInsert(html, pattern, replacement, before = "</head>") {
  if (pattern.test(html)) {
    return html.replace(pattern, replacement);
  }

  return html.replace(before, `${replacement}\n    ${before}`);
}

function renderSnapshot(page) {
  const sections = (page.content || [])
    .map(
      (section) => `\n          <section>\n            <h2>${escapeHtml(section.heading)}</h2>\n            <p>${escapeHtml(section.text)}</p>\n          </section>`,
    )
    .join("");

  return `<main data-seo-prerendered="true">\n        <article>\n          <h1>${escapeHtml(page.heading || page.title)}</h1>${sections}\n        </article>\n      </main>`;
}

function renderStructuredData(page, structuredData) {
  if (page.path !== "/") {
    return "";
  }

  return [structuredData.organization, structuredData.event]
    .filter(Boolean)
    .map((data) => `<script type="application/ld+json">${JSON.stringify(data)}</script>`)
    .join("\n    ");
}

function renderPageHtml(baseHtml, page, seoPages, structuredData) {
  const canonicalUrl = `${seoPages.siteUrl}${page.path === "/" ? "" : page.path}`;
  let html = baseHtml
    .replace(/<html\s+lang="[^"]*">/i, '<html lang="ko">')
    .replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtml(page.title)}</title>`)
    .replace(/<div id="root"><\/div>/i, `<div id="root">${renderSnapshot(page)}</div>`);

  html = replaceOrInsert(
    html,
    /<meta\s+name="description"[^>]*>/i,
    `<meta name="description" content="${escapeHtml(page.description)}" />`,
  );
  html = replaceOrInsert(
    html,
    /<meta\s+name="robots"[^>]*>/i,
    `<meta name="robots" content="${page.indexable ? "index, follow" : "noindex, nofollow, noarchive"}" />`,
  );
  html = replaceOrInsert(
    html,
    /<link\s+rel="canonical"[^>]*>/i,
    `<link rel="canonical" href="${canonicalUrl}" />`,
  );
  html = replaceOrInsert(
    html,
    /<meta\s+property="og:title"[^>]*>/i,
    `<meta property="og:title" content="${escapeHtml(page.title)}" />`,
  );
  html = replaceOrInsert(
    html,
    /<meta\s+property="og:description"[^>]*>/i,
    `<meta property="og:description" content="${escapeHtml(page.description)}" />`,
  );
  html = replaceOrInsert(
    html,
    /<meta\s+property="og:url"[^>]*>/i,
    `<meta property="og:url" content="${canonicalUrl}" />`,
  );
  html = replaceOrInsert(
    html,
    /<script\s+type="application\/ld\+json">[^<]*<\/script>/i,
    renderStructuredData(page, structuredData),
  );

  return html;
}

export async function prerenderSeoPages() {
  const seoPages = JSON.parse(await readFile(seoPagesPath, "utf8"));
  const structuredData = JSON.parse(await readFile(seoStructuredDataPath, "utf8"));
  const baseHtml = await readFile(path.join(distDirectory, "index.html"), "utf8");

  for (const page of seoPages.pages) {
    const outputDirectory = page.path === "/"
      ? distDirectory
      : path.join(distDirectory, page.path.slice(1));
    const outputFile = path.join(outputDirectory, "index.html");

    await mkdir(outputDirectory, { recursive: true });
    await writeFile(outputFile, renderPageHtml(baseHtml, page, seoPages, structuredData), "utf8");
  }

  console.log(`SEO prerendered ${seoPages.pages.length} routes.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  prerenderSeoPages().catch((error) => {
    console.error("Failed to prerender SEO pages:", error);
    process.exitCode = 1;
  });
}
