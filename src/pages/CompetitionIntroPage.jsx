import { PageShell } from "../components/layout/PageShell";
import { useLanguage } from "../context/LanguageContext";
import { buildApiUrl } from "../lib/applicationApi";

const mmkIntroImageKeys = [
  "introduce/introduce_2.png",
  "introduce/introduce_3.png",
  "introduce/introduce_4.png",
];

const localizedIntroContent = {
  ko: {
    competitionTitle: "Competition Introduction",
    competitionBodyTitle: "대회 소개",
    competitionBodyImageAlt: "대회 소개 본문 이미지",
    competitionCopy: [
      "머슬매니아®와 피트니스 유니버스™ 프로페셔널 디비전은 자격을 갖춘 자연인 남녀 선수들을 위한 독점 이벤트입니다. 프로들은 오직 대회 성과, 공로 및 성격에 따라 자격을 갖춘 최고의 자연인 선수들로 구성된 존경받는 그룹입니다.",
      "Musclemania® 또는 Fitness Universe™ 프로페셔널 자격을 취득한 후 다른 연맹 대회에 출전하는 선수는 프로페셔널 자격을 상실하게 되며, 재경기 qualify을 시도하기 위해 지역, 국가 또는 국제 대회에 출전해야 합니다. 다른 자연 연맹의 프로 선수들은 Musclemania® 또는 Fitness Universe™ 예선 대회에만 출전할 수 있습니다. 프로 선수들은 활동 상태를 유지하기 위해 최소 3시즌에 한 번 이상 출전해야 합니다. 코로나19 팬데믹으로 인해 2020년 이전에 출전 자격을 얻은 선수들은 추가로 3시즌 동안 출전하여 활동 상태를 유지할 수 있게 됩니다.",
      "Musclemania® 및 Fitness Universe™는 스포츠맨답지 않은 행동, 위험하고/또는 승인되지 않은 운동 기술, 트릭 또는 퍼포먼스, 약물 또는 불법 약물 사용이나 소지 혐의를 포함한 형사 유죄 판결, 포르노, 성적으로 암시적이거나 음란물 이미지, 동영상 및/또는 개인적인 모습의 제작 및 출연에 관여할 권리를 보유하고 있습니다. 모든 프로는 시즌당 최소 한 번 이상 무작위 소변 검사를 받게 되며, 이는 모든 대회 및/또는 72시간의 예고 없이 언제든지 진행됩니다.",
    ],
    mmkTitle: "MMK Introduction",
    mmkBodyTitle: "MMK 소개",
    mmkImageAlt: "MMK 소개 이미지",
  },
  en: {
    competitionTitle: "Competition Introduction",
    competitionBodyTitle: "Competition Introduction",
    competitionBodyImageAlt: "Competition introduction content image",
    competitionCopy: [
      "The Musclemania® and Fitness Universe™ Professional divisions are exclusive events for qualified natural male and female athletes. Pro competitors are a respected group made up of top natural athletes who qualify through performance, merit, and character.",
      "Once an athlete earns Musclemania® or Fitness Universe™ professional status, competing in another federation may result in the loss of that status. To re-qualify, the athlete must compete again in a regional, national, or international qualifying event. Professional athletes from other natural federations may only compete in Musclemania® or Fitness Universe™ qualifier events. To remain active, pros must compete at least once every three seasons. Because of the COVID-19 pandemic, athletes who qualified before 2020 were granted an additional three seasons to maintain active status.",
      "Musclemania® and Fitness Universe™ reserve the right to act on unsportsmanlike conduct, dangerous or unauthorized performance techniques, tricks or routines, criminal convictions including suspected drug or illegal substance use or possession, and involvement in pornographic, sexually suggestive, or obscene images, video, or personal appearances. All professionals are subject to at least one random urinalysis per season, which may be conducted at any event and/or at any time with 72 hours' notice.",
    ],
    mmkTitle: "About MMK",
    mmkBodyTitle: "About MMK",
    mmkImageAlt: "MMK introduction image",
  },
};

export function getIntroduceImageUrl(key) {
  return buildApiUrl(`/api/home/gallery-image?key=${encodeURIComponent(key)}`);
}

export function IntroPageLayout({ title, bodyTitle, children }) {
  return (
    <PageShell>
      <section className="site-introduce-page">
        <div className="site-introduce-page__hero-wrap">
          <img
            className="site-introduce-page__hero"
            src={getIntroduceImageUrl("introduce/introduce_5.png")}
            alt={title}
          />
        </div>

        <div className="site-introduce-page__title-block">
          <h1>{title}</h1>
        </div>

        <section className="site-introduce-page__body" aria-label={bodyTitle}>
          <h2>{bodyTitle}</h2>
          {children}
        </section>
      </section>
    </PageShell>
  );
}

export function CompetitionIntroPage() {
  const { locale } = useLanguage();
  const copy = localizedIntroContent[locale] || localizedIntroContent.ko;

  return (
    <IntroPageLayout title={copy.competitionTitle} bodyTitle={copy.competitionBodyTitle}>
      <div className="site-introduce-page__body-copy">
        <img
          className="site-introduce-page__body-image"
          src={getIntroduceImageUrl("introduce/introduce_6.png")}
          alt={copy.competitionBodyImageAlt}
        />
        <div className="site-introduce-page__body-text">
          {copy.competitionCopy.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      </div>
    </IntroPageLayout>
  );
}

export function MmkIntroPage() {
  const { locale } = useLanguage();
  const copy = localizedIntroContent[locale] || localizedIntroContent.ko;

  return (
    <IntroPageLayout title={copy.mmkTitle} bodyTitle={copy.mmkBodyTitle}>
      <div className="site-introduce-page__gallery site-introduce-page__gallery--flush">
        {mmkIntroImageKeys.map((key, index) => (
          <img
            key={key}
            className="site-introduce-page__gallery-image"
            src={getIntroduceImageUrl(key)}
            alt={`${copy.mmkImageAlt} ${index + 1}`}
          />
        ))}
      </div>
    </IntroPageLayout>
  );
}
