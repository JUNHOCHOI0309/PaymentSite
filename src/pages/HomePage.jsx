import { useEffect, useState } from "react";
import { PageShell } from "../components/layout/PageShell";
import { getHomeGalleryImages } from "../lib/applicationApi";

const scheduleItems = [
  ["신청 기간", "2026.05.01 - 2026.05.31"],
  ["예선 발표", "2026.06.10"],
  ["본선 일정", "2026.06.21"],
  ["최종 결과", "2026.06.30"],
];

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

export function HomePage() {
  const [images, setImages] = useState([]);
  const [galleryError, setGalleryError] = useState("");

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
        <div className="site-home-intro__grid">
          <article className="site-home-intro-card">
            <h2>MAN</h2>
          </article>
          <article className="site-home-intro-card">
            <h2>WOMAN</h2>
          </article>
        </div>
      </section>
    </PageShell>
  );
}
