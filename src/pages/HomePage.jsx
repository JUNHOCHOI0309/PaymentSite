import { useEffect, useMemo, useRef, useState } from "react";
import facebookLogo from "../assets/facebook-logo-primary.png";
import instagramLogo from "../assets/instagram-glyph-gradient.png";
import floatingPlusIcon from "../assets/floating-plus-icon.png";
import { PageShell } from "../components/layout/PageShell";
import { useLanguage } from "../context/LanguageContext";
import { getApplicationAdditionalInfo } from "../data/applicationAdditionalInfo";
import { getApplicationDisciplineTitleByImageKey } from "../data/applicationDisciplines";
import { buildPublicMediaUrl } from "../lib/applicationApi";

const homeUpImageKeys = Array.from({ length: 13 }, (_, index) => `home/home_up_${index + 1}.png`);
const homeHeroPosterImageKeys = Array.from({ length: 11 }, (_, index) => `home/main_${index + 1}.webp`);
const registrationDeadline = new Date("2026-10-19T00:00:00+09:00");
const participantBenefitsDismissalStorageKey = "mmkorea-home-participant-benefits-dismissed-date";
const participantBenefitsSecondaryDismissalStorageKey = "mmkorea-home-participant-benefits-secondary-dismissed-date";
const sponsorLogos = [
  { key: "home/logo_1.png", href: "https://www.xn--2i4b21aq3g7vaq7vn4ifle.com/" },
  { key: "home/logo_2.png", href: "https://www.ihq.co.kr/" },
  { key: "home/logo_3.png", href: "https://www.iwillmedia.co.kr/" },
  { key: "home/logo_4.png" },
  { key: "home/logo_5.png", href: "http://modelline.org/?mCode=about/who" },
  { key: "home/logo_6.png", href: "https://www.silver-itv.co.kr/" },
  { key: "home/logo_7.png", href: "http://modelline.org/?mCode=about/who" },
];

