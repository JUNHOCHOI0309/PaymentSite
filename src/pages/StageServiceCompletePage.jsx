import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "../components/common/Button";
import { PageShell } from "../components/layout/PageShell";
import { useLanguage } from "../context/LanguageContext";
import { formatStageServiceAmount, getStageServiceTitle } from "../data/stageServiceConfig";
import { getStageServiceOrderByNumber, getStageServiceOrderByOrder } from "../lib/applicationApi";
import { getCustomerPaymentStatus } from "../lib/customerPaymentStatus";

export function StageServiceCompletePage() {
  const [searchParams] = useSearchParams();
  const { locale, t } = useLanguage();
  const [serviceOrder, setServiceOrder] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function fetchStageServiceOrder() {
      const serviceOrderNumber = searchParams.get("serviceOrderNumber");
      const orderId = searchParams.get("orderId");

      if (!serviceOrderNumber && !orderId) {
        return;
      }

      try {
        const json = serviceOrderNumber
          ? await getStageServiceOrderByNumber(serviceOrderNumber)
          : await getStageServiceOrderByOrder(orderId);

        setServiceOrder(json.serviceOrder);
      } catch (error) {
        setErrorMessage(error.message || t("stageService.completeLoadError"));
      }
    }

    fetchStageServiceOrder();
  }, [searchParams, t]);

  return (
    <PageShell>
      <section className="site-page site-page--stage-service">
        <div className="site-complete-card site-apply-complete-card">
          <p className="site-kicker">{t("common.kickerComplete")}</p>
          <h1>{t("stageService.completeTitle")}</h1>
          <p>{t("stageService.completeDescription")}</p>

          {errorMessage ? <p className="site-error-message">{errorMessage}</p> : null}

          <div className="site-review-grid">
            <div className="site-review-row"><span>{t("stageService.serviceOrderNumber")}</span><strong>{serviceOrder?.serviceOrderNumber || "-"}</strong></div>
            <div className="site-review-row"><span>{t("stageService.serviceType")}</span><strong>{getStageServiceTitle(serviceOrder?.serviceType, locale) || "-"}</strong></div>
            <div className="site-review-row"><span>{t("complete.name")}</span><strong>{serviceOrder?.name || "-"}</strong></div>
            <div className="site-review-row"><span>{t("complete.phone")}</span><strong>{serviceOrder?.phone || "-"}</strong></div>
            <div className="site-review-row"><span>{t("complete.email")}</span><strong>{serviceOrder?.email || "-"}</strong></div>
            <div className="site-review-row"><span>{t("stageService.totalAmount")}</span><strong>{serviceOrder ? formatStageServiceAmount(serviceOrder.totalAmount, locale) : "-"}</strong></div>
            <div className="site-review-row"><span>{t("complete.paymentStatus")}</span><strong>{getCustomerPaymentStatus({ paymentStatus: serviceOrder?.paymentStatus, operationalStatus: serviceOrder?.serviceStatus, locale })}</strong></div>
            <div className="site-review-row"><span>{t("complete.submittedAt")}</span><strong>{serviceOrder?.purchasedAt || "-"}</strong></div>
          </div>

          <p className="site-field__hint">{t("stageService.completeHint")}</p>
          <p className="site-field__hint">
            {locale === "ko"
              ? "서비스 주문번호는 신청 조회에 사용할 수 있으니 캡처하거나 별도로 보관해 주세요."
              : "Keep your service order number to look up this purchase later."}
          </p>

          <div className="site-inline-actions">
            <Link to="/">
              <Button variant="ghost">{t("complete.home")}</Button>
            </Link>
            <Link to="/lookup">
              <Button>{t("complete.lookup")}</Button>
            </Link>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
