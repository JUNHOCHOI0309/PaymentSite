import { PageShell } from "../components/layout/PageShell";
import { useLanguage } from "../context/LanguageContext";

export function TermsPage() {
  const { t } = useLanguage();

  return (
    <PageShell>
      <section className="site-page site-page--narrow">
        <article className="site-document">
          <p className="site-kicker">{t("common.kickerTerms")}</p>
          <h1>{t("terms.title")}</h1>

          <h2>{t("terms.section1")}</h2>
          <p>{t("terms.section1Body")}</p>

          <h2>{t("terms.section2")}</h2>
          <p>{t("terms.section2Body")}</p>

          <h2>{t("terms.section3")}</h2>
          <p>{t("terms.section3Body")}</p>
        </article>
      </section>
    </PageShell>
  );
}