const localizedHomeItems = {
  ko: {
    common: [
      {
        key: "home/common_1.png",
        registerKey: "register/common_1.png",
        title: "Model",
        displayLabel: "MODEL",
        detailTitle: "Model",
        detailDescription:
          "모델 (MODEL)\n\n모델 부문은 선수분들의 패션센스와 우월한 신체를 뽐낼 수 있는 최고의 무대입니다.\n\n스포츠모델 / 커머셜모델 / 시니어 부문으로 나눠져 있으며, 오픈은 3라운드, 노비스와 시니어는 1라운드로 진행됩니다.\n\n스포츠모델 오픈과 커머셜모델 오픈의 중복출전은 불가하며, 이 외의 경우는 노비스를 포함하여 모두 중복출전이 가능합니다.\n\n□ 모델 출전자격\n대회일 기준 만 16세 이상의 남녀",
      },
      {
        key: "home/common_2.png",
        registerKey: "register/common_2.png",
        title: "Fitness",
        displayLabel: "FITNESS",
        detailTitle: "Fitness",
        detailDescription:
          "피트니스 (FITNESS)\n\n피트니스 종목은 피트니스모델 개념의 종목입니다.\n\n선수 개인의 역량이 빛나는 다양한 자유포징을 볼 수 있으며,\n\n수영복 라운드를 통해 아름다운 신체를 추구하는 종목입니다.\n\n피트니스 오픈 부문은 2라운드, 노비스 부문은 1라운드로 진행됩니다.\n\n□ 피트니스 출전자격\n남자 노비스 & 오픈\n여자 노비스 & 오픈\n\n- 자격제한없음 / 체급 신장 계측 후 균등 분배",
      },
      {
        key: "home/common_3.png",
        registerKey: "register/common_3.png",
        title: "Denim",
        displayLabel: "DENIM",
        detailTitle: "Denim",
        detailDescription: "대회 설명이 들어갈 영역입니다.",
      },
      {
        key: "home/common_4.png",
        registerKey: "register/common_4.png",
        title: "Transformation",
        displayLabel: "TRANSFORMATION",
        detailTitle: "Transformation",
        detailDescription: "대회 설명이 들어갈 영역입니다.",
      },
    ],
    groups: {
      man: {
        title: "MAN",
        mainImage: "home/man_main.png",
        items: [
          {
            key: "home/man_1.png",
            registerKey: "register/man_1.png",
            title: "Bodybuilding",
            displayLabel: "BODYBUILDING",
            detailTitle: "Bodybuilding",
            detailDescription:
              "머슬마니아® 보디빌딩 (MUSCLEMANIA BODYBUILDING)\n\n미국에서 1991년 최초의 월드클래스 수준의 보디빌딩 투어로 시작되었습니다.\n\n현재 머슬마니아®는 미국에서 가장 인기있는 보디빌딩 대회입니다.\n\n□ 보디빌딩 출전자격\n대회일 기준 만 16세 이상의 남성",
          },
          {
            key: "home/man_2.png",
            registerKey: "register/man_2.png",
            title: "Classic",
            displayLabel: "CLASSIC",
            detailTitle: "Classic",
            detailDescription:
              "머슬마니아® 클래식 (MUSCLEMANIA CLASSIC)\n\n2016년부터 시작된 부문으로 고전적이고 대칭적이며 해변과 어울리는 완벽한 신체를 보여주고자 하는 남성들을 위한 새로운 종목으로서 단일라운드로 치뤄집니다.\n\n□ 클래식 출전자격\n대회일 기준 만 20세 이상의 남성",
          },
          {
            key: "home/man_3.png",
            registerKey: "register/man_3.png",
            title: "Physique",
            displayLabel: "PHYSIQUE",
            detailTitle: "Physique",
            detailDescription:
              "피지크 (PHYSIQUE)\n\n2013년부터 시작된 부문으로 보디빌딩과 모델 수영복 라운드의 중간적인 개념이며,\n\n단일라운드로 진행됩니다. 남자 선수의 상체를 주로 심사합니다.\n\n□ 피지크 출전자격\n대회일 기준 만 20세 이상의 남성",
          },
        ],
      },
      woman: {
        title: "WOMAN",
        mainImage: "home/woman_main.png",
        items: [
          {
            key: "home/woman_1.png",
            registerKey: "register/woman_1.png",
            title: "Ms.Bikini",
            displayLabel: "MS.BIKINI",
            detailTitle: "Ms.Bikini",
            detailDescription:
              "미즈비키니 (MS.BIKINI)\n\n미즈비키니 부문은 선수분들의 신체라인, 컨디션과\n\n전체적인 매력에 초점을 맞춘 대회입니다.\n\n클래식&오픈은 2라운드 / 노비스는 1라운드로 진행됩니다.\n\n□ 미즈 비키니 출전자격\n대회일 기준 만 18세 이상의 여성",
          },
          {
            key: "home/woman_2.png",
            registerKey: "register/woman_2.png",
            title: "Figure",
            displayLabel: "FIGURE",
            detailTitle: "Figure",
            detailDescription:
              "피규어 (FIGURE)\n\n2005년부터 시작된 부문으로 머슬마니아® 여성부문과 미즈비키니의 중간적인\n\n개념이며, 단일라운드로 진행됩니다.\n\n미즈비키니보다 높은 근육량과 선명도 머슬마니아® 여성부문과 다르게 여성성과\n\n여성의 신체라인이 잘 드러나는 몸매를 높게 평가합니다.\n\n□ 피규어 출전자격\n대회일 기준 만 18세 이상의 여성",
          },
        ],
      },
    },
  },
  en: {
    common: [
      {
        key: "home/common_1.png",
        registerKey: "register/common_1.png",
        title: "Model",
        displayLabel: "MODEL",
        detailTitle: "Model",
        detailDescription:
          "MODEL\n\nThe Model division is a premium stage for competitors who want to showcase both fashion sense and an outstanding physique.\n\nIt is divided into Sports Model, Commercial Model, and Senior. Open runs 3 rounds, while Novice and Senior run 1 round.\n\nSports Model Open and Commercial Model Open cannot be entered together. Other combinations may be allowed, including Novice.\n\n□ Eligibility\nMen and women aged 16 or older as of the event date.",
      },
      {
        key: "home/common_2.png",
        registerKey: "register/common_2.png",
        title: "Fitness",
        displayLabel: "FITNESS",
        detailTitle: "Fitness",
        detailDescription:
          "FITNESS\n\nThe Fitness division follows a fitness-model concept.\n\nIt highlights each competitor's strengths through dynamic free-posing routines and a swimwear round focused on an attractive physique.\n\nFitness Open runs 2 rounds, while Novice runs 1 round.\n\n□ Eligibility\nMen Novice & Open\nWomen Novice & Open\n\n- No qualification restrictions / classes are balanced after height measurement.",
      },
      {
        key: "home/common_3.png",
        registerKey: "register/common_3.png",
        title: "Denim",
        displayLabel: "DENIM",
        detailTitle: "Denim",
        detailDescription: "Detailed competition information will be added here.",
      },
      {
        key: "home/common_4.png",
        registerKey: "register/common_4.png",
        title: "Transformation",
        displayLabel: "TRANSFORMATION",
        detailTitle: "Transformation",
        detailDescription: "Detailed competition information will be added here.",
      },
    ],
    groups: {
      man: {
        title: "MAN",
        mainImage: "home/man_main.png",
        items: [
          {
            key: "home/man_1.png",
            registerKey: "register/man_1.png",
            title: "Bodybuilding",
            displayLabel: "BODYBUILDING",
            detailTitle: "Bodybuilding",
            detailDescription:
              "MUSCLEMANIA BODYBUILDING\n\nThis category began in the U.S. in 1991 as a world-class bodybuilding tour.\n\nToday, Musclemania remains one of the most popular bodybuilding competitions in the United States.\n\n□ Eligibility\nMen aged 16 or older as of the event date.",
          },
          {
            key: "home/man_2.png",
            registerKey: "register/man_2.png",
            title: "Classic",
            displayLabel: "CLASSIC",
            detailTitle: "Classic",
            detailDescription:
              "MUSCLEMANIA CLASSIC\n\nThis division began in 2016 for men who want to present a classic, symmetrical, beach-ready physique in a single-round format.\n\n□ Eligibility\nMen aged 20 or older as of the event date.",
          },
          {
            key: "home/man_3.png",
            registerKey: "register/man_3.png",
            title: "Physique",
            displayLabel: "PHYSIQUE",
            detailTitle: "Physique",
            detailDescription:
              "PHYSIQUE\n\nThis division started in 2013 and sits conceptually between bodybuilding and the model swimwear round.\n\nIt is conducted in a single round and primarily judges the men's upper body.\n\n□ Eligibility\nMen aged 20 or older as of the event date.",
          },
        ],
      },
      woman: {
        title: "WOMAN",
        mainImage: "home/woman_main.png",
        items: [
          {
            key: "home/woman_1.png",
            registerKey: "register/woman_1.png",
            title: "Ms.Bikini",
            displayLabel: "MS.BIKINI",
            detailTitle: "Ms.Bikini",
            detailDescription:
              "MS.BIKINI\n\nThe Ms.Bikini division focuses on body lines, condition, and overall appeal.\n\nClassic and Open run 2 rounds, while Novice runs 1 round.\n\n□ Eligibility\nWomen aged 18 or older as of the event date.",
          },
          {
            key: "home/woman_2.png",
            registerKey: "register/woman_2.png",
            title: "Figure",
            displayLabel: "FIGURE",
            detailTitle: "Figure",
            detailDescription:
              "FIGURE\n\nThis division began in 2005 and sits between the Musclemania women's division and Ms.Bikini in concept.\n\nIt favors stronger conditioning and muscle presence than Ms.Bikini while still valuing femininity and a clear feminine body line.\n\n□ Eligibility\nWomen aged 18 or older as of the event date.",
          },
        ],
      },
    },
  },
};

