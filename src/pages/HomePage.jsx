import { useEffect, useMemo, useState } from "react";
import { PageShell } from "../components/layout/PageShell";
import { useLanguage } from "../context/LanguageContext";
import { getApplicationDisciplineTitleByImageKey } from "../data/applicationDisciplines";
import { buildApiUrl, getHomeGalleryImages } from "../lib/applicationApi";

const homeUpImageKeys = Array.from({ length: 10 }, (_, index) => `home/home_up_${index + 1}.png`);

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
          "모델 (MODEL)\n\n모델 부문은 선수분들의 패션센스와 우월한 신체를 뽐낼 수 있는 최고의 무대입니다.\n\n스포츠모델 / 커머셜모델 부문으로 나눠져 있으며, 오픈 3라운드, 노비스 1라운드로 진행됩니다.\n\n스포츠모델 오픈과 커머셜모델 오픈의 중복출전은 불가하며, 이 외의 경우는 노비스를 포함하여 모두 중복출전이 가능합니다.\n\n□ 모델 출전자격\n대회일 기준 만 16세 이상의 남녀",
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
              "머슬마니아 보디빌딩 (MUSCLEMANIA BODYBUILDING)\n\n미국에서 1991년 최초의 월드클래스 수준의 보디빌딩 투어로 시작되었습니다.\n\n현재 머슬마니아는 미국에서 가장 인기있는 보디빌딩 대회입니다.\n\n□ 보디빌딩 출전자격\n대회일 기준 만 16세 이상의 남성",
          },
          {
            key: "home/man_2.png",
            registerKey: "register/man_2.png",
            title: "Classic",
            displayLabel: "CLASSIC",
            detailTitle: "Classic",
            detailDescription:
              "머슬마니아 클래식 (MUSCLEMANIA CLASSIC)\n\n2016년부터 시작된 부문으로 고전적이고 대칭적이며 해변과 어울리는 완벽한 신체를 보여주고자 하는 남성들을 위한 새로운 종목으로서 단일라운드로 치뤄집니다.\n\n□ 클래식 출전자격\n대회일 기준 만 20세 이상의 남성",
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
              "피규어 (FIGURE)\n\n2005년부터 시작된 부문으로 머슬마니아 여성부문과 미즈비키니의 중간적인\n\n개념이며, 단일라운드로 진행됩니다.\n\n미즈비키니보다 높은 근육량과 선명도 머슬마니아 여성부문과 다르게 여성성과\n\n여성의 신체라인이 잘 드러나는 몸매를 높게 평가합니다.\n\n□ 피규어 출전자격\n대회일 기준 만 18세 이상의 여성",
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
          "MODEL\n\nThe Model division is a premium stage for competitors who want to showcase both fashion sense and an outstanding physique.\n\nIt is divided into Sports Model and Commercial Model. Open runs 3 rounds, while Novice runs 1 round.\n\nSports Model Open and Commercial Model Open cannot be entered together. Other combinations may be allowed, including Novice.\n\n□ Eligibility\nMen and women aged 16 or older as of the event date.",
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

function isVideoMedia(media) {
  return media?.type === "video" || /\.(mp4|webm|mov)$/i.test(media?.key || media?.src || "");
}

function getVideoMimeType(media) {
  const source = (media?.key || media?.src || "").toLowerCase();

  if (source.endsWith(".webm")) {
    return "video/webm";
  }

  if (source.endsWith(".mov")) {
    return "video/quicktime";
  }

  return "video/mp4";
}

function getHomeImageUrl(key) {
  return buildApiUrl(`/api/home/gallery-image?key=${encodeURIComponent(key)}`);
}

export function HomePage() {
  const { locale, t } = useLanguage();
  const [images, setImages] = useState([]);
  const [galleryError, setGalleryError] = useState("");
  const [activeGroup, setActiveGroup] = useState("man");
  const [activeItemKey, setActiveItemKey] = useState(null);

  const competitionGroups = useMemo(() => getCompetitionGroups(locale), [locale]);

  useEffect(() => {
    async function fetchGalleryImages() {
      try {
        const json = await getHomeGalleryImages();
        setImages(json.images || []);
      } catch (error) {
        setGalleryError(error.message || t("home.loadGalleryError"));
      }
    }

    fetchGalleryImages();
  }, [t]);

  const heroMedia = images.find(isVideoMedia) || images[0] || null;
  const heroIsVideo = isVideoMedia(heroMedia);
  const activeGroupData = competitionGroups[activeGroup] || competitionGroups.man || null;
  const activeItems = activeGroupData?.items || [];
  const activeItem = activeItems.find((item) => item.key === activeItemKey) || activeItems[0] || null;
  const activeItemIndex = activeItem ? activeItems.findIndex((item) => item.key === activeItem.key) : -1;

  useEffect(() => {
    if (!activeGroupData) {
      return;
    }

    if (!activeItem || activeItemIndex < 0) {
      setActiveItemKey(activeGroupData.items[0]?.key || null);
    }
  }, [activeGroupData, activeItem, activeItemIndex]);

  function selectGroup(groupKey) {
    if (!competitionGroups[groupKey]) {
      return;
    }

    setActiveGroup(groupKey);
    setActiveItemKey(competitionGroups[groupKey].items[0]?.key || null);
  }

  function selectNextItem(direction) {
    if (!activeItems.length || activeItemIndex < 0) {
      return;
    }

    const nextIndex = (activeItemIndex + direction + activeItems.length) % activeItems.length;
    setActiveItemKey(activeItems[nextIndex].key);
  }

  return (
    <PageShell hero>
      <section className="site-home-hero">
        <div className="site-home-hero__media">
          {heroMedia ? (
            heroIsVideo ? (
              <video
                key={heroMedia.src}
                className="site-home-hero__asset"
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
                aria-label={t("home.heroVideoLabel")}
              >
                <source src={heroMedia.src} type={getVideoMimeType(heroMedia)} />
              </video>
            ) : (
              <img className="site-home-hero__asset" src={heroMedia.src} alt={t("home.heroImageAlt")} />
            )
          ) : (
            <div className="site-home-hero__placeholder">
              <h1>{t("home.heroPlaceholderTitle")}</h1>
              <p>{galleryError || t("home.heroPlaceholderBody")}</p>
            </div>
          )}
        </div>
      </section>

      <section className="site-home-up" aria-label={t("home.topGalleryAria")}>
        <div className="site-home-up__viewport">
          <div className="site-home-up__track">
            {[...homeUpImageKeys, ...homeUpImageKeys].map((key, index) => (
              <img
                key={`${key}-${index}`}
                className="site-home-up__image"
                src={getHomeImageUrl(key)}
                alt=""
                aria-hidden="true"
              />
            ))}
          </div>
        </div>
      </section>

      <section className="site-home-intro" id="competition-intro" aria-label={t("home.introAria")}>
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
              style={{ backgroundImage: `url("${getHomeImageUrl(group.mainImage)}")` }}
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
                  onClick={() => setActiveItemKey(item.key)}
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
                className="site-home-showcase__backdrop"
                aria-hidden="true"
                style={{ backgroundImage: `url("${getHomeImageUrl(activeItem.key)}")` }}
              />
              <div className="site-home-showcase__scrim" aria-hidden="true" />
              <img
                className="site-home-showcase__image"
                src={getHomeImageUrl(activeItem.key)}
                alt={activeItem.title}
              />
              <div className="site-home-showcase__copy">
                <span className="site-home-showcase__group">{activeGroupData.title}</span>
                <strong>{activeItem.displayLabel || activeItem.title}</strong>
              </div>
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
    </PageShell>
  );
}
