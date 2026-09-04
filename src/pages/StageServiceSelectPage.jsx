import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PageShell } from "../components/layout/PageShell";
import { ApplicationFlowStepper } from "../components/common/ApplicationFlowStepper";
import { useLanguage } from "../context/LanguageContext";
import { buildPublicMediaUrl } from "../lib/applicationApi";
import { buildStageServiceDetailPath } from "../lib/stageServiceFlowRoutes";

const stageServiceItems = [
  {
    key: "stage-photo",
    titleKey: "stageServiceSelect.photo",
    imageKey: "register/stagephoto.png",
  },
  {
    key: "stage-video",
    titleKey: "stageServiceSelect.video",
    imageKey: "register/stagevideo.png",
  },
  {
    key: "musclemania-tan",
    titleKey: "stageServiceSelect.musclemaniaTan",
    displayTitle: {
      ko: "오피셜 탄",
      en: "Official Tan",
    },
    imageKey: "register/musclemaniatan.png",
    disabled: true,
  },
  {
    key: "hair-makeup",
    titleKey: "stageServiceSelect.hairMakeup",
    imageKey: "register/hairmakeup.png",
  },
];

function getStageServiceItemTitle(item, locale, t) {
  return item.displayTitle?.[locale] || t(item.titleKey);
}

export function StageServiceSelectPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { locale, t } = useLanguage();
  const trackRef = useRef(null);
  const dragStateRef = useRef({
    isDown: false,
    didDrag: false,
    startX: 0,
    scrollLeft: 0,
  });
  const [isDragging, setIsDragging] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const [selectedServiceKey, setSelectedServiceKey] = useState(stageServiceItems[0].key);

  useEffect(() => {
    const track = trackRef.current;

    if (!track) {
      return undefined;
    }

    function updateScrollHints() {
      const maxScrollLeft = Math.max(0, track.scrollWidth - track.clientWidth);
      const threshold = 4;

      setCanScrollLeft(track.scrollLeft > threshold);
      setCanScrollRight(track.scrollLeft < maxScrollLeft - threshold);
    }

    updateScrollHints();
    track.addEventListener("scroll", updateScrollHints, { passive: true });
    window.addEventListener("resize", updateScrollHints);

    const frameId = window.requestAnimationFrame(updateScrollHints);

    return () => {
      window.cancelAnimationFrame(frameId);
      track.removeEventListener("scroll", updateScrollHints);
      window.removeEventListener("resize", updateScrollHints);
    };
  }, []);

  function handleArrowClick(direction) {
    const track = trackRef.current;

    if (!track) {
      return;
    }

    track.scrollBy({
      left: direction * (track.clientWidth * 0.72),
      behavior: "smooth",
    });
  }

  function handlePointerDown(event) {
    const track = trackRef.current;

    if (!track) {
      return;
    }

    dragStateRef.current = {
      isDown: true,
      didDrag: false,
      startX: event.clientX,
      scrollLeft: track.scrollLeft,
    };

    setIsDragging(true);
  }

  function handlePointerMove(event) {
    const track = trackRef.current;
    const dragState = dragStateRef.current;

    if (!track || !dragState.isDown) {
      return;
    }

    event.preventDefault();
    const deltaX = event.clientX - dragState.startX;

    if (Math.abs(deltaX) > 6) {
      dragState.didDrag = true;
    }

    track.scrollLeft = dragState.scrollLeft - deltaX;
  }

  function endDrag() {
    dragStateRef.current.isDown = false;
    setIsDragging(false);
  }

  function handleCardClick(item) {
    if (dragStateRef.current.didDrag) {
      dragStateRef.current.didDrag = false;
      return;
    }

    if (item.disabled) {
      return;
    }

    setSelectedServiceKey(item.key);
    navigate(
      buildStageServiceDetailPath({
        serviceKey: item.key,
        name: searchParams.get("name") || "",
        email: searchParams.get("email") || "",
        phone: searchParams.get("phone") || "",
      }),
      { state: { source: "select" } },
    );
  }

  return (
    <PageShell className="site-shell--register-select">
      <section className="site-register-select site-register-select--service" aria-labelledby="stage-service-select-title">
        <ApplicationFlowStepper currentStep={1} type="stage-service" variant="dark" />
        {canScrollLeft ? (
          <button
            aria-label={t("applySelect.prevCards")}
            className="site-register-scroll-hint site-register-scroll-hint--left"
            onClick={() => handleArrowClick(-1)}
            type="button"
          >
            <span aria-hidden="true" className="site-register-scroll-hint__icon" />
          </button>
        ) : null}
        {canScrollRight ? (
          <button
            aria-label={t("applySelect.nextCards")}
            className="site-register-scroll-hint site-register-scroll-hint--right"
            onClick={() => handleArrowClick(1)}
            type="button"
          >
            <span aria-hidden="true" className="site-register-scroll-hint__icon" />
          </button>
        ) : null}

        <div className="site-register-select__heading">
          <h1 id="stage-service-select-title">{t("stageServiceSelect.title")}</h1>
        </div>

        <div
          className={`site-register-carousel ${isDragging ? "site-register-carousel--dragging" : ""}`}
          onPointerCancel={endDrag}
          onPointerDown={handlePointerDown}
          onPointerLeave={endDrag}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          ref={trackRef}
        >
          <div className="site-register-carousel__spacer" aria-hidden="true" />
          {stageServiceItems.map((item) => (
            <button
              aria-disabled={item.disabled ? "true" : "false"}
              aria-pressed={selectedServiceKey === item.key && !item.disabled}
              className={`site-register-card site-register-card--placeholder ${
                selectedServiceKey === item.key && !item.disabled ? "site-register-card--selected" : ""
              } ${item.disabled ? "site-register-card--disabled" : ""
              }`}
              key={item.key}
              onClick={() => handleCardClick(item)}
              type="button"
            >
              <div className="site-register-card__placeholder-media">
                <img
                  alt={getStageServiceItemTitle(item, locale, t)}
                  src={buildPublicMediaUrl(item.imageKey)}
                />
              </div>
              <strong className="site-register-card__placeholder-title">
                {getStageServiceItemTitle(item, locale, t)}
              </strong>
            </button>
          ))}
          <div className="site-register-carousel__spacer" aria-hidden="true" />
        </div>
      </section>
    </PageShell>
  );
}
