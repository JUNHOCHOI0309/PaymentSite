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

export function ApplyGuidePage() {
  const { locale, t } = useLanguage();
  const [openSections, setOpenSections] = useState({
    application: false,
    fee: false,
    lookup: false,
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
