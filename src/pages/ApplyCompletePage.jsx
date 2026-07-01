import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "../components/common/Button";
import { PageShell } from "../components/layout/PageShell";
import { useLanguage } from "../context/LanguageContext";
import { getApplicationByNumber, getApplicationByOrder } from "../lib/applicationApi";

export function ApplyCompletePage() {
  const [searchParams] = useSearchParams();
  const { t } = useLanguage();
  const [application, setApplication] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const stageServiceSearchParams = new URLSearchParams();

  if (application?.name) {
    stageServiceSearchParams.set("name", application.name);
  }

  if (application?.email) {
    stageServiceSearchParams.set("email", application.email);
  }

  if (application?.phone) {
    stageServiceSearchParams.set("phone", application.phone);
  }

  const stageServicePath = stageServiceSearchParams.toString()
    ? `/apply/stage-services?${stageServiceSearchParams.toString()}`
    : "/apply/stage-services";

  useEffect(() => {
    async function fetchApplication() {
      const applicationNumber = searchParams.get("applicationNumber");
      const orderId = searchParams.get("orderId");

      if (!applicationNumber && !orderId) {
        return;
      }

      try {
        const json = applicationNumber
          ? await getApplicationByNumber(applicationNumber)
          : await getApplicationByOrder(orderId);

        setApplication(json.application);
      } catch (error) {
        setErrorMessage(error.message || t("complete.loadError"));
      }
    }

    fetchApplication();
  }, [searchParams, t]);

  return (
    <PageShell>
      <section className="site-page site-page--narrow">
        <div className="site-complete-card site-apply-complete-card">
          <p className="site-kicker">{t("common.kickerComplete")}</p>
          <h1>{t("complete.title")}</h1>
          <p>{t("complete.description")}</p>

          {errorMessage ? <p className="site-error-message">{errorMessage}</p> : null}

          <div className="site-review-grid">
            <div className="site-review-row"><span>{t("complete.applicationNumber")}</span><strong>{application?.applicationNumber || "-"}</strong></div>
            <div className="site-review-row"><span>{t("complete.name")}</span><strong>{application?.name || "-"}</strong></div>
            <div className="site-review-row"><span>{t("complete.phone")}</span><strong>{application?.phone || "-"}</strong></div>
            <div className="site-review-row"><span>{t("complete.email")}</span><strong>{application?.email || "-"}</strong></div>
            <div className="site-review-row"><span>{t("complete.submittedAt")}</span><strong>{application?.submittedAt || "-"}</strong></div>
            <div className="site-review-row"><span>{t("complete.paymentStatus")}</span><strong>{application?.paymentStatus || "-"}</strong></div>
          </div>

          <p className="site-field__hint">
            {t("complete.hint")}
          </p>

          <div className="site-inline-actions">
            <Link to="/">
              <Button variant="ghost">{t("complete.home")}</Button>
            </Link>
            <Link to={stageServicePath}>
              <Button>{t("complete.stageServices")}</Button>
            </Link>
            <Link to="/lookup">
              <Button variant="ghost">{t("complete.lookup")}</Button>
            </Link>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
