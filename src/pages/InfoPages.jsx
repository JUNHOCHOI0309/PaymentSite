import { useEffect, useRef } from "react";
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
  const chartDragRef = useRef(null);
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

  useEffect(() => {
    const viewport = chartViewportRef.current;

    if (!viewport) {
      return undefined;
    }

    const frameId = window.requestAnimationFrame(() => {
      if (window.matchMedia("(max-width: 800px)").matches) {
        viewport.scrollLeft = Math.max(0, (viewport.scrollWidth - viewport.clientWidth) / 2);
      }
    });

    return () => window.cancelAnimationFrame(frameId);
  }, []);

  function handleChartPointerDown(event) {
    const viewport = chartViewportRef.current;

    if (
      !viewport ||
      !window.matchMedia("(max-width: 800px)").matches ||
      (event.pointerType === "mouse" && event.button !== 0)
    ) {
      return;
    }

    chartDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
    };
    viewport.setPointerCapture(event.pointerId);
    viewport.classList.add("is-panning");
  }

  function handleChartPointerMove(event) {
    const viewport = chartViewportRef.current;
    const drag = chartDragRef.current;

    if (!viewport || !drag || drag.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    viewport.scrollLeft = drag.scrollLeft - (event.clientX - drag.startX);
    viewport.scrollTop = drag.scrollTop - (event.clientY - drag.startY);
  }

  function handleChartPointerEnd(event) {
    const viewport = chartViewportRef.current;
    const drag = chartDragRef.current;

    if (!viewport || !drag || drag.pointerId !== event.pointerId) {
      return;
    }

    if (viewport.hasPointerCapture(event.pointerId)) {
      viewport.releasePointerCapture(event.pointerId);
    }
    viewport.classList.remove("is-panning");
    chartDragRef.current = null;
  }

  return (
    <InfoPage
      title={committeeTitle}
      bodyTitle={t("header.organizationPage")}
    >
      <div className="site-organization-chart">
        <div
          ref={chartViewportRef}
          className="site-organization-chart__viewport"
          onPointerDown={handleChartPointerDown}
          onPointerMove={handleChartPointerMove}
          onPointerUp={handleChartPointerEnd}
          onPointerCancel={handleChartPointerEnd}
        >
          <div className="site-organization-chart__diagram">
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
