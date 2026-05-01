import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageShell } from "../components/layout/PageShell";
import { buildApiUrl } from "../lib/applicationApi";

const disciplineGroups = {
  man: {
    label: "MAN",
    items: [
      { key: "register/man_1.png", title: "Body Building" },
      { key: "register/man_2.png", title: "Body Building 101" },
      { key: "register/man_3.png", title: "Sports Model Men" },
      { key: "register/man_4.png", title: "Classic Body Building" },
      { key: "register/man_5.png", title: "Physique" },
    ],
  },
  woman: {
    label: "WOMAN",
    items: [
      { key: "register/woman_1.png", title: "Body Building 102" },
      { key: "register/woman_2.png", title: "Sports Model Women" },
      { key: "register/woman_3.png", title: "Bikini Fitness" },
    ],
  },
};

function getRegisterImageUrl(key) {
  return buildApiUrl(`/api/home/gallery-image?key=${encodeURIComponent(key)}`);
}

export function ApplySelectPage() {
  const navigate = useNavigate();
  const trackRef = useRef(null);
  const dragStateRef = useRef({
    isDown: false,
    didDrag: false,
    startX: 0,
    scrollLeft: 0,
  });
  const [activeGroup, setActiveGroup] = useState("man");
  const [isDragging, setIsDragging] = useState(false);
  const activeItems = disciplineGroups[activeGroup].items;

  function handleGroupChange(group) {
    setActiveGroup(group);

    window.requestAnimationFrame(() => {
      trackRef.current?.scrollTo({ left: 0, behavior: "smooth" });
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

    navigate(`/apply/detail?${params.toString()}`);
  }

  return (
    <PageShell>
      <section className="site-register-select" aria-labelledby="register-select-title">
        <div className="site-register-select__heading">
          <h1 id="register-select-title">DISCIPLINES</h1>
          <div className={`site-register-tabs site-register-tabs--${activeGroup}`} role="tablist" aria-label="참가 구분">
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
      </section>
    </PageShell>
  );
}
