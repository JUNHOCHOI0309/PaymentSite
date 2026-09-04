import { useState } from "react";
import { useLanguage } from "../../context/LanguageContext";

const flowDefinitions = {
  application: {
    ko: {
      eyebrow: "2026 MUSCLEMANIA KOREA",
      title: "대회 참가 신청",
      steps: ["정보 입력", "약관 동의", "신청 확인", "결제", "완료"],
    },
    en: {
      eyebrow: "2026 MUSCLEMANIA KOREA",
      title: "Competition Application",
      steps: ["Information", "Consent", "Review", "Payment", "Complete"],
    },
  },
  spectator: {
    ko: {
      eyebrow: "2026 MUSCLEMANIA KOREA",
      title: "참관객 신청",
      steps: ["정보 입력", "약관 동의", "신청 확인", "결제", "완료"],
    },
    en: {
      eyebrow: "2026 MUSCLEMANIA KOREA",
      title: "Spectator Application",
      steps: ["Information", "Consent", "Review", "Payment", "Complete"],
    },
  },
  "stage-service": {
    ko: {
      eyebrow: "2026 MUSCLEMANIA KOREA",
      title: "무대 서비스 신청",
      steps: ["서비스 선택", "정보 입력", "신청 확인", "결제", "완료"],
    },
    en: {
      eyebrow: "2026 MUSCLEMANIA KOREA",
      title: "Stage Service Application",
      steps: ["Select", "Information", "Review", "Payment", "Complete"],
    },
  },
};

export function ApplicationFlowStepper({ currentStep, type = "application", variant = "default" }) {
  const { locale } = useLanguage();
  const definition = flowDefinitions[type] || flowDefinitions.application;
  const copy = definition[locale === "en" ? "en" : "ko"];
  const safeCurrentStep = Math.min(Math.max(Number(currentStep) || 1, 1), copy.steps.length);

  return (
    <nav
      aria-label={locale === "en" ? "Application progress" : "신청 진행 단계"}
      className={`site-application-flow site-application-flow--${variant}`}
    >
      <div className="site-application-flow__heading">
        <div>
          <span>{copy.eyebrow}</span>
          <strong>{copy.title}</strong>
        </div>
        <em>{`STEP ${safeCurrentStep} / ${copy.steps.length}`}</em>
      </div>

      <ol className="site-application-flow__steps">
        {copy.steps.map((label, index) => {
          const stepNumber = index + 1;
          const isComplete = stepNumber < safeCurrentStep;
          const isCurrent = stepNumber === safeCurrentStep;

          return (
            <li
              aria-current={isCurrent ? "step" : undefined}
              className={`${isComplete ? "is-complete" : ""} ${isCurrent ? "is-current" : ""}`.trim()}
              key={label}
            >
              <span className="site-application-flow__marker" aria-hidden="true">
                {isComplete ? "✓" : String(stepNumber).padStart(2, "0")}
              </span>
              <span className="site-application-flow__label">{label}</span>
            </li>
          );
        })}
      </ol>

      <p className="site-application-flow__mobile-status">
        <b>{String(safeCurrentStep).padStart(2, "0")}</b>
        <span>{copy.steps[safeCurrentStep - 1]}</span>
      </p>
    </nav>
  );
}

export function ApplicationReviewSection({ children, title }) {
  return (
    <section className="site-flow-review-section">
      <h2>{title}</h2>
      <div className="site-review-grid">{children}</div>
    </section>
  );
}

export function CopyableReference({ value }) {
  const { locale } = useLanguage();
  const [isCopied, setIsCopied] = useState(false);
  const safeValue = value || "-";

  async function handleCopy() {
    if (!value) {
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }

    setIsCopied(true);
    window.setTimeout(() => setIsCopied(false), 1800);
  }

  return (
    <span className="site-copyable-reference">
      <strong>{safeValue}</strong>
      {value ? (
        <button className={isCopied ? "is-copied" : ""} type="button" onClick={handleCopy}>
          {isCopied
            ? locale === "ko" ? "복사 완료" : "Copied"
            : locale === "ko" ? "복사" : "Copy"}
        </button>
      ) : null}
    </span>
  );
}
