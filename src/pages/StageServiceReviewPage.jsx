import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/common/Button";
import { NoticeBox } from "../components/common/NoticeBox";
import { PageShell } from "../components/layout/PageShell";
import { useLanguage } from "../context/LanguageContext";
import { useStageServiceFlow } from "../context/StageServiceFlowContext";
import {
  formatStageServiceAmount,
  getHairOptionChoices,
  getHairOptionalChoices,
  getStageServiceTitle,
  getStageVideoAdditionalDisciplineMeta,
  getVideoTypeOptions,
} from "../data/stageServiceConfig";
import {
  createStageServiceOrder,
  getStageServiceDraft,
} from "../lib/applicationApi";
import { buildStageServiceDetailPath } from "../lib/stageServiceFlowRoutes";
import { stageServiceFlowSteps } from "../lib/stageServiceFlowAccess";

function ReviewRow({ label, value }) {
  return (
    <div className="site-review-row">
      <span>{label}</span>
      <strong>{value || "-"}</strong>
    </div>
  );
}

export function StageServiceReviewPage() {
  const navigate = useNavigate();
  const { state, dispatch } = useStageServiceFlow();
  const { t, language } = useLanguage();
  const [draftSnapshot, setDraftSnapshot] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isPreparingPayment, setIsPreparingPayment] = useState(false);

  const detailPath = buildStageServiceDetailPath({
    serviceKey: state.serviceKey,
    name: state.applicantInfo.name,
    email: state.applicantInfo.email,
    phone: state.applicantInfo.phone,
  });
  const paymentPathMap = {
    widget: "/stage-services/widget/checkout",
    payment: "/stage-services/payment/checkout",
    brandpay: "/stage-services/brandpay/checkout",
  };
  const videoTypeLabel =
    getVideoTypeOptions().find((option) => option.value === (draftSnapshot?.draft?.videoType || state.formData.videoType))
      ?.label || "-";
  const videoAdditionalOptionLabel =
    getStageVideoAdditionalDisciplineMeta(
      draftSnapshot?.draft?.videoAdditionalDiscipline || state.formData.videoAdditionalDiscipline,
      draftSnapshot?.draft?.videoType || state.formData.videoType,
    )?.label ||
    draftSnapshot?.draft?.videoAdditionalDiscipline ||
    state.formData.videoAdditionalDiscipline ||
    "-";
  const hairOptionLabel =
    getHairOptionChoices().find((option) => option.value === (draftSnapshot?.draft?.hairOption || state.formData.hairOption))
      ?.label || "-";
  const hairOptionalLabel =
    getHairOptionalChoices({
      hairOptionValue: draftSnapshot?.draft?.hairOption || state.formData.hairOption,
      hasAdditionalDiscipline: Boolean(
        draftSnapshot?.draft?.hairAdditionalDiscipline || state.formData.hairAdditionalDiscipline,
      ),
    }).find((option) => option.value === (draftSnapshot?.draft?.hairOptionalOption || state.formData.hairOptionalOption))
      ?.label || "-";

  useEffect(() => {
    async function fetchDraft() {
      if (!state.draftId) {
        return;
      }

      try {
        const json = await getStageServiceDraft(state.draftId);
        setDraftSnapshot(json);
        dispatch({
          type: "SET_LINKED_APPLICATION",
          value: json.linkedApplication || { applicationNumber: "", discipline: "" },
        });
        dispatch({
          type: "SET_TOTAL_AMOUNT",
          value: json.draft?.totalAmount || 0,
        });
      } catch (error) {
        setErrorMessage(error.message || t("stageService.loadDraftError"));
      }
    }

    fetchDraft();
  }, [dispatch, state.draftId, t]);

  async function handleProceedPayment() {
    if (!state.draftId) {
      navigate(detailPath, { state: { source: "review" } });
      return;
    }

    setIsPreparingPayment(true);
    setErrorMessage("");

    try {
      let orderId = state.orderId;

      if (!orderId) {
        const orderResponse = await createStageServiceOrder({
          draftId: state.draftId,
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
        value: stageServiceFlowSteps.CHECKOUT,
      });

      navigate(`${paymentPathMap[state.paymentMethod]}?${params.toString()}`);
    } catch (error) {
      setErrorMessage(error.message || t("stageService.prepareOrderError"));
    } finally {
      setIsPreparingPayment(false);
    }
  }

  const reviewDraft = draftSnapshot?.draft;

  return (
    <PageShell>
      <section className="site-page site-page--narrow">
        <div className="site-review-card site-stage-service-review-card">
          <div className="site-review-card__header">
            <p className="site-kicker">{t("common.kickerReview")}</p>
            <h1>{t("stageService.reviewTitle")}</h1>
            <p>{t("stageService.reviewDescription")}</p>
          </div>

          <div className="site-review-grid">
            <ReviewRow label={t("stageService.serviceType")} value={getStageServiceTitle(state.serviceKey)} />
            <ReviewRow label={t("review.name")} value={reviewDraft?.name || state.applicantInfo.name} />
            <ReviewRow label={t("review.phone")} value={reviewDraft?.phone || state.applicantInfo.phone} />
            <ReviewRow label={t("review.email")} value={reviewDraft?.email || state.applicantInfo.email} />
            <ReviewRow
              label={t("stageService.linkedApplication")}
              value={draftSnapshot?.linkedApplication?.applicationNumber || state.linkedApplication.applicationNumber}
            />
            <ReviewRow
              label={t("stageService.linkedDiscipline")}
              value={draftSnapshot?.linkedApplication?.discipline || state.linkedApplication.discipline}
            />
            {state.serviceKey === "stage-photo" ? (
              <>
                <ReviewRow
                  label={t("stageService.photoAdditionalFlag")}
                  value={reviewDraft?.photoHasAdditionalDiscipline || state.formData.photoHasAdditionalDiscipline}
                />
                <ReviewRow
                  label={t("stageService.additionalDiscipline")}
                  value={reviewDraft?.photoAdditionalDiscipline || state.formData.photoAdditionalDiscipline}
                />
              </>
            ) : null}
            {state.serviceKey === "stage-video" ? (
              <>
                <ReviewRow label={t("stageService.videoType")} value={videoTypeLabel} />
                <ReviewRow
                  label={t("stageService.additionalDiscipline")}
                  value={videoAdditionalOptionLabel}
                />
              </>
            ) : null}
            {state.serviceKey === "hair-makeup" ? (
              <>
                <ReviewRow
                  label={t("stageService.participantDiscipline")}
                  value={reviewDraft?.hairParticipantDiscipline || state.formData.hairParticipantDiscipline}
                />
                <ReviewRow label={t("stageService.hairOption")} value={hairOptionLabel} />
                <ReviewRow
                  label={t("stageService.additionalDiscipline")}
                  value={reviewDraft?.hairAdditionalDiscipline || state.formData.hairAdditionalDiscipline}
                />
                <ReviewRow label={t("stageService.optionalOption")} value={hairOptionalLabel} />
              </>
            ) : null}
            <ReviewRow
              label={t("stageService.totalAmount")}
              value={formatStageServiceAmount(reviewDraft?.totalAmount || state.totalAmount, language)}
            />
          </div>

          <NoticeBox title={t("stageService.reviewNoticeTitle")}>
            <ul className="site-list">
              <li>{t("stageService.reviewNotice1")}</li>
              <li>{t("stageService.reviewNotice2")}</li>
              <li>{t("stageService.reviewNotice3")}</li>
            </ul>
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
            <Button variant="ghost" onClick={() => navigate(detailPath, { state: { source: "review" } })}>
              {t("review.previous")}
            </Button>
            <Button onClick={handleProceedPayment} disabled={isPreparingPayment}>
              {isPreparingPayment ? t("stageService.preparing") : t("stageService.proceed")}
            </Button>
          </div>

          {errorMessage ? <p className="site-error-message">{errorMessage}</p> : null}
        </div>
      </section>
    </PageShell>
  );
}
