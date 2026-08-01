import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/common/Button";
import { PageShell } from "../components/layout/PageShell";
import { useLanguage } from "../context/LanguageContext";
import {
  formatApplicationEntryFee,
  getApplicationAdditionalDisciplineFee,
  getApplicationEntryFeeSchedule,
} from "../data/applicationEntryFees";

function GuideAccordionSection({
  sectionKey,
  title,
  isOpen,
  onToggle,
  children,
}) {
  return (
    <section className={`site-apply-guide__section ${isOpen ? "site-apply-guide__section--open" : ""}`.trim()}>
      <h2>
        <button
          aria-expanded={isOpen}
          className="site-apply-guide__toggle"
          onClick={() => onToggle(sectionKey)}
          type="button"
        >
          <span>{title}</span>
          <span className="site-apply-guide__toggle-icon" aria-hidden="true">
            ▼
          </span>
        </button>
      </h2>
      {isOpen ? children : null}
    </section>
  );
}

function StepGrid({ items }) {
  return (
    <div className="site-apply-guide__grid">
      {items.map((item) => (
        <article className="site-card site-apply-guide__card" key={`${item.step}-${item.title}`}>
          <span className="site-apply-guide__step">{item.step}</span>
          <h3>{item.title}</h3>
          <p>{item.body}</p>
        </article>
      ))}
    </div>
  );
}

