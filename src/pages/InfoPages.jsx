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
  const greetingParagraphs = [
    "선선한 바람과 함께 결실의 계절로 향하는 길목에서, 대한민국 웰니스케어 피트니스 문화의 정점을 보여줄 ‘머슬마니아 코리아 챔피언십 2026’이 오는 10월 화려한 막을 올립니다. 대회를 준비하며 기대와 설렘으로 가득 찬 마음으로, 웰니스케어 피트니스를 사랑하는 모든 분께 조직위원회를 대표하여 인사드립니다.",
    "오늘날 웰니스케어 피트니스는 단순한 체형 관리나 취미를 넘어, 삶의 균형을 찾고 몸과 마음을 건강하게 가꾸는 대표적인 라이프스타일로 확고히 자리 잡았습니다. 특히 머슬마니아는 오랜 역사 속에서 수많은 스타를 배출하며 대중에게 건강한 자극과 긍정적인 에너지를 전해온 축제의 장입니다.",
    "이번 10월 무대에 서기 위해 전국의 수많은 선수가 지금 이 순간에도 자신과의 치열한 싸움을 이어가고 있습니다. 엄격한 식단 관리와 고된 훈련, 수없이 마주하는 한계를 묵묵히 극복해 낸 그들의 땀방울은 그 자체로 가장 숭고한 도전의 기록입니다. 머슬마니아 무대는 단순한 외적 아름다움의 경연이 아닌, 한 인간이 보여줄 수 있는 인내와 열정, 절제의 미학을 증명하는 자리가 될 것입니다.",
    "조직위원회는 출전하는 모든 선수가 자신의 기량을 안전하고 공정하게 펼칠 수 있도록 대회 환경 조성과 심사 체계의 전문성 강화에 총력을 기울이고 있습니다. 부상 없이 건강하게 훈련을 마무리하고 최고의 컨디션으로 무대에 오를 수 있도록 세심한 지원을 아끼지 않겠습니다.",
    "자신의 한계를 뛰어넘기 위해 모든 것을 쏟아붓고 있는 선수들에게 가장 큰 힘이 되는 것은 바로 여러분의 따뜻한 관심과 격려입니다. 건강관리 세대별 헬시플레저, 웰에이징 피트니스대회, 열정과 감동이 살아 숨 쉴 ‘머슬마니아 코리아 챔피언십 2026’의 무대를 함께 지켜봐 주시고, 건강한 도전에 나서는 모든 주인공에게 아낌없는 응원의 박수를 보내주시길 부탁드립니다.",
  ];

  return (
    <InfoPage
      title={committeeTitle}
      bodyTitle={committeePageTitle}
    >
      <article className="site-committee-greeting">
        <header className="site-committee-greeting__header">
          <span>MESSAGE FROM THE CHAIR</span>
          <h3>조직위원장 인사말</h3>
          <p>
            땀과 절제로 빚어낸 도전의 무대, 10월 ‘머슬마니아 코리아 챔피언십 2026’의 막을 올리며
          </p>
        </header>

        <div className="site-committee-greeting__body">
          <div className="site-committee-greeting__portrait" role="img" aria-label="조직위원장 사진 영역" />
          {greetingParagraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}

          <footer className="site-committee-greeting__signature">
            <p>감사합니다.</p>
            <p>
              머슬마니아 코리아 챔피언십 2026 조직위원장 <strong>이인화</strong> 올림
            </p>
          </footer>
        </div>
      </article>
    </InfoPage>
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
        ? Math.min(1, viewport.clientWidth / 1050)
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
