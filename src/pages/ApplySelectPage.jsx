import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { NoticeBox } from "../components/common/NoticeBox";
import { PageShell } from "../components/layout/PageShell";
import { useLanguage } from "../context/LanguageContext";
import { buildApiUrl } from "../lib/applicationApi";

const commonItems = [
  { key: "register/common_1.png", title: "Model Korea" },
  { key: "register/common_2.png", title: "Fitness Korea" },
  { key: "register/common_3.png", title: "Danim Korea" },
  { key: "register/common_4.png", title: "Transformation" },
];

function getDisciplineGroups(t) {
  return {
    man: {
      label: t("applySelect.men"),
      items: [
        { key: "register/man_1.png", title: "Body Building" },
        { key: "register/man_2.png", title: "Classic" },
        { key: "register/man_3.png", title: "Physique" },
        ...commonItems,
      ],
    },
    woman: {
      label: t("applySelect.women"),
      items: [
        { key: "register/woman_1.png", title: "Ms. Bikini Korea" },
        { key: "register/woman_2.png", title: "Figure Korea" },
        ...commonItems,
      ],
    },
  };
}

function getRegisterImageUrl(key) {
  return buildApiUrl(`/api/home/gallery-image?key=${encodeURIComponent(key)}`);
}

export function ApplySelectPage() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const disciplineGroups = getDisciplineGroups(t);
  const trackRef = useRef(null);
  const dragStateRef = useRef({
    isDown: false,
    didDrag: false,
    startX: 0,
    scrollLeft: 0,
  });
  const [activeGroup, setActiveGroup] = useState("man");
  const [isDragging, setIsDragging] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const activeItems = disciplineGroups[activeGroup].items;

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
  }, [activeGroup]);

  function handleGroupChange(group) {
    setActiveGroup(group);

    window.requestAnimationFrame(() => {
      trackRef.current?.scrollTo({ left: 0, behavior: "smooth" });
    });
  }

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

    const params = new URLSearchParams({
      division: activeGroup,
      discipline: item.title,
      imageKey: item.key,
    });

    navigate(`/apply/detail?${params.toString()}`, {
      state: { source: "select" },
    });
  }

  return (
    <PageShell className="site-shell--register-select">
      <section className="site-register-select" aria-labelledby="register-select-title">
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
          <h1 id="register-select-title">{t("applySelect.title")}</h1>
          <div className={`site-register-tabs site-register-tabs--${activeGroup}`} role="tablist" aria-label={t("applySelect.groupAria")}>
            <span className="site-register-tabs__indicator" aria-hidden="true" />
            {Object.entries(disciplineGroups).map(([groupKey, group]) => (
              <button
                aria-selected={activeGroup === groupKey}
                className="site-register-tabs__button"
                key={groupKey}
                onClick={() => handleGroupChange(groupKey)}
                role="tab"
                type="button"
              >
                {group.label}
              </button>
            ))}
          </div>
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
          {activeItems.map((item) => (
            <button className="site-register-card" key={item.key} onClick={() => handleCardClick(item)} type="button">
              <img draggable="false" src={getRegisterImageUrl(item.key)} alt={item.title} />
            </button>
          ))}
          <div className="site-register-carousel__spacer" aria-hidden="true" />
        </div>

        <NoticeBox title={t("applySelect.noticeTitle")}>
          <ul className="site-list">
            <li>{t("applySelect.notice1")}</li>
            <li>{t("applySelect.notice2")}</li>
            <li>{t("applySelect.notice3")}</li>
          </ul>
          <Link className="site-notice__link" to="/apply/guide">
            {t("common.viewApplyGuide")}
          </Link>
        </NoticeBox>
      </section>
    </PageShell>
  );
}
