import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/common/Button";
import { NoticeBox } from "../components/common/NoticeBox";
import { PageShell } from "../components/layout/PageShell";
import { useLanguage } from "../context/LanguageContext";
import { useStageServiceFlow } from "../context/StageServiceFlowContext";
import {
  formatStageServiceAmount,
  getHairAdditionalOptionLabels,
  getHairOptionChoices,
  getStagePhotoPackage,
  getStageServiceDisciplineLabel,
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
  const { locale, t } = useLanguage();
  const [draftSnapshot, setDraftSnapshot] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [orderMessage, setOrderMessage] = useState("");
  const [isPreparingPayment, setIsPreparingPayment] = useState(false);

  const detailPath = buildStageServiceDetailPath({
    serviceKey: state.serviceKey,
    name: state.applicantInfo.name,
    email: state.applicantInfo.email,
    phone: state.applicantInfo.phone,
  });
  const reviewDraft = draftSnapshot?.draft;
  const videoTypeLabel =
    getVideoTypeOptions(locale).find((option) => option.value === (draftSnapshot?.draft?.videoType || state.formData.videoType))
      ?.label || "-";
  const videoAdditionalOptionLabel =
    getStageVideoAdditionalDisciplineMeta(
      draftSnapshot?.draft?.videoAdditionalDiscipline || state.formData.videoAdditionalDiscipline,
      draftSnapshot?.draft?.videoType || state.formData.videoType,
      locale,
    )?.label ||
    getStageServiceDisciplineLabel(
      draftSnapshot?.draft?.videoAdditionalDiscipline || state.formData.videoAdditionalDiscipline,
      locale,
    ) ||
    "-";
  const hairOptionLabel =
    getHairOptionChoices(locale).find((option) => option.value === (draftSnapshot?.draft?.hairOption || state.formData.hairOption))
      ?.label || "-";
  const hairAdditionalOptionLabels = getHairAdditionalOptionLabels({
    hairOptionValue: draftSnapshot?.draft?.hairOption || state.formData.hairOption,
    hairBodyMakeup: draftSnapshot?.draft?.hairBodyMakeup ?? state.formData.hairBodyMakeup,
    hairPiece: draftSnapshot?.draft?.hairPiece ?? state.formData.hairPiece,
    hairRetouchCount: draftSnapshot?.draft?.hairRetouchCount ?? state.formData.hairRetouchCount,
    locale,
  });
  const reviewLinkedApplications =
    draftSnapshot?.linkedApplications?.length
      ? draftSnapshot.linkedApplications
      : reviewDraft?.linkedApplications?.length
        ? reviewDraft.linkedApplications
        : state.linkedApplications.length
          ? state.linkedApplications
          : state.linkedApplication.applicationNumber
            ? [state.linkedApplication]
            : [];
  const reviewLinkedApplicationNumbers = reviewLinkedApplications
    .map((application) => application.applicationNumber)
    .filter(Boolean)
    .join(", ");
  const reviewLinkedDisciplines = reviewLinkedApplications
    .map((application) => application.discipline)
    .filter(Boolean)
    .join(", ");
  const stagePhotoPackage =
    state.serviceKey === "stage-photo"
      ? getStagePhotoPackage(reviewLinkedApplications.length)
      : null;

  useEffect(() => {
    async function fetchDraft() {
      if (!state.draftId) {
        return;
      }

      try {
        const json = await getStageServiceDraft(state.draftId);
        setDraftSnapshot(json);
        dispatch({
          type: "SET_LINKED_APPLICATIONS",
          value: json.linkedApplications || (json.linkedApplication ? [json.linkedApplication] : []),
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

  useEffect(() => {
    if (state.paymentMethod !== "payment") {
      dispatch({ type: "SET_PAYMENT_METHOD", value: "payment" });
    }
  }, [dispatch, state.paymentMethod]);

  async function prepareOrder({ replacePendingOrder = false } = {}) {
    if (!state.draftId) {
      navigate(detailPath, { state: { source: "review" } });
      return null;
    }

    const orderResponse = await createStageServiceOrder({
      draftId: state.draftId,
      replacePendingOrder,
    });
    const order = orderResponse.order;

    dispatch({
      type: "SET_ORDER",
      payload: { orderId: order.orderId },
    });

    return order;
  }

  async function handleCreateOrder() {
    setIsPreparingPayment(true);
    setErrorMessage("");
    setOrderMessage("");

    try {
      const order = await prepareOrder({ replacePendingOrder: true });

      if (!order) {
        return;
      }

      if (order.status !== "READY") {
        setErrorMessage(
          locale === "ko"
            ? "완료되었거나 처리 중인 주문이 있습니다. 신청 조회에서 결제 상태를 확인해 주세요."
            : "An existing order is already completed or being processed. Please check its status in Application Lookup."
        );
        return;
      }

      setOrderMessage(
        order.orderId === state.orderId
          ? locale === "ko"
            ? "현재 유효한 결제 주문이 있습니다. 결제 진행하기를 눌러 결제를 계속해 주세요."
            : "A valid payment order already exists. Select Proceed to Payment to continue."
          : locale === "ko"
            ? "새 결제 주문이 생성되었습니다. 20분 안에 결제를 진행해 주세요."
            : "A new payment order has been created. Complete payment within 20 minutes."
      );
    } catch (error) {
      setErrorMessage(error.message || t("stageService.prepareOrderError"));
    } finally {
      setIsPreparingPayment(false);
    }
  }

  async function handleProceedPayment() {
    setIsPreparingPayment(true);
    setErrorMessage("");
    setOrderMessage("");

    try {
      const order = await prepareOrder();

      if (!order) {
        return;
      }

      if (order.status !== "READY") {
        setErrorMessage(
          locale === "ko"
            ? "완료되었거나 처리 중인 주문이 있습니다. 신청 조회에서 결제 상태를 확인해 주세요."
            : "An existing order is already completed or being processed. Please check its status in Application Lookup."
        );
        return;
      }

      const params = new URLSearchParams({
        draftId: state.draftId,
        orderId: order.orderId,
      });

      dispatch({
        type: "SET_FLOW_STEP",
        value: stageServiceFlowSteps.CHECKOUT,
      });

      navigate(`/stage-services/payment/checkout?${params.toString()}`);
    } catch (error) {
      setErrorMessage(error.message || t("stageService.prepareOrderError"));
    } finally {
      setIsPreparingPayment(false);
    }
  }

  return (
    <PageShell>
      <section className="site-page site-page--stage-service">
        <div className="site-review-card site-stage-service-review-card">
          <div className="site-review-card__header">
            <p className="site-kicker">{t("common.kickerReview")}</p>
            <h1>{t("stageService.reviewTitle")}</h1>
            <p>{t("stageService.reviewDescription")}</p>
          </div>

          <div className="site-review-grid">
            <ReviewRow label={t("stageService.serviceType")} value={getStageServiceTitle(state.serviceKey, locale)} />
            <ReviewRow label={t("review.name")} value={reviewDraft?.name || state.applicantInfo.name} />
            <ReviewRow label={t("review.phone")} value={reviewDraft?.phone || state.applicantInfo.phone} />
            <ReviewRow label={t("review.email")} value={reviewDraft?.email || state.applicantInfo.email} />
            <ReviewRow
              label={state.serviceKey === "hair-makeup" ? "선택 신청 번호" : t("stageService.linkedApplication")}
              value={reviewLinkedApplicationNumbers}
            />
            <ReviewRow
              label={state.serviceKey === "hair-makeup" ? "신청한 종목 내역" : t("stageService.linkedDiscipline")}
              value={reviewLinkedDisciplines}
            />
            {state.serviceKey === "stage-photo" ? (
              <ReviewRow
                label="사진 패키지"
                value={stagePhotoPackage ? `${stagePhotoPackage.disciplineCount}종목 / ${stagePhotoPackage.photoCount}장` : "-"}
              />
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
                <ReviewRow label={t("stageService.hairOption")} value={hairOptionLabel} />
                <ReviewRow
                  label={locale === "ko" ? "추가 구성" : "Additional services"}
                  value={hairAdditionalOptionLabels.join(", ") || "-"}
                />
              </>
            ) : null}
            <ReviewRow
              label={t("stageService.totalAmount")}
              value={formatStageServiceAmount(reviewDraft?.totalAmount || state.totalAmount, locale)}
            />
          </div>

          <NoticeBox title={t("stageService.reviewNoticeTitle")}>
            <ul className="site-list">
              <li>{t("stageService.reviewNotice1")}</li>
              <li>{t("stageService.reviewNotice2")}</li>
              <li>{t("stageService.reviewNotice3")}</li>
            </ul>
          </NoticeBox>

          <div className="site-review-order-actions">
            <Button variant="ghost" onClick={handleCreateOrder} disabled={isPreparingPayment}>
              {isPreparingPayment ? t("stageService.preparing") : "새 주문 생성하기"}
            </Button>
            <div className="site-review-order-actions__primary">
              <Button variant="ghost" onClick={() => navigate(detailPath, { state: { source: "review" } })}>
                {t("review.previous")}
              </Button>
              <Button onClick={handleProceedPayment} disabled={isPreparingPayment}>
                {isPreparingPayment ? t("stageService.preparing") : t("stageService.proceed")}
              </Button>
            </div>
          </div>

          {orderMessage ? <p className="site-review-order-message">{orderMessage}</p> : null}
          {errorMessage ? <p className="site-error-message">{errorMessage}</p> : null}
        </div>
      </section>
    </PageShell>
  );
}
