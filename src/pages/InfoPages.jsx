import { useLayoutEffect, useRef, useState } from "react";
import { useLanguage } from "../context/LanguageContext";
import { IntroPageLayout } from "./CompetitionIntroPage";

function InfoPage({ title, bodyTitle, body, children }) {
  return (
    <IntroPageLayout title={title} bodyTitle={bodyTitle}>
        {children || (
          <div className="site-introduce-page__status">
            <p>{body}</p>
          </div>
        )}
    </IntroPageLayout>
  );
}

function OrganizationChartCard({ badge, title, variant = "default" }) {
  return (
    <article className={`site-organization-chart__card site-organization-chart__card--${variant}`}>
      <span>{badge}</span>
      <strong>{title}</strong>
    </article>
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
  const chartViewportRef = useRef(null);
  const chartDiagramRef = useRef(null);
  const [chartMetrics, setChartMetrics] = useState({ scale: 1, height: 0 });
  const committeeTitle = locale === "ko" ? "MMK조직위원회" : "MMK Committee";
  const chart =
    locale === "ko"
      ? {
          eventChair: "대회장",
          advisors: "고문단",
          organizationChair: "조직위원장",
          executiveChair: "집행위원장",
          planning: "기획·제작위원회",
          publicRelations: "홍보위원회",
          secretariat: "사무국",
          sponsorship: "후원·협찬위원회",
          judging: "심사위원회",
        }
      : {
          eventChair: "Event Chair",
          advisors: "Advisory Group",
          organizationChair: "Organization Committee Chair",
          executiveChair: "Executive Committee Chair",
          planning: "Planning & Production Committee",
          publicRelations: "Public Relations Committee",
          secretariat: "Secretariat",
          sponsorship: "Sponsorship Committee",
          judging: "Judging Committee",
        };

  useLayoutEffect(() => {
    const viewport = chartViewportRef.current;
    const diagram = chartDiagramRef.current;

    if (!viewport || !diagram) {
      return undefined;
    }

    function updateChartMetrics() {
      const isMobile = window.matchMedia("(max-width: 800px)").matches;
      const scale = isMobile
        ? Math.min(1, Math.max(0.3, viewport.clientWidth / 1050))
        : 1;

      setChartMetrics({
        scale,
        height: isMobile ? Math.ceil(diagram.offsetHeight * scale) : 0,
      });
    }

    updateChartMetrics();
    const resizeObserver = new ResizeObserver(updateChartMetrics);
    resizeObserver.observe(viewport);
    resizeObserver.observe(diagram);

    return () => resizeObserver.disconnect();
  }, []);

  return (
    <InfoPage
      title={committeeTitle}
      bodyTitle={t("header.organizationPage")}
    >
      <div className="site-organization-chart">
        <div
          ref={chartViewportRef}
          className="site-organization-chart__viewport"
          style={{
            "--organization-chart-scale": chartMetrics.scale,
            "--organization-chart-height": chartMetrics.height ? `${chartMetrics.height}px` : undefined,
          }}
        >
          <div ref={chartDiagramRef} className="site-organization-chart__diagram">
            <div className="site-organization-chart__top">
              <OrganizationChartCard badge="MM+" title={chart.eventChair} variant="event" />
            </div>

            <div className="site-organization-chart__top-connector" aria-hidden="true" />

            <div className="site-organization-chart__lead-row">
              <OrganizationChartCard
                badge="MMK"
                title={chart.organizationChair}
                variant="lead"
              />
              <div className="site-organization-chart__advisor">
                <OrganizationChartCard badge="MM+" title={chart.advisors} variant="advisor" />
              </div>
            </div>

            <div className="site-organization-chart__lead-connector" aria-hidden="true" />

            <div className="site-organization-chart__executive">
              <OrganizationChartCard
                badge="MMK"
                title={chart.executiveChair}
                variant="executive"
              />
            </div>

            <div className="site-organization-chart__division-connector" aria-hidden="true" />

            <div className="site-organization-chart__divisions">
              <div className="site-organization-chart__division-lines" aria-hidden="true">
                {Array.from({ length: 5 }, (_, index) => <span key={index} />)}
              </div>
              <OrganizationChartCard badge="MMK" title={chart.planning} />
              <OrganizationChartCard badge="MMK" title={chart.publicRelations} />
              <OrganizationChartCard badge="MMK" title={chart.secretariat} variant="secretariat" />
              <OrganizationChartCard badge="MMK" title={chart.sponsorship} />
              <OrganizationChartCard badge="MMK" title={chart.judging} />
            </div>
          </div>
        </div>
      </div>
    </InfoPage>
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