function normalizeHomeItem(item) {
  const title = getApplicationDisciplineTitleByImageKey(item.registerKey) || item.title || "";

  return {
    ...item,
    title,
    displayLabel: title.toUpperCase(),
    detailTitle: title,
  };
}

function getCompetitionGroups(locale) {
  const localized = localizedHomeItems[locale] || localizedHomeItems.ko;
  const commonItems = localized.common.map(normalizeHomeItem);

  return {
    man: {
      ...localized.groups.man,
      items: [...localized.groups.man.items.map(normalizeHomeItem), ...commonItems],
    },
    woman: {
      ...localized.groups.woman,
      items: [...localized.groups.woman.items.map(normalizeHomeItem), ...commonItems],
    },
  };
}

function getHomeImageUrl(key) {
  return buildPublicMediaUrl(key);
}

function getLocalDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getRegistrationCountdown(now = Date.now()) {
  const remainingMilliseconds = Math.max(0, registrationDeadline.getTime() - now);
  const totalSeconds = Math.floor(remainingMilliseconds / 1000);

  return {
    days: Math.floor(totalSeconds / 86_400),
    hours: Math.floor((totalSeconds % 86_400) / 3_600),
    minutes: Math.floor((totalSeconds % 3_600) / 60),
    seconds: totalSeconds % 60,
  };
}

