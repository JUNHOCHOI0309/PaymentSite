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

export function OrganizationCommitteePage() {
  const { locale } = useLanguage();
  const committeeTitle = locale === "ko" ? "MMK조직위원회" : "MMK Committee";
  const committeePageTitle = locale === "ko" ? "조직위원회" : "Committee";
  const preparingText = locale === "ko" ? "현재 준비중입니다." : "Currently in preparation.";

  return (
    <InfoPage
      title={committeeTitle}
      bodyTitle={committeePageTitle}
      body={preparingText}
    />
  );
}

export function OrganizationPage() {
  const { locale, t } = useLanguage();
  const committeeTitle = locale === "ko" ? "MMK조직위원회" : "MMK Committee";

  return (
    <InfoPage
      title={committeeTitle}
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
