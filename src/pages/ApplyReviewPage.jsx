import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../components/common/Button";
import { NoticeBox } from "../components/common/NoticeBox";
import { PageShell } from "../components/layout/PageShell";
import { useApplicationFlow } from "../context/ApplicationFlowContext";
import { useLanguage } from "../context/LanguageContext";
import {
  getCanonicalApplicationDisciplineTitle,
  isCommonApplicationDiscipline,
} from "../data/applicationDisciplines";
import {
  formatApplicationEntryFee,
  getApplicationEntryFeePricing,
} from "../data/applicationEntryFees";
import { applicationFlowSteps } from "../lib/applicationFlowAccess";
import {
  formatStoredSnsIdentity,
  serializeDetailedSnsIdentity,
} from "../lib/applicationSns";
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

function PricingReviewRow({ pricing, fallbackAmount, locale }) {
  const amount = Number(pricing?.amount ?? fallbackAmount);
  const originalAmount = Number(pricing?.originalAmount || 0);
  const isDiscounted = Boolean(pricing?.isDiscounted && originalAmount > amount);
  const label = pricing?.isAdditional
    ? locale === "ko"
      ? "추가 종목 참가비"
      : "Additional discipline fee"
    : locale === "ko"
      ? "참가비"
      : "Entry fee";
  const description = pricing?.isAdditional
    ? locale === "ko"
      ? `결제 완료 종목 ${pricing.completedApplicationCount}건 기준`
      : `Based on ${pricing.completedApplicationCount} completed discipline(s)`
    : pricing?.periodLabel
      ? `${locale === "ko" ? pricing.periodLabel : pricing.periodLabelEn || pricing.periodLabel} ${
          locale === "ko" ? "참가비" : "entry fee"
        }`
      : "";

  return (
    <div className="site-review-row site-review-row--pricing">
      <span>
        {label}
        {description ? <small>{description}</small> : null}
      </span>
      <strong>
        {isDiscounted ? <del>{formatApplicationEntryFee(originalAmount, locale)}</del> : null}
        <b>{formatApplicationEntryFee(amount, locale)}</b>
      </strong>
    </div>
  );
}

