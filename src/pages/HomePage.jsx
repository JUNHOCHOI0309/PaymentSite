import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageShell } from "../components/layout/PageShell";
import { buildApiUrl, getHomeGalleryImages } from "../lib/applicationApi";

const scheduleItems = [
  ["신청 기간", "2026.05.01 - 2026.05.31"],
  ["예선 발표", "2026.06.10"],
  ["본선 일정", "2026.06.21"],
  ["최종 결과", "2026.06.30"],
];

const commonItems = [
  { key: "home/common_1.png", registerKey: "register/common_1.png", title: "Model Korea" },
  { key: "home/common_2.png", registerKey: "register/common_2.png", title: "Fitness Korea" },
  { key: "home/common_3.png", registerKey: "register/common_3.png", title: "Danim Korea" },
];

const competitionGroups = {
  man: {
    title: "MAN",
    mainImage: "home/man_main.png",
    items: [
      { key: "home/man_1.png", registerKey: "register/man_1.png", title: "Body Building" },
      { key: "home/man_2.png", registerKey: "register/man_2.png", title: "Classic" },
      { key: "home/man_3.png", registerKey: "register/man_3.png", title: "Physique" },
      ...commonItems,
    ],
  },
  woman: {
    title: "WOMAN",
    mainImage: "home/woman_main.png",
    items: [
      { key: "home/woman_1.png", registerKey: "register/woman_1.png", title: "Ms. Bikini Korea" },
      { key: "home/woman_2.png", registerKey: "register/woman_2.png", title: "Figure Korea" },
      ...commonItems,
    ],
  },
};

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

function getApplyDetailPath(groupKey, item) {
  const params = new URLSearchParams({
    division: groupKey,
    discipline: item.title,
    imageKey: item.registerKey || item.key,
  });

  return `/apply/detail?${params.toString()}`;
}

export function HomePage() {
  const [images, setImages] = useState([]);
  const [galleryError, setGalleryError] = useState("");
  const [expandedGroup, setExpandedGroup] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);

  useEffect(() => {
    async function fetchGalleryImages() {
      try {
        const json = await getHomeGalleryImages();
        setImages(json.images || []);
      } catch (error) {
        setGalleryError(error.message || "대회 영상을 불러오지 못했습니다.");
      }
    }

    fetchGalleryImages();
  }, []);

  const heroMedia = images.find(isVideoMedia) || images[0] || null;
  const heroIsVideo = isVideoMedia(heroMedia);
  const expandedData = expandedGroup ? competitionGroups[expandedGroup] : null;

  function openGroup(groupKey) {
    setExpandedGroup(groupKey);
    setSelectedItem(null);
  }

  function closeExpandedArea() {
    setExpandedGroup(null);
    setSelectedItem(null);
  }

  function openItem(item) {
    setSelectedItem(item);
  }

  function goBackToExpanded() {
    setSelectedItem(null);
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
                aria-label="대회 메인 영상"
              >
                <source src={heroMedia.src} type={getVideoMimeType(heroMedia)} />
              </video>
            ) : (
              <img className="site-home-hero__asset" src={heroMedia.src} alt="대회 메인 이미지" />
            )
          ) : (
            <div className="site-home-hero__placeholder">
              <h1>대회 mp4 삽입 위치</h1>
              <p>{galleryError || "R2의 home/ 경로에 mp4 파일이 등록되면 이 영역에서 자동 재생됩니다."}</p>
            </div>
          )}
        </div>
      </section>

      <section className="site-home-schedule" aria-labelledby="home-schedule-title">
        <div className="site-home-schedule__inner">
          <h2 id="home-schedule-title">핵심 일정</h2>
          <ul className="site-home-schedule__list">
            {scheduleItems.map(([label, value]) => (
              <li key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="site-home-intro" id="competition-intro" aria-label="대회 소개">
        {!expandedData ? (
          <div className="site-home-intro__grid">
            {Object.entries(competitionGroups).map(([groupKey, group]) => (
              <button
                className="site-home-intro-card"
                key={groupKey}
                type="button"
                style={{ backgroundImage: `url("${getHomeImageUrl(group.mainImage)}")` }}
                onClick={() => openGroup(groupKey)}
              >
                <span>{group.title}</span>
              </button>
            ))}
          </div>
        ) : (
          <div
            className={`site-home-expanded site-home-expanded--${expandedGroup} ${
              selectedItem ? "site-home-expanded--detail" : ""
            }`}
            role="presentation"
            onClick={closeExpandedArea}
          >
            {!selectedItem ? (
              <div className="site-home-category-grid" onClick={(event) => event.stopPropagation()}>
                {expandedData.items.map((item, index) => (
                  <button
                    className="site-home-category-card"
                    data-index={index + 1}
                    key={item.key}
                    type="button"
                    onClick={() => openItem(item)}
                  >
                    <img src={getHomeImageUrl(item.key)} alt={item.title} />
                  </button>
                ))}
              </div>
            ) : (
              <div className="site-home-detail" onClick={(event) => event.stopPropagation()}>
                <button className="site-home-detail__back" type="button" onClick={goBackToExpanded} aria-label="뒤로가기">
                  ←
                </button>
                <div className="site-home-detail__image">
                  <img src={getHomeImageUrl(selectedItem.key)} alt={selectedItem.title} />
                </div>
                <div className="site-home-detail__side">
                  <div className="site-home-detail__info">
                    <h2>대회 설명<br />및<br />상금 안내</h2>
                  </div>
                  <Link className="site-home-detail__apply" to={getApplyDetailPath(expandedGroup, selectedItem)}>
                    신청하기
                  </Link>
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </PageShell>
  );
}
