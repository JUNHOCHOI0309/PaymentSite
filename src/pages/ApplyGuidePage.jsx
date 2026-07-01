import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/common/Button";
import { PageShell } from "../components/layout/PageShell";
import { useLanguage } from "../context/LanguageContext";

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

export function ApplyGuidePage() {
  const { t } = useLanguage();
  const [openSections, setOpenSections] = useState({
    application: false,
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