function EntryFeeGuide({ locale }) {
  const schedule = getApplicationEntryFeeSchedule();
  const additionalDisciplineFee = getApplicationAdditionalDisciplineFee();
  const copy =
    locale === "ko"
      ? {
          period: "신청 기간",
          firstFee: "첫 종목 참가비",
          additionalFee: "추가 종목 참가비",
          note:
            "동일한 성함, 연락처, 이메일로 결제 완료된 대회 신청이 있으면 두 번째 종목부터 종목당 추가 종목 참가비가 적용됩니다.",
        }
      : {
          period: "Application period",
          firstFee: "First discipline fee",
          additionalFee: "Additional discipline fee",
          note:
            "After a completed competition application with the same name, phone number, and email, each additional discipline is charged at the additional discipline fee.",
        };

  return (
    <div className="site-apply-guide__fee">
      <div className="site-apply-guide__fee-table-wrap">
        <table className="site-apply-guide__fee-table">
          <thead>
            <tr>
              <th>{copy.period}</th>
              <th>{copy.firstFee}</th>
              <th>{copy.additionalFee}</th>
            </tr>
          </thead>
          <tbody>
            {schedule.map((item) => (
              <tr key={item.id}>
                <td>{locale === "ko" ? item.label : item.labelEn || item.label}</td>
                <td>
                  {Number(item.displayOriginalAmount || 0) > Number(item.amount || 0) ? (
                    <del>{formatApplicationEntryFee(item.displayOriginalAmount, locale)}</del>
                  ) : null}
                  <strong>{formatApplicationEntryFee(item.amount, locale)}</strong>
                </td>
                <td>{formatApplicationEntryFee(additionalDisciplineFee, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>{copy.note}</p>
    </div>
  );
}

function RegulationGuide({ locale }) {
  const copy =
    locale === "ko"
      ? {
          summary:
            "아래 내용은 신청 전 확인을 위한 요약입니다. 실제 적용 내용은 신청 단계의 동의 전문 및 관련 약관을 기준으로 합니다.",
          items: [
            {
              title: "개인정보 수집 및 이용",
              required: "필수",
              body:
                "성함, 연락처, 이메일 등 신청 처리에 필요한 정보는 참가 신청, 결제, 신청 조회, 환불 및 고객 지원을 위해 이용됩니다.",
            },
            {
              title: "참가 유의사항",
              required: "필수",
              body:
                "참가 자격, 체급, 복장, 무대 진행 및 대회 운영 안내를 확인해야 하며, 허위 또는 부정확한 정보로 인한 불이익은 참가자에게 발생할 수 있습니다.",
            },
            {
              title: "환불 규정",
              required: "필수",
              body:
                "환불 금액은 결제 완료 시점과 환불 요청 시점의 대회 시작일 기준 구간에 따라 자동 산정되며, 결제 완료 후 동의한 환불 규정이 적용됩니다.",
            },
            {
              title: "마케팅 정보 수신",
              required: "선택",
              body:
                "대회 및 관련 소식 수신에 대한 동의이며, 동의하지 않아도 참가 신청과 서비스 이용에는 영향을 주지 않습니다.",
            },
            {
              title: "사진·동영상 콘텐츠 사용",
              required: "선택",
              body:
                "대회 현장에서 촬영된 사진과 영상의 홍보·기록 목적 이용에 대한 동의입니다. 동의 여부는 참가 신청 자체에 영향을 주지 않습니다.",
            },
          ],
          detailPrefix: "전문 확인:",
          privacy: "개인정보처리방침",
          terms: "이용약관",
        }
      : {
          summary:
            "This is a summary for applicants. The full consent documents and related terms govern the actual application.",
          items: [
            {
              title: "Collection and use of personal information",
              required: "Required",
              body:
                "Information required for an application, including name, phone number, and email, is used for registration, payment, lookup, refunds, and customer support.",
            },
            {
              title: "Participant notices",
              required: "Required",
              body:
                "Applicants must review eligibility, classes, attire, stage procedures, and competition operations. Disadvantages caused by false or inaccurate information may fall on the applicant.",
            },
            {
              title: "Refund policy",
              required: "Required",
              body:
                "Refund amounts are calculated automatically based on the policy period at payment completion and the refund request time, relative to the competition date.",
            },
            {
              title: "Marketing communications",
              required: "Optional",
              body:
                "This consent is for receiving competition and related news. Refusal does not affect registration or use of the service.",
            },
            {
              title: "Photo and video content use",
              required: "Optional",
              body:
                "This consent covers promotional and archival use of photos and videos captured at the competition. It does not affect the application itself.",
            },
          ],
          detailPrefix: "Full documents:",
          privacy: "Privacy Policy",
          terms: "Terms of Service",
        };

  return (
    <div className="site-apply-guide__regulations">
      <p>{copy.summary}</p>
      <div className="site-apply-guide__regulation-list">
        {copy.items.map((item) => (
          <article className="site-card site-apply-guide__regulation-item" key={item.title}>
            <div>
              <h3>{item.title}</h3>
              <span className={`site-apply-guide__regulation-badge site-apply-guide__regulation-badge--${item.required === "선택" || item.required === "Optional" ? "optional" : "required"}`}>{item.required}</span>
            </div>
            <p>{item.body}</p>
          </article>
        ))}
      </div>
      <p className="site-apply-guide__regulation-links">
        <span>{copy.detailPrefix}</span>
        <Link to="/privacy">{copy.privacy}</Link>
        <Link to="/terms">{copy.terms}</Link>
      </p>
    </div>
  );
}

export function ApplyGuidePage() {
  const { locale, t } = useLanguage();
  const [openSections, setOpenSections] = useState({
    application: false,
    fee: false,
    lookup: false,
    regulation: false,
    faq: true,
  });

  const applicationSteps = t("applyGuide.applicationSteps", []);
  const lookupSteps = t("applyGuide.lookupSteps", []);
  const faqItems = t("applyGuide.faqItems", []);

  function toggleSection(sectionKey) {
    setOpenSections((current) => ({
      ...current,
      [sectionKey]: !current[sectionKey],
    }));
  }

  return (
    <PageShell>
      <section className="site-page site-page--narrow">
        <article className="site-document site-apply-guide">
          <p className="site-kicker">{t("common.kickerGuide")}</p>
          <h1>{t("applyGuide.title")}</h1>
          <p>{t("applyGuide.description")}</p>

          <GuideAccordionSection
            sectionKey="application"
            title={t("applyGuide.applicationSectionTitle")}
            isOpen={openSections.application}
            onToggle={toggleSection}
          >
            <StepGrid items={applicationSteps} />
          </GuideAccordionSection>

          <GuideAccordionSection
            sectionKey="fee"
            title={locale === "ko" ? "참가비 안내" : "Entry fee guide"}
            isOpen={openSections.fee}
            onToggle={toggleSection}
          >
            <EntryFeeGuide locale={locale} />
          </GuideAccordionSection>

          <GuideAccordionSection
            sectionKey="lookup"
            title={t("applyGuide.lookupSectionTitle")}
            isOpen={openSections.lookup}
            onToggle={toggleSection}
          >
            <StepGrid items={lookupSteps} />
          </GuideAccordionSection>

          <GuideAccordionSection
            sectionKey="regulation"
            title={locale === "ko" ? "규정 안내" : "Policy guide"}
            isOpen={openSections.regulation}
            onToggle={toggleSection}
          >
            <RegulationGuide locale={locale} />
          </GuideAccordionSection>

          <GuideAccordionSection
            sectionKey="faq"
            title={t("applyGuide.faqSectionTitle")}
            isOpen={openSections.faq}
            onToggle={toggleSection}
          >
            <div className="site-apply-guide__faq">
              {faqItems.map((item) => (
                <article className="site-card site-apply-guide__faq-item" key={item.question}>
                  <h3>{item.question}</h3>
                  <p>{item.answer}</p>
                </article>
              ))}
              <article className="site-card site-apply-guide__support">
                <h3>{t("applyGuide.supportTitle")}</h3>
                <p>{t("applyGuide.supportBody")}</p>
                <div className="site-apply-guide__support-phone">
                  <span>{t("applyGuide.supportPhoneLabel")}</span>
                  <strong>{t("applyGuide.supportPhone")}</strong>
                </div>
                <Link className="site-apply-guide__lookup-link" to="/lookup">
                  <Button>{t("applyGuide.lookupButton")}</Button>
                </Link>
              </article>
            </div>
          </GuideAccordionSection>
        </article>
      </section>
    </PageShell>
  );
}
