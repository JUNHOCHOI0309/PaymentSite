import { useLanguage } from "../context/LanguageContext";
import { IntroPageLayout } from "./CompetitionIntroPage";

function InfoPage({ title, bodyTitle, body }) {
  return (
    <IntroPageLayout title={title} bodyTitle={bodyTitle}>
      <div className="site-introduce-page__status">
        <p>{body}</p>
      </div>
    </IntroPageLayout>
  );
}

export function OrganizationPage() {
  const { t } = useLanguage();

  return (
    <InfoPage
      title={t("infoPages.organizationTitle")}
      bodyTitle={t("infoPages.organizationBodyTitle")}
      body={t("infoPages.organizationBody")}
    />
  );
}

export function HallOfFamePage() {
  const { t } = useLanguage();

  return (
    <InfoPage
      title={t("infoPages.hallOfFameTitle")}
      bodyTitle={t("infoPages.hallOfFameBodyTitle")}
      body={t("infoPages.hallOfFameBody")}
    />
  );
}

export function SponsorsPage() {
  const { t } = useLanguage();

  return (
    <InfoPage
      title={t("infoPages.sponsorsTitle")}
      bodyTitle={t("infoPages.sponsorsBodyTitle")}
      body={t("infoPages.sponsorsBody")}
    />
  );
}
