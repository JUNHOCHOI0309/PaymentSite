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
      title={t("header.organizationPage")}
      bodyTitle={t("header.organizationPage")}
      body={t("infoPages.organizationBody")}
    />
  );
}

export function HallOfFamePage() {
  const { t } = useLanguage();

  return (
    <InfoPage
      title={t("header.archive")}
      bodyTitle={t("header.hallOfFame")}
      body={t("infoPages.hallOfFameBody")}
    />
  );
}

export function SponsorsPage() {
  const { t } = useLanguage();

  return (
    <InfoPage
      title={t("header.archive")}
      bodyTitle={t("header.sponsors")}
      body={t("infoPages.sponsorsBody")}
    />
  );
}
