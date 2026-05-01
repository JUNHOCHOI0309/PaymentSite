import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/common/Button";
import { SectionTitle } from "../components/common/SectionTitle";
import { PageShell } from "../components/layout/PageShell";
import { getHomeGalleryImages } from "../lib/applicationApi";

const scheduleItems = [
  ["신청 기간", "2026.05.01 - 2026.05.31"],
  ["예선 발표", "2026.06.10"],
  ["본선 일정", "2026.06.21"],
  ["최종 결과", "2026.06.30"],
];

const prizeItems = [
  ["대상", "상금 300만원 + 특별 멘토링"],
  ["최우수상", "상금 150만원"],
  ["우수상", "상금 50만원"],
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
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [galleryError, setGalleryError] = useState("");

  useEffect(() => {
    async function fetchGalleryImages() {
      try {
        const json = await getHomeGalleryImages();
        setImages(json.images || []);
      } catch (error) {
        setGalleryError(error.message || "대회 이미지를 불러오지 못했습니다.");
      }
    }

    fetchGalleryImages();
  }, []);

  useEffect(() => {
    if (images.length <= 1) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setCurrentImageIndex((current) => (current + 1) % images.length);
    }, 10000);

    return () => window.clearInterval(timer);
  }, [images]);

  useEffect(() => {
    if (currentImageIndex >= images.length && images.length > 0) {
      setCurrentImageIndex(0);
    }
  }, [currentImageIndex, images.length]);

  const currentImage = images[currentImageIndex] || null;
  const currentIsVideo = isVideoMedia(currentImage);

  return (
    <PageShell hero>
      <section className="site-home-hero">
        <article className="site-home-hero__gallery">
          {currentImage ? (
            <>
              {currentIsVideo ? (
                <video
                  key={currentImage.src}
                  className="site-home-hero__image"
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  aria-label={`대회 영상 ${currentImageIndex + 1}`}
                >
                  <source src={currentImage.src} type={getVideoMimeType(currentImage)} />
                </video>
              ) : (
                <img
                  className="site-home-hero__image"
                  src={currentImage.src}
                  alt={`대회 이미지 ${currentImageIndex + 1}`}
                />
              )}
              <div className="site-home-hero__overlay">
                <p className="site-kicker">Creative Entry Program</p>
                <h1>신청부터 결제까지 한 번에 연결되는 대회 접수 페이지</h1>
                <p>
                  업로드, 신청 확인, 결제, 접수 완료 흐름을 하나의 서비스 경험으로 정리했습니다.
                </p>
                <div className="site-hero__actions">
                  <Link to="/apply">
                    <Button>신청하기</Button>
                  </Link>
                  <Link to="/lookup">
                    <Button variant="ghost">신청 조회</Button>
                  </Link>
                </div>
              </div>
              {images.length > 1 ? (
                <div className="site-home-hero__pager">
                  <span>{String(currentImageIndex + 1).padStart(2, "0")}</span>
                  <span>/</span>
                  <span>{String(images.length).padStart(2, "0")}</span>
                </div>
              ) : null}
            </>
          ) : (
            <div className="site-home-hero__placeholder">
              <p className="site-kicker">Creative Entry Program</p>
              <h1>대회 이미지 삽입 영역</h1>
              <p>
                {galleryError || "R2의 home/ 경로에 이미지가 등록되면 이 영역에서 10초 간격으로 순환 표시됩니다."}
              </p>
              <div className="site-hero__actions">
                <Link to="/apply">
                  <Button>신청하기</Button>
                </Link>
                <Link to="/lookup">
                  <Button variant="ghost">신청 조회</Button>
                </Link>
              </div>
            </div>
          )}
        </article>

        <div className="site-home-hero__stack">
          <aside className="site-home-panel site-home-panel--schedule">
            <p className="site-home-panel__title">핵심 일정</p>
            <ul className="site-home-panel__list">
              {scheduleItems.map(([label, value]) => (
                <li key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </li>
              ))}
            </ul>
          </aside>

          <aside className="site-home-panel site-home-panel--prize">
            <p className="site-home-panel__title">상금 및 혜택</p>
            <div className="site-home-prize-list">
              {prizeItems.map(([label, value]) => (
                <div className="site-home-prize-item" key={label}>
                  <strong>{label}</strong>
                  <span>{value}</span>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </section>

      <section className="site-section">
        <SectionTitle
          eyebrow="Process"
          title="참가 절차"
          description="신청 정보 입력부터 결제 완료, 신청 조회까지 필요한 단계를 명확하게 분리했습니다."
          align="center"
        />
        <div className="site-process">
          <div className="site-process__item">1. 신청 정보 입력</div>
          <div className="site-process__item">2. 신청 내용 확인</div>
          <div className="site-process__item">3. 결제 진행</div>
          <div className="site-process__item">4. 접수 완료</div>
        </div>
      </section>
    </PageShell>
  );
}
