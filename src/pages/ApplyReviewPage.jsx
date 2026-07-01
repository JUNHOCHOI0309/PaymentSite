import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../components/common/Button";
import { NoticeBox } from "../components/common/NoticeBox";
import { PageShell } from "../components/layout/PageShell";
import { useApplicationFlow } from "../context/ApplicationFlowContext";
import { useLanguage } from "../context/LanguageContext";
import { applicationFlowSteps } from "../lib/applicationFlowAccess";
import { buildApplyDetailPath } from "../lib/applicationFlowRoutes";
import { createOrder, getDraft } from "../lib/applicationApi";

const requiredConsentKeys = ["privacy", "terms", "refund"];

function ReviewRow({ label, value }) {
  return (
    <div className="site-review-row">
      <span>{label}</span>
      <strong>{value || "-"}</strong>
    </div>
  );
}

export function ApplyReviewPage() {
  const navigate = useNavigate();
  const { state, dispatch } = useApplicationFlow();
  const { t } = useLanguage();
  const detailPath = buildApplyDetailPath(state.selection);
  const [draftSnapshot, setDraftSnapshot] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isPreparingPayment, setIsPreparingPayment] = useState(false);

  const paymentPathMap = {
    widget: "/widget/checkout",
    payment: "/payment/checkout",
    brandpay: "/brandpay/checkout",
  };

  const requiredConsentsAccepted = requiredConsentKeys.every((key) => state.consents[key]);
  const reviewDraft = draftSnapshot?.draft;
  const reviewConsents = draftSnapshot?.consents || state.consents;

  useEffect(() => {
    if (!requiredConsentsAccepted) {
      navigate("/apply/consent");
      return;
    }

    async function fetchDraft() {
      if (!state.draftId) {
        return;
      }

      try {
        const json = await getDraft(state.draftId);
        setDraftSnapshot(json);
      } catch (error) {
        setErrorMessage(error.message || t("review.loadDraftError"));
      }
    }

    fetchDraft();
  }, [navigate, requiredConsentsAccepted, state.draftId, t]);

  async function handleProceedPayment() {
    if (!state.draftId) {
      setErrorMessage(t("review.saveFirstError"));
      navigate(detailPath);
      return;
    }

    setIsPreparingPayment(true);
    setErrorMessage("");

    try {
      let orderId = state.orderId;

      if (!orderId) {
        const orderResponse = await createOrder({
          draftId: state.draftId,
          orderName: t("review.orderName"),
          amount: 1,
          customerName: state.applicantInfo.name,
          customerEmail: state.applicantInfo.email,
        });

        orderId = orderResponse.order.orderId;

        dispatch({
          type: "SET_ORDER",
          payload: { orderId },
        });
      }

      const params = new URLSearchParams({
        draftId: state.draftId,
        orderId,
      });

      dispatch({
        type: "SET_FLOW_STEP",
        value: applicationFlowSteps.CHECKOUT,
      });
      navigate(`${paymentPathMap[state.paymentMethod]}?${params.toString()}`);
    } catch (error) {
      setErrorMessage(error.message || t("review.preparePaymentError"));
    } finally {
      setIsPreparingPayment(false);
    }
  }

  return (
    <PageShell>
      <section className="site-page site-page--narrow">
        <div className="site-review-card site-apply-review-card">
          <div className="site-review-card__header">
            <p className="site-kicker">{t("common.kickerReview")}</p>
            <h1>{t("review.title")}</h1>
            <p>{t("review.description")}</p>
          </div>

          <div className="site-review-grid">
            <ReviewRow label={t("review.division")} value={reviewDraft?.division || state.selection.division} />
            <ReviewRow label={t("review.discipline")} value={reviewDraft?.discipline || state.selection.discipline} />
            <ReviewRow label={t("review.name")} value={draftSnapshot?.draft?.name || state.applicantInfo.name} />
            <ReviewRow label={t("review.phone")} value={draftSnapshot?.draft?.phone || state.applicantInfo.phone} />
            <ReviewRow label={t("review.email")} value={draftSnapshot?.draft?.email || state.applicantInfo.email} />
            <ReviewRow label={t("review.birthDate")} value={draftSnapshot?.draft?.birthDate || state.applicantInfo.birthDate} />
            <ReviewRow label={t("review.organization")} value={draftSnapshot?.draft?.organization || state.applicantInfo.organization} />
            <ReviewRow label={t("review.instagramId")} value={draftSnapshot?.draft?.instagramId || state.applicantInfo.instagramId || t("review.instagramIdDefault")} />
            <ReviewRow label={t("review.introduction")} value={draftSnapshot?.draft?.introduction || state.applicantInfo.introduction} />
            <ReviewRow label={t("review.weightClass")} value={draftSnapshot?.draft?.weightClass || state.applicantInfo.weightClass} />
            <ReviewRow
              label={t("review.file")}
              value={draftSnapshot?.documentFile?.original_filename || state.uploadedFileMeta.originalFilename}
            />
            <ReviewRow
              label={t("review.audioFile")}
              value={draftSnapshot?.audioFile?.original_filename || state.uploadedAudioFileMeta.originalFilename}
            />
            <ReviewRow label={t("review.fee")} value={t("review.testPayment")} />
            <ReviewRow
              label={t("review.consentItems")}
              value={[
                reviewConsents.privacy ? t("review.privacy") : null,
                reviewConsents.terms ? t("review.terms") : null,
                reviewConsents.refund ? t("review.refund") : null,
                reviewConsents.marketing ? t("review.marketing") : null,
                reviewConsents.photoVideo ? t("review.photoVideo") : null,
              ]
                .filter(Boolean)
                .join(", ")}
            />
          </div>

          <NoticeBox title={t("review.noticeTitle")}>
            <ul className="site-list">
              <li>{t("review.notice1")}</li>
              <li>{t("review.notice2")}</li>
              <li>{t("review.notice3")}</li>
            </ul>
            <Link className="site-notice__link" to="/apply/guide">
              {t("common.viewApplyGuide")}
            </Link>
          </NoticeBox>

          <div className="site-payment-methods">
            <h2 className="site-payment-methods__title">{t("review.paymentMethod")}</h2>
            <div className="site-chip-group">
              <button
                className={`site-chip ${state.paymentMethod === "widget" ? "site-chip--active" : ""}`}
                type="button"
                onClick={() => dispatch({ type: "SET_PAYMENT_METHOD", value: "widget" })}
              >
                {t("review.widgetMethod")}
              </button>
              <button
                className={`site-chip ${state.paymentMethod === "payment" ? "site-chip--active" : ""}`}
                type="button"
                onClick={() => dispatch({ type: "SET_PAYMENT_METHOD", value: "payment" })}
              >
                {t("review.paymentMethodLabel")}
              </button>
              <button
                className={`site-chip ${state.paymentMethod === "brandpay" ? "site-chip--active" : ""}`}
                type="button"
                onClick={() => dispatch({ type: "SET_PAYMENT_METHOD", value: "brandpay" })}
              >
                {t("review.brandpayMethod")}
              </button>
            </div>
          </div>

          <div className="site-inline-actions">
            <Button variant="ghost" onClick={() => navigate("/apply/consent")}>{t("review.previous")}</Button>
            <Button onClick={handleProceedPayment} disabled={isPreparingPayment}>
              {isPreparingPayment ? t("review.preparing") : t("review.proceed")}
            </Button>
          </div>

          {errorMessage ? <p className="site-error-message">{errorMessage}</p> : null}
        </div>
      </section>
    </PageShell>
  );
}