function HomeHeroCountdown({ locale, countdown }) {
  const units = [
    { key: "days", label: locale === "ko" ? "일" : "Days", value: countdown.days },
    { key: "hours", label: locale === "ko" ? "시간" : "Hours", value: countdown.hours },
    { key: "minutes", label: locale === "ko" ? "분" : "Minutes", value: countdown.minutes },
    { key: "seconds", label: locale === "ko" ? "초" : "Seconds", value: countdown.seconds },
  ];

  return (
    <div className="site-home-hero__countdown" aria-label={locale === "ko" ? "참가 신청 마감까지 남은 시간" : "Time remaining until registration closes"}>
      {units.map((unit) => (
        <div className="site-home-hero__countdown-unit" key={unit.key}>
          <span className="site-home-hero__countdown-value" key={`${unit.key}-${unit.value}`}>
            {String(unit.value).padStart(2, "0")}
          </span>
          <span className="site-home-hero__countdown-label">{unit.label}</span>
        </div>
      ))}
    </div>
  );
}

function getShowcaseGuide(locale, imageKey) {
  const detail = getApplicationAdditionalInfo(locale, imageKey);
  const sections = detail?.sections || [];
  const overview = sections.find((section) => /^(종목 소개|Overview)$/i.test(section.title || ""));
  const eligibility = sections.find((section) => /(출전자격|Eligibility)/i.test(section.title || ""));
  const summary = (overview?.body || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(" ");

  return {
    title: detail?.title || "",
    summary,
    eligibility: eligibility?.body || "",
  };
}

function useNearViewport(ref) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;

    if (!element || typeof window.IntersectionObserver !== "function") {
      setIsVisible(true);
      return undefined;
    }

    const observer = new window.IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "480px 0px" },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return isVisible;
}