export function ApplyReviewPage() {
  const navigate = useNavigate();
  const { state, dispatch } = useApplicationFlow();
  const { locale, t } = useLanguage();
  const detailPath = buildApplyDetailPath(state.selection);
  const [draftSnapshot, setDraftSnapshot] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [orderMessage, setOrderMessage] = useState("");
  const [isPreparingPayment, setIsPreparingPayment] = useState(false);

  const requiredConsentsAccepted = requiredConsentKeys.every((key) => state.consents[key]);
  const reviewDraft = draftSnapshot?.draft;
  const reviewConsents = draftSnapshot?.consents || state.consents;
  const selectedImageKey = reviewDraft?.imageKey || state.selection.imageKey;
  const selectedDiscipline = getCanonicalApplicationDisciplineTitle({
    imageKey: selectedImageKey,
    discipline: reviewDraft?.discipline || state.selection.discipline,
  });
  const isCommonDiscipline = isCommonApplicationDiscipline({
    imageKey: selectedImageKey,
    discipline: selectedDiscipline,
  });
  const participantGender = reviewDraft?.participantGender || state.selection.participantGender;
  const fallbackEntryFeePricing = getApplicationEntryFeePricing(selectedImageKey);
  const entryFeePricing = draftSnapshot?.pricing || fallbackEntryFeePricing;
  const entryFeeAmount = entryFeePricing.amount;
  const isRegistrationOpen = entryFeePricing.isRegistrationOpen !== false;
  const snsIdentityValue =
    reviewDraft?.instagramId ||
    serializeDetailedSnsIdentity({
      platform: state.applicantInfo.snsPlatform,
      customPlatform: state.applicantInfo.snsOtherPlatform,
      id: state.applicantInfo.snsId,
    });
  const documentFilenames = draftSnapshot?.documentFiles?.length
    ? draftSnapshot.documentFiles.map((file) => file.original_filename).join(", ")
    : state.uploadedFileMetas?.length
      ? state.uploadedFileMetas.map((file) => file.originalFilename).join(", ")
      : state.uploadedFileMeta.originalFilename;

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

  useEffect(() => {
    if (state.paymentMethod !== "payment") {
      dispatch({ type: "SET_PAYMENT_METHOD", value: "payment" });
    }
  }, [dispatch, state.paymentMethod]);

  async function prepareOrder({ replacePendingOrder = false } = {}) {
    if (!state.draftId) {
      navigate(detailPath);
      return null;
    }

    const orderResponse = await createOrder({
      draftId: state.draftId,
      orderName: t("review.orderName"),
      amount: entryFeeAmount,
      customerName: state.applicantInfo.name,
      customerEmail: state.applicantInfo.email,
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
    if (!isRegistrationOpen) {
      setErrorMessage(
        locale === "ko"
          ? "현재 대회 참가 접수 기간이 아닙니다. 접수 기간을 확인해 주세요."
          : "Competition registration is not currently open. Please check the registration period."
      );
      return;
    }

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
      setErrorMessage(error.message || t("review.preparePaymentError"));
    } finally {
      setIsPreparingPayment(false);
    }
  }

  async function handleProceedPayment() {
    if (!isRegistrationOpen) {
      setErrorMessage(
        locale === "ko"
          ? "현재 대회 참가 접수 기간이 아닙니다. 접수 기간을 확인해 주세요."
          : "Competition registration is not currently open. Please check the registration period."
      );
      return;
    }

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
        value: applicationFlowSteps.CHECKOUT,
      });
      navigate(`/payment/checkout?${params.toString()}`);
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
            <ReviewRow label={t("review.discipline")} value={selectedDiscipline} />
            {isCommonDiscipline ? (
              <ReviewRow
                label={locale === "ko" ? "성별" : "Gender"}
                value={
                  participantGender === "female"
                    ? locale === "ko"
                      ? "여"
                      : "Female"
                    : participantGender === "male"
                      ? locale === "ko"
                        ? "남"
                        : "Male"
                      : "-"
                }
              />
            ) : null}
            <ReviewRow label={t("review.name")} value={draftSnapshot?.draft?.name || state.applicantInfo.name} />
            <ReviewRow label={t("review.phone")} value={draftSnapshot?.draft?.phone || state.applicantInfo.phone} />
            <ReviewRow label={t("review.email")} value={draftSnapshot?.draft?.email || state.applicantInfo.email} />
            <ReviewRow label={t("review.birthDate")} value={draftSnapshot?.draft?.birthDate || state.applicantInfo.birthDate} />
            <ReviewRow label={t("review.organization")} value={draftSnapshot?.draft?.organization || state.applicantInfo.organization} />
            <ReviewRow
              label={t("review.snsId")}
              value={formatStoredSnsIdentity(snsIdentityValue, locale, t("review.snsIdDefault"))}
            />
            <ReviewRow label={t("review.introduction")} value={draftSnapshot?.draft?.introduction || state.applicantInfo.introduction} />
            <ReviewRow label={t("review.weightClass")} value={draftSnapshot?.draft?.weightClass || state.applicantInfo.weightClass} />
            <ReviewRow
              label={t("review.file")}
              value={documentFilenames}
            />
            <PricingReviewRow
              pricing={entryFeePricing}
              fallbackAmount={entryFeeAmount}
              locale={locale}
            />
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

          <div className="site-review-order-actions">
            <Button variant="ghost" onClick={handleCreateOrder} disabled={!isRegistrationOpen || isPreparingPayment}>
              {isPreparingPayment ? t("review.preparing") : "새 주문 생성하기"}
            </Button>
            <div className="site-review-order-actions__primary">
              <Button variant="ghost" onClick={() => navigate("/apply/consent")}>{t("review.previous")}</Button>
              <Button onClick={handleProceedPayment} disabled={!isRegistrationOpen || isPreparingPayment}>
                {isPreparingPayment ? t("review.preparing") : t("review.proceed")}
              </Button>
            </div>
          </div>

          {!isRegistrationOpen ? (
            <p className="site-error-message">
              {locale === "ko"
                ? "현재 대회 참가 접수 기간이 아닙니다. 실제 결제는 접수 기간에만 가능합니다."
                : "Registration is closed. Live payment is available only during the registration period."}
            </p>
          ) : null}
          {orderMessage ? <p className="site-review-order-message">{orderMessage}</p> : null}
          {errorMessage ? <p className="site-error-message">{errorMessage}</p> : null}
        </div>
      </section>
    </PageShell>
  );
}
