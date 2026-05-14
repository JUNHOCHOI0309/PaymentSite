import { PageShell } from "../components/layout/PageShell";
import { useLanguage } from "../context/LanguageContext";

export function PrivacyPage() {
  const { t } = useLanguage();

  return (
    <PageShell>
      <section className="site-page site-page--narrow">
        <article className="site-document">
          <p className="site-kicker">{t("common.kickerPrivacy")}</p>
          <h1>{t("privacy.title")}</h1>
          <p>{t("privacy.intro")}</p>

          <h2>{t("privacy.section1")}</h2>
          <p>{t("privacy.section1Body")}</p>

          <h2>{t("privacy.section2")}</h2>
          <p>{t("privacy.section2Body")}</p>

          <h2>{t("privacy.section3")}</h2>
          <p>{t("privacy.section3Body")}</p>
        </article>
      </section>
    </PageShell>
  );
}