export function HomePage() {
  const { locale, t } = useLanguage();
  const [activeHeroPosterIndex, setActiveHeroPosterIndex] = useState(0);
  const [previousHeroPosterKey, setPreviousHeroPosterKey] = useState(null);
  const [registrationCountdown, setRegistrationCountdown] = useState(() => getRegistrationCountdown());
  const [activeGroup, setActiveGroup] = useState("man");
  const [activeItemKey, setActiveItemKey] = useState(null);
  const [isMobileShowcaseGuideOpen, setIsMobileShowcaseGuideOpen] = useState(false);
  const [isParticipantBenefitsOpen, setIsParticipantBenefitsOpen] = useState(false);
  const [isParticipantBenefitsSecondaryOpen, setIsParticipantBenefitsSecondaryOpen] = useState(false);
  const [isSocialMenuOpen, setIsSocialMenuOpen] = useState(false);
  const homeUpRef = useRef(null);
  const homeIntroRef = useRef(null);
  const homeSponsorsRef = useRef(null);
  const heroPosterKeyRef = useRef(homeHeroPosterImageKeys[0]);
  const heroPosterTransitionTimeoutRef = useRef(null);

  const competitionGroups = useMemo(() => getCompetitionGroups(locale), [locale]);
  const isHomeUpVisible = useNearViewport(homeUpRef);
  const isHomeIntroVisible = useNearViewport(homeIntroRef);
  const isHomeSponsorsVisible = useNearViewport(homeSponsorsRef);

  useEffect(() => {
    try {
      setIsParticipantBenefitsOpen(
        window.localStorage.getItem(participantBenefitsDismissalStorageKey) !== getLocalDateKey(),
      );
      setIsParticipantBenefitsSecondaryOpen(
        window.localStorage.getItem(participantBenefitsSecondaryDismissalStorageKey) !== getLocalDateKey(),
      );
    } catch {
      setIsParticipantBenefitsOpen(true);
      setIsParticipantBenefitsSecondaryOpen(true);
    }
  }, []);

  useEffect(() => {
    if (!isParticipantBenefitsOpen && !isParticipantBenefitsSecondaryOpen) {
      return undefined;
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setIsParticipantBenefitsOpen(false);
        setIsParticipantBenefitsSecondaryOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isParticipantBenefitsOpen, isParticipantBenefitsSecondaryOpen]);

  useEffect(() => {
    if (!isSocialMenuOpen) {
      return undefined;
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setIsSocialMenuOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSocialMenuOpen]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const currentIndex = homeHeroPosterImageKeys.indexOf(heroPosterKeyRef.current);
      selectHeroPoster((currentIndex + 1) % homeHeroPosterImageKeys.length);
    }, 5_000);

    return () => {
      window.clearInterval(intervalId);
      window.clearTimeout(heroPosterTransitionTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setRegistrationCountdown(getRegistrationCountdown());
    }, 1_000);

    return () => window.clearInterval(intervalId);
  }, []);

  const activeGroupData = competitionGroups[activeGroup] || competitionGroups.man || null;
  const activeItems = activeGroupData?.items || [];
  const activeItem = activeItems.find((item) => item.key === activeItemKey) || activeItems[0] || null;
  const activeItemGuide = activeItem
    ? getShowcaseGuide(locale, activeItem.registerKey)
    : null;
  const activeItemIndex = activeItem ? activeItems.findIndex((item) => item.key === activeItem.key) : -1;
  const activeHeroPosterKey = homeHeroPosterImageKeys[activeHeroPosterIndex] || homeHeroPosterImageKeys[0];
  useEffect(() => {
    if (!activeGroupData) {
      return;
    }

    if (!activeItem || activeItemIndex < 0) {
      setActiveItemKey(activeGroupData.items[0]?.key || null);
    }
  }, [activeGroupData, activeItem, activeItemIndex]);

  function selectHeroPoster(nextIndex) {
    const nextPosterKey = homeHeroPosterImageKeys[nextIndex];
    const currentPosterKey = heroPosterKeyRef.current;

    if (!nextPosterKey || nextPosterKey === currentPosterKey) {
      return;
    }

    setPreviousHeroPosterKey(currentPosterKey);
    heroPosterKeyRef.current = nextPosterKey;
    setActiveHeroPosterIndex(nextIndex);

    window.clearTimeout(heroPosterTransitionTimeoutRef.current);
    heroPosterTransitionTimeoutRef.current = window.setTimeout(() => {
      setPreviousHeroPosterKey(null);
    }, 720);
  }

  function selectGroup(groupKey) {
    if (!competitionGroups[groupKey]) {
      return;
    }

    setIsMobileShowcaseGuideOpen(false);
    setActiveGroup(groupKey);
    setActiveItemKey(competitionGroups[groupKey].items[0]?.key || null);
  }

  function selectNextItem(direction) {
    if (!activeItems.length || activeItemIndex < 0) {
      return;
    }

    const nextIndex = (activeItemIndex + direction + activeItems.length) % activeItems.length;
    setIsMobileShowcaseGuideOpen(false);
    setActiveItemKey(activeItems[nextIndex].key);
  }

  function closeParticipantBenefits(panel, { hideForToday = false } = {}) {
    const isSecondary = panel === "secondary";
    const dismissalStorageKey = isSecondary
      ? participantBenefitsSecondaryDismissalStorageKey
      : participantBenefitsDismissalStorageKey;

    if (hideForToday) {
      try {
        window.localStorage.setItem(dismissalStorageKey, getLocalDateKey());
      } catch {
        // The modal still closes when browser storage is unavailable.
      }
    }

    if (isSecondary) {
      setIsParticipantBenefitsSecondaryOpen(false);
      return;
    }

    setIsParticipantBenefitsOpen(false);
  }

  return (
    <PageShell hero className="site-shell--home">
      {isParticipantBenefitsOpen || isParticipantBenefitsSecondaryOpen ? (
        <aside
          className={`site-home-benefits-modal ${
            !isParticipantBenefitsOpen ? "site-home-benefits-modal--secondary-only" : ""
          }`.trim()}
          aria-labelledby="participant-benefits-title"
        >
          <h1 className="sr-only" id="participant-benefits-title">
            {locale === "ko" ? "참가자 혜택 안내" : "Participant benefits"}
          </h1>
          {isParticipantBenefitsOpen ? (
            <div className="site-home-benefits-modal__panel">
              <img
                className="site-home-benefits-modal__image"
                src={getHomeImageUrl("home/participant_benefits.webp")}
                alt={locale === "ko" ? "참가자 혜택 안내" : "Participant benefits"}
                decoding="async"
                fetchPriority="high"
              />
              <div className="site-home-benefits-modal__actions">
                <button type="button" onClick={() => closeParticipantBenefits("primary", { hideForToday: true })}>
                  {locale === "ko" ? "오늘 하루 열지 않기" : "Do not show again today"}
                </button>
                <button type="button" onClick={() => closeParticipantBenefits("primary")}>
                  {locale === "ko" ? "닫기" : "Close"}
                </button>
              </div>
            </div>
          ) : null}
          {isParticipantBenefitsSecondaryOpen ? (
            <div className="site-home-benefits-modal__panel site-home-benefits-modal__panel--secondary">
              <img
                className="site-home-benefits-modal__image"
                src={getHomeImageUrl("home/participant_benefits_2.webp")}
                alt={locale === "ko" ? "추가 참가자 혜택 안내" : "Additional participant benefits"}
                decoding="async"
                fetchPriority="high"
              />
              <div className="site-home-benefits-modal__actions">
                <button type="button" onClick={() => closeParticipantBenefits("secondary", { hideForToday: true })}>
                  {locale === "ko" ? "오늘 하루 열지 않기" : "Do not show again today"}
                </button>
                <button type="button" onClick={() => closeParticipantBenefits("secondary")}>
                  {locale === "ko" ? "닫기" : "Close"}
                </button>
              </div>
            </div>
          ) : null}
        </aside>
      ) : null}

      <section className="site-home-hero">
        <h1 className="sr-only">
          {locale === "ko" ? "2026 머슬마니아 코리아 내추럴 챔피언십" : "2026 Musclemania Korea Natural Championship"}
        </h1>
        <div className="site-home-hero__stage">
          <div className="site-home-hero__poster">
            {previousHeroPosterKey ? (
              <img
                className="site-home-hero__poster-image site-home-hero__poster-image--leaving"
                src={getHomeImageUrl(previousHeroPosterKey)}
                alt=""
                aria-hidden="true"
              />
            ) : null}
            <img
              className="site-home-hero__poster-image"
              key={activeHeroPosterKey}
              src={getHomeImageUrl(activeHeroPosterKey)}
              alt={locale === "ko" ? `머슬마니아® 코리아 2026 포스터 ${activeHeroPosterIndex + 1}` : `Musclemania Korea 2026 poster ${activeHeroPosterIndex + 1}`}
              decoding="async"
              fetchPriority={activeHeroPosterIndex === 0 ? "high" : "auto"}
            />
            <div className="site-home-hero__poster-pager" role="tablist" aria-label={locale === "ko" ? "대회 포스터 선택" : "Competition poster selection"}>
              {homeHeroPosterImageKeys.map((key, index) => (
                <button
                  className={index === activeHeroPosterIndex ? "site-home-hero__poster-dot site-home-hero__poster-dot--active" : "site-home-hero__poster-dot"}
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={index === activeHeroPosterIndex}
                  aria-label={locale === "ko" ? `포스터 ${index + 1}` : `Poster ${index + 1}`}
                  onClick={() => selectHeroPoster(index)}
                />
              ))}
            </div>
          </div>

          <div className="site-home-hero__content">
            <img
              className="site-home-hero__logo"
              src={getHomeImageUrl("home/muscle_mania.png")}
              alt="Musclemania"
            />
            <div className="site-home-hero__details">
              <dl>
                <div>
                  <dt>{locale === "ko" ? "대회일" : "Competition"}</dt>
                  <dd>2026. 10. 25 (SUN)</dd>
                </div>
                <div>
                  <dt>{locale === "ko" ? "신청 기간" : "Registration"}</dt>
                  <dd>2026. 08. 03 - 10. 18</dd>
                </div>
              </dl>
            </div>
            <div className="site-home-hero__countdown-wrap">
              <p>{locale === "ko" ? "참가 신청 마감까지" : "Registration closes in"}</p>
              <HomeHeroCountdown locale={locale} countdown={registrationCountdown} />
            </div>
          </div>
        </div>
      </section>

      <section className="site-home-up" aria-label={t("home.topGalleryAria")} ref={homeUpRef}>
        <div className="site-home-up__viewport">
          <div className="site-home-up__track">
            {isHomeUpVisible ? [...homeUpImageKeys, ...homeUpImageKeys].map((key, index) => (
              <img
                key={`${key}-${index}`}
                className="site-home-up__image"
                src={getHomeImageUrl(key)}
                alt=""
                aria-hidden="true"
                decoding="async"
                loading="lazy"
              />
            )) : null}
          </div>
        </div>
      </section>

      <section
        className="site-home-intro"
        id="competition-intro"
        aria-label={t("home.introAria")}
        ref={homeIntroRef}
      >
        <div className="site-home-intro__grid">
          {Object.entries(competitionGroups).map(([groupKey, group]) => (
            <button
              className={`site-home-intro-card ${
                activeGroup === groupKey ? "site-home-intro-card--active" : ""
              }`.trim()}
              key={groupKey}
              type="button"
              aria-label={group.title}
              aria-pressed={activeGroup === groupKey}
              style={
                isHomeIntroVisible
                  ? { backgroundImage: `url("${getHomeImageUrl(group.mainImage)}")` }
                  : undefined
              }
              onClick={() => selectGroup(groupKey)}
            />
          ))}
        </div>

        {activeGroupData && activeItem ? (
          <div className="site-home-showcase">
            <div className="site-home-showcase__tabs" role="tablist" aria-label={`${activeGroupData.title} categories`}>
              {activeItems.map((item) => (
                <button
                  className={`site-home-showcase__tab ${
                    activeItem.key === item.key ? "site-home-showcase__tab--active" : ""
                  }`.trim()}
                  key={item.key}
                  role="tab"
                  type="button"
                  aria-selected={activeItem.key === item.key}
                  onClick={() => {
                    setIsMobileShowcaseGuideOpen(false);
                    setActiveItemKey(item.key);
                  }}
                >
                  {item.displayLabel || item.title}
                </button>
              ))}
            </div>

            <div className={`site-home-showcase__stage site-home-showcase__stage--${activeGroup}`}>
              <button
                className="site-home-showcase__arrow site-home-showcase__arrow--prev"
                type="button"
                aria-label="Previous category"
                onClick={() => selectNextItem(-1)}
              >
                &#8249;
              </button>
              <div
                key={`${activeGroup}-${activeItem.key}-backdrop`}
                className="site-home-showcase__backdrop"
                aria-hidden="true"
                style={
                  isHomeIntroVisible
                    ? { backgroundImage: `url("${getHomeImageUrl(activeItem.key)}")` }
                    : undefined
                }
              />
              <div className="site-home-showcase__scrim" aria-hidden="true" />
              <img
                key={`${activeGroup}-${activeItem.key}-image`}
                className="site-home-showcase__image"
                src={getHomeImageUrl(activeItem.key)}
                alt={activeItem.title}
                decoding="async"
                loading="lazy"
              />
              <button
                className="site-home-showcase__guide-trigger"
                type="button"
                aria-expanded={isMobileShowcaseGuideOpen}
                aria-controls={`showcase-guide-${activeGroup}-${activeItem.key}`}
                onClick={() => setIsMobileShowcaseGuideOpen((isOpen) => !isOpen)}
              >
                <span>{locale === "ko" ? "종목 안내 보기" : "View discipline guide"}</span>
              </button>
              {isMobileShowcaseGuideOpen ? (
                <button
                  className="site-home-showcase__guide-dismiss"
                  type="button"
                  aria-label={locale === "ko" ? "종목 안내 닫기" : "Close discipline guide"}
                  onClick={() => setIsMobileShowcaseGuideOpen(false)}
                />
              ) : null}
              <div className="site-home-showcase__copy">
                <span className="site-home-showcase__group">{activeGroupData.title}</span>
                <strong>{activeItem.displayLabel || activeItem.title}</strong>
              </div>
              {activeItemGuide?.summary ? (
                <article
                  className={`site-home-showcase__guide ${
                    isMobileShowcaseGuideOpen ? "site-home-showcase__guide--mobile-open" : ""
                  }`.trim()}
                  key={`${activeGroup}-${activeItem.key}-guide`}
                  id={`showcase-guide-${activeGroup}-${activeItem.key}`}
                  aria-live="polite"
                >
                  <p className="site-home-showcase__guide-eyebrow">
                    {locale === "ko" ? "종목 안내" : "DISCIPLINE GUIDE"}
                  </p>
                  <h2>{activeItemGuide.title}</h2>
                  <p>{activeItemGuide.summary}</p>
                  {activeItemGuide.eligibility ? (
                    <p className="site-home-showcase__guide-eligibility">
                      <span>{locale === "ko" ? "참가 자격" : "Eligibility"}</span>
                      {activeItemGuide.eligibility}
                    </p>
                  ) : null}
                </article>
              ) : null}
              <button
                className="site-home-showcase__arrow site-home-showcase__arrow--next"
                type="button"
                aria-label="Next category"
                onClick={() => selectNextItem(1)}
              >
                &#8250;
              </button>
            </div>
          </div>
        ) : (
          <div className="site-home-showcase site-home-showcase--empty" />
        )}
      </section>

      <section className="site-home-aeo" aria-labelledby="home-aeo-title">
        <div className="site-home-aeo__heading">
          <p>2026 MUSCLEMANIA KOREA</p>
          <h2 id="home-aeo-title">
            {locale === "ko" ? "대회 및 참가 안내" : "Competition and registration guide"}
          </h2>
        </div>
        <div className="site-home-aeo__grid">
          <article>
            <h3>
              {locale === "ko"
                ? "머슬마니아® 코리아 2026 대회는 언제 열리나요?"
                : "When is Musclemania Korea 2026 held?"}
            </h3>
            <p>
              {locale === "ko"
                ? "머슬마니아® 코리아 2026은 2026년 10월 25일 광운대학교 동해문화예술관(서울 노원구 광운로 21 2-3층)에서 개최됩니다. 세부 시간은 공식 공지로 안내합니다."
                : "Musclemania Korea 2026 takes place at Kwangwoon University Donghae Culture and Arts Center in Seoul on October 25, 2026. The detailed schedule will be announced through official notices."}
            </p>
          </article>
          <article>
            <h3>
              {locale === "ko"
                ? "참가 신청은 어떻게 하나요?"
                : "How do I register for the competition?"}
            </h3>
            <p>
              {locale === "ko"
                ? "종목과 체급을 선택한 뒤 신청서를 작성하고, 이메일 인증과 필수 동의를 완료한 후 온라인으로 참가비를 결제하면 됩니다."
                : "Choose a discipline and class, complete the application, verify your email, complete the required consents, and pay the entry fee online."}
            </p>
          </article>
          <article>
            <h3>
              {locale === "ko"
                ? "참가 가능한 종목은 무엇인가요?"
                : "Which disciplines can I enter?"}
            </h3>
            <p>
              {locale === "ko"
                ? "보디빌딩, 클래식, 피지크, 모델, 피트니스, 데님, 미즈비키니, 피규어, 트랜스포메이션 종목에 참가할 수 있습니다."
                : "Available disciplines are Bodybuilding, Classic, Physique, Model, Fitness, Denim, Ms.Bikini, Figure, and Transformation."}
            </p>
          </article>
          <article>
            <h3>
              {locale === "ko"
                ? "참가 신청 기간과 참가비는 어떻게 되나요?"
                : "What are the registration dates and entry fees?"}
            </h3>
            <p>
              {locale === "ko"
                ? "참가 신청은 2026년 8월 3일부터 10월 18일까지 진행됩니다. 접수 기간별 첫 종목 참가비와 추가 종목 참가비는 신청 안내에서 확인할 수 있습니다."
                : "Registration is open from August 3 through October 18, 2026. See the registration guide for the first-discipline and additional-discipline fees for each registration period."}
            </p>
          </article>
        </div>
      </section>

      <section className="site-home-sponsors" aria-label="Sponsor logos" ref={homeSponsorsRef}>
        <div className="site-home-sponsors__viewport">
          <div className="site-home-sponsors__track">
            {isHomeSponsorsVisible ? [0, 1].map((groupIndex) => (
              <div className="site-home-sponsors__group" key={groupIndex} aria-hidden={groupIndex === 1}>
                {sponsorLogos.map((logo) => {
                  const image = (
                    <img
                      className="site-home-sponsors__logo"
                      src={getHomeImageUrl(logo.key)}
                      alt=""
                      decoding="async"
                      loading="lazy"
                    />
                  );

                  return logo.href ? (
                    <a
                      className="site-home-sponsors__link"
                      href={logo.href}
                      key={`${logo.key}-${groupIndex}`}
                      target="_blank"
                      rel="noreferrer"
                      tabIndex={groupIndex === 1 ? -1 : undefined}
                      aria-label={groupIndex === 0 ? "스폰서 웹사이트 열기" : undefined}
                    >
                      {image}
                    </a>
                  ) : (
                    <span className="site-home-sponsors__link" key={`${logo.key}-${groupIndex}`}>
                      {image}
                    </span>
                  );
                })}
              </div>
            )) : null}
          </div>
        </div>
      </section>

      <aside className={`site-home-social-float ${isSocialMenuOpen ? "site-home-social-float--open" : ""}`}>
        <div className="site-home-social-float__links" aria-hidden={!isSocialMenuOpen}>
          <a
            aria-label="Musclemania Korea official Facebook"
            href="https://www.facebook.com/musclemaniakoreaofficial?rdid=F7RpAGzMhPLHoP5a&share_url=https%3A%2F%2Fwww.facebook.com%2Fshare%2F1DFEnKsozt%2F#"
            rel="noreferrer"
            tabIndex={isSocialMenuOpen ? 0 : -1}
            target="_blank"
          >
            <img alt="" src={facebookLogo} />
          </a>
          <a
            aria-label="Musclemania Korea official Instagram"
            href="https://www.instagram.com/musclemaniakorea?igsh=MWZwN3hmb2Y5dm5weg%3D%3D"
            rel="noreferrer"
            tabIndex={isSocialMenuOpen ? 0 : -1}
            target="_blank"
          >
            <img alt="" src={instagramLogo} />
          </a>
        </div>
        <button
          aria-expanded={isSocialMenuOpen}
          aria-label={isSocialMenuOpen ? "공식 SNS 링크 닫기" : "공식 SNS 링크 열기"}
          className="site-home-social-float__toggle"
          onClick={() => setIsSocialMenuOpen((current) => !current)}
          type="button"
        >
          <img alt="" src={floatingPlusIcon} />
        </button>
      </aside>
    </PageShell>
  );
}
