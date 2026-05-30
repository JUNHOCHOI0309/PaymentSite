import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "../components/common/Button";
import { Input } from "../components/common/Input";
import { NoticeBox } from "../components/common/NoticeBox";
import { PageShell } from "../components/layout/PageShell";
import { useLanguage } from "../context/LanguageContext";
import { useStageServiceFlow } from "../context/StageServiceFlowContext";
import {
  calculateStageServiceTotalAmount,
  formatStageServiceAmount,
  getHairOptionChoices,
  getHairOptionalChoices,
  getStageServiceByKey,
  getStageServiceDisciplineOptions,
  getStageServiceTitle,
  getStageVideoAdditionalDisciplineChoices,
  getVideoTypeOptions,
} from "../data/stageServiceConfig";
import {
  createStageServiceDraft,
  updateStageServiceDraft,
} from "../lib/applicationApi";
import { buildStageServiceDetailPath } from "../lib/stageServiceFlowRoutes";
import { stageServiceFlowSteps } from "../lib/stageServiceFlowAccess";

function formatPhoneNumber(value) {
  const digits = value.replace(/\D/g, "").slice(0, 11);

  if (digits.length <= 3) {
    return digits;
  }

  if (digits.length <= 7) {
    return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  }

  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

function getInitialFieldErrors() {
  return {
    name: "",
    phone: "",
    email: "",
    photoHasAdditionalDiscipline: "",
    photoAdditionalDiscipline: "",
    videoType: "",
    hairParticipantDiscipline: "",
    hairOption: "",
  };
}

export function StageServiceDetailPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { state, dispatch, isHydrated } = useStageServiceFlow();
  const { t, language } = useLanguage();
  const handledLocationKeyRef = useRef("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState(getInitialFieldErrors);

  const serviceKey = searchParams.get("service") || "";
  const serviceConfig = getStageServiceByKey(serviceKey);
  const prefillName = searchParams.get("name") || "";
  const prefillEmail = searchParams.get("email") || "";
  const prefillPhone = searchParams.get("phone") || "";
  const disciplineOptions = getStageServiceDisciplineOptions();
  const videoTypeOptions = getVideoTypeOptions();
  const hairOptionChoices = getHairOptionChoices();
  const hasPhotoAdditionalDiscipline = state.formData.photoHasAdditionalDiscipline === "O";
  const hairHasAdditionalDiscipline = Boolean(state.formData.hairAdditionalDiscipline);
  const hairOptionalChoices = getHairOptionalChoices({
    hairOptionValue: state.formData.hairOption,
    hasAdditionalDiscipline: hairHasAdditionalDiscipline,
  });
  const videoAdditionalChoices = getStageVideoAdditionalDisciplineChoices();
  const totalAmount = useMemo(
    () =>
      calculateStageServiceTotalAmount({
        serviceKey,
        photoHasAdditionalDiscipline: state.formData.photoHasAdditionalDiscipline,
        videoType: state.formData.videoType,
        videoAdditionalDiscipline: state.formData.videoAdditionalDiscipline,
        hairOption: state.formData.hairOption,
        hairOptionalOption: state.formData.hairOptionalOption,
      }),
    [
      serviceKey,
      state.formData.photoHasAdditionalDiscipline,
      state.formData.videoType,
      state.formData.videoAdditionalDiscipline,
      state.formData.hairOption,
      state.formData.hairOptionalOption,
    ],
  );

  useEffect(() => {
    if (!serviceConfig) {
      navigate("/apply/stage-services", { replace: true });
    }
  }, [navigate, serviceConfig]);

  useEffect(() => {
    if (!isHydrated || !serviceConfig) {
      return;
    }

    const navigationSource = location.state?.source;
    const shouldHandleNavigationSource =
      Boolean(navigationSource) && handledLocationKeyRef.current !== location.key;

    if (shouldHandleNavigationSource) {
      handledLocationKeyRef.current = location.key;

      if (navigationSource === "review" && state.serviceKey === serviceKey) {
        return;
      }

      if (navigationSource === "select") {
        dispatch({ type: "RESET_STAGE_SERVICE_FLOW" });
        dispatch({ type: "SET_SERVICE_KEY", value: serviceKey });
        if (prefillName) {
          dispatch({ type: "SET_APPLICANT_FIELD", field: "name", value: prefillName });
        }
        if (prefillEmail) {
          dispatch({ type: "SET_APPLICANT_FIELD", field: "email", value: prefillEmail });
        }
        if (prefillPhone) {
          dispatch({
            type: "SET_APPLICANT_FIELD",
            field: "phone",
            value: formatPhoneNumber(prefillPhone),
          });
        }
        setFieldErrors(getInitialFieldErrors());
        setErrorMessage("");
        return;
      }
    }

    if (state.serviceKey !== serviceKey) {
      dispatch({ type: "RESET_STAGE_SERVICE_FLOW" });
      dispatch({ type: "SET_SERVICE_KEY", value: serviceKey });
      if (prefillName) {
        dispatch({ type: "SET_APPLICANT_FIELD", field: "name", value: prefillName });
      }
      if (prefillEmail) {
        dispatch({ type: "SET_APPLICANT_FIELD", field: "email", value: prefillEmail });
      }
      if (prefillPhone) {
        dispatch({
          type: "SET_APPLICANT_FIELD",
          field: "phone",
          value: formatPhoneNumber(prefillPhone),
        });
      }
      setFieldErrors(getInitialFieldErrors());
      setErrorMessage("");
    }
  }, [
    dispatch,
    isHydrated,
    location.key,
    location.state,
    prefillEmail,
    prefillName,
    prefillPhone,
    serviceConfig,
    serviceKey,
    state.serviceKey,
  ]);

  useEffect(() => {
    if (!hasPhotoAdditionalDiscipline && state.formData.photoAdditionalDiscipline) {
      dispatch({ type: "SET_FORM_FIELD", field: "photoAdditionalDiscipline", value: "" });
    }
  }, [dispatch, hasPhotoAdditionalDiscipline, state.formData.photoAdditionalDiscipline]);

  useEffect(() => {
    const allowedOptionalValues = new Set(hairOptionalChoices.map((option) => option.value));

    if (
      state.formData.hairOptionalOption &&
      !allowedOptionalValues.has(state.formData.hairOptionalOption)
    ) {
      dispatch({ type: "SET_FORM_FIELD", field: "hairOptionalOption", value: "" });
    }
  }, [dispatch, hairOptionalChoices, state.formData.hairOptionalOption]);

  function validateField(field, value) {
    const normalizedValue = typeof value === "string" ? value.trim() : value;

    switch (field) {
      case "name":
        return normalizedValue ? "" : t("stageService.nameError");
      case "phone":
        return String(value || "").replace(/\D/g, "").length === 11
          ? ""
          : t("stageService.phoneError");
      case "email":
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(normalizedValue || ""))
          ? ""
          : t("stageService.emailError");
      case "photoHasAdditionalDiscipline":
        return normalizedValue ? "" : t("stageService.photoAdditionalFlagError");
      case "photoAdditionalDiscipline":
        return hasPhotoAdditionalDiscipline && !normalizedValue
          ? t("stageService.additionalDisciplineError")
          : "";
      case "videoType":
        return normalizedValue ? "" : t("stageService.videoTypeError");
      case "hairParticipantDiscipline":
        return normalizedValue ? "" : t("stageService.participantDisciplineError");
      case "hairOption":
        return normalizedValue ? "" : t("stageService.hairOptionError");
      default:
        return "";
    }
  }

  function validateForm() {
    const nextErrors = {
      name: validateField("name", state.applicantInfo.name),
      phone: validateField("phone", state.applicantInfo.phone),
      email: validateField("email", state.applicantInfo.email),
      photoHasAdditionalDiscipline:
        serviceKey === "stage-photo"
          ? validateField("photoHasAdditionalDiscipline", state.formData.photoHasAdditionalDiscipline)
          : "",
      photoAdditionalDiscipline:
        serviceKey === "stage-photo"
          ? validateField("photoAdditionalDiscipline", state.formData.photoAdditionalDiscipline)
          : "",
      videoType:
        serviceKey === "stage-video" ? validateField("videoType", state.formData.videoType) : "",
      hairParticipantDiscipline:
        serviceKey === "hair-makeup"
          ? validateField("hairParticipantDiscipline", state.formData.hairParticipantDiscipline)
          : "",
      hairOption:
        serviceKey === "hair-makeup" ? validateField("hairOption", state.formData.hairOption) : "",
    };

    setFieldErrors(nextErrors);
    return !Object.values(nextErrors).some(Boolean);
  }

  function setApplicantField(field) {
    return (event) => {
      const nextValue = field === "phone" ? formatPhoneNumber(event.target.value) : event.target.value;
      dispatch({ type: "SET_APPLICANT_FIELD", field, value: nextValue });
      setFieldErrors((current) => ({
        ...current,
        [field]: validateField(field, nextValue),
      }));
    };
  }

  function setFormField(field) {
    return (event) => {
      const nextValue = event.target.value;
      dispatch({ type: "SET_FORM_FIELD", field, value: nextValue });
      if (field in fieldErrors) {
        setFieldErrors((current) => ({
          ...current,
          [field]: validateField(field, nextValue),
        }));
      }
      setErrorMessage("");
    };
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");

    const payload = {
      serviceType: serviceKey,
      paymentMethod: state.paymentMethod,
      name: state.applicantInfo.name,
      phone: state.applicantInfo.phone,
      email: state.applicantInfo.email,
      photoHasAdditionalDiscipline: state.formData.photoHasAdditionalDiscipline,
      photoAdditionalDiscipline: state.formData.photoAdditionalDiscipline,
      videoType: state.formData.videoType,
      videoAdditionalDiscipline: state.formData.videoAdditionalDiscipline,
      hairParticipantDiscipline: state.formData.hairParticipantDiscipline,
      hairOption: state.formData.hairOption,
      hairAdditionalDiscipline: state.formData.hairAdditionalDiscipline,
      hairOptionalOption: state.formData.hairOptionalOption,
    };

    try {
      const json = state.draftId
        ? await updateStageServiceDraft(state.draftId, payload)
        : await createStageServiceDraft(payload);

      dispatch({ type: "SET_DRAFT_ID", value: json.draft.draftId });
      dispatch({ type: "SET_ORDER", payload: { orderId: null } });
      dispatch({ type: "SET_LINKED_APPLICATION", value: json.linkedApplication || { applicationNumber: "", discipline: "" } });
      dispatch({ type: "SET_TOTAL_AMOUNT", value: json.draft.totalAmount || totalAmount });
      dispatch({ type: "SET_FLOW_STEP", value: stageServiceFlowSteps.REVIEW });
      navigate("/apply/stage-services/review");
    } catch (error) {
      setErrorMessage(error.message || t("stageService.saveDraftError"));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!serviceConfig) {
    return null;
  }

  return (
    <PageShell>
      <section className="site-page site-page--narrow">
        <div className="site-apply-detail site-stage-service-detail">
          <div className="site-apply-detail__layout">
            <aside className="site-apply-detail__summary site-stage-service-detail__summary">
              <Button
                className="site-stage-service-detail__back-button"
                variant="ghost"
                onClick={() => navigate("/apply/stage-services")}
              >
                {t("stageService.backToSelect")}
              </Button>
              <h1>{getStageServiceTitle(serviceKey)}</h1>
              <div className="site-stage-service-price-box">
                <div className="site-stage-service-price-box__row">
                  <span>{t("stageService.totalAmount")}</span>
                  <strong>{formatStageServiceAmount(totalAmount, language)}</strong>
                </div>
                {state.linkedApplication.applicationNumber ? (
                  <>
                    <div className="site-stage-service-price-box__row">
                      <span>{t("stageService.linkedApplication")}</span>
                      <strong>{state.linkedApplication.applicationNumber}</strong>
                    </div>
                    <div className="site-stage-service-price-box__row">
                      <span>{t("stageService.linkedDiscipline")}</span>
                      <strong>{state.linkedApplication.discipline || "-"}</strong>
                    </div>
                  </>
                ) : null}
              </div>
            </aside>

            <div className="site-apply-detail__form">
              <div className="site-form-card__header">
                <p className="site-kicker">{t("common.kickerApplication")}</p>
                <h1>{t("stageService.detailTitle")}</h1>
                <p>{t("stageService.detailDescription")}</p>
              </div>

              <form className="site-form-grid" onSubmit={handleSubmit}>
                <Input
                  label={t("apply.name")}
                  value={state.applicantInfo.name}
                  onChange={setApplicantField("name")}
                  error={fieldErrors.name}
                  requirement={t("apply.required")}
                />
                <Input
                  label={t("apply.phone")}
                  value={state.applicantInfo.phone}
                  onChange={setApplicantField("phone")}
                  error={fieldErrors.phone}
                  requirement={t("apply.required")}
                  inputMode="tel"
                />
                <Input
                  label={t("apply.email")}
                  value={state.applicantInfo.email}
                  onChange={setApplicantField("email")}
                  error={fieldErrors.email}
                  requirement={t("apply.required")}
                  type="email"
                  inputMode="email"
                />

                {serviceKey === "stage-photo" ? (
                  <>
                    <label className="site-field">
                      <span className="site-field__label">
                        {t("stageService.photoAdditionalFlag")}
                        <span className="site-field__requirement">({t("apply.required")})</span>
                      </span>
                      <select
                        className={`site-input ${fieldErrors.photoHasAdditionalDiscipline ? "site-input--error" : ""}`.trim()}
                        value={state.formData.photoHasAdditionalDiscipline}
                        onChange={setFormField("photoHasAdditionalDiscipline")}
                      >
                        <option value="X">X</option>
                        <option value="O">O</option>
                      </select>
                      {fieldErrors.photoHasAdditionalDiscipline ? (
                        <span className="site-field__error">{fieldErrors.photoHasAdditionalDiscipline}</span>
                      ) : null}
                    </label>

                    <label className="site-field">
                      <span className="site-field__label">
                        {t("stageService.additionalDiscipline")}
                        <span className="site-field__requirement">({t("apply.optional")})</span>
                      </span>
                      <select
                        className={`site-input ${fieldErrors.photoAdditionalDiscipline ? "site-input--error" : ""}`.trim()}
                        value={state.formData.photoAdditionalDiscipline}
                        onChange={setFormField("photoAdditionalDiscipline")}
                        disabled={!hasPhotoAdditionalDiscipline}
                      >
                        <option value="">{t("stageService.additionalDisciplinePlaceholder")}</option>
                        {disciplineOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                      {fieldErrors.photoAdditionalDiscipline ? (
                        <span className="site-field__error">{fieldErrors.photoAdditionalDiscipline}</span>
                      ) : null}
                    </label>
                  </>
                ) : null}

                {serviceKey === "stage-video" ? (
                  <>
                    <label className="site-field">
                      <span className="site-field__label">
                        {t("stageService.videoType")}
                        <span className="site-field__requirement">({t("apply.required")})</span>
                      </span>
                      <select
                        className={`site-input ${fieldErrors.videoType ? "site-input--error" : ""}`.trim()}
                        value={state.formData.videoType}
                        onChange={setFormField("videoType")}
                      >
                        <option value="">{t("stageService.videoTypePlaceholder")}</option>
                        {videoTypeOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label} ({formatStageServiceAmount(option.price, language)})
                          </option>
                        ))}
                      </select>
                      {fieldErrors.videoType ? (
                        <span className="site-field__error">{fieldErrors.videoType}</span>
                      ) : null}
                    </label>
                    <label className="site-field">
                      <span className="site-field__label">
                        {t("stageService.additionalDiscipline")}
                        <span className="site-field__requirement">({t("apply.optional")})</span>
                      </span>
                      <select
                        className="site-input"
                        value={state.formData.videoAdditionalDiscipline}
                        onChange={setFormField("videoAdditionalDiscipline")}
                        disabled={!state.formData.videoType}
                      >
                        <option value="">{t("stageService.additionalDisciplinePlaceholder")}</option>
                        {videoAdditionalChoices.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                ) : null}

                {serviceKey === "hair-makeup" ? (
                  <>
                    <label className="site-field">
                      <span className="site-field__label">
                        {t("stageService.participantDiscipline")}
                        <span className="site-field__requirement">({t("apply.required")})</span>
                      </span>
                      <select
                        className={`site-input ${fieldErrors.hairParticipantDiscipline ? "site-input--error" : ""}`.trim()}
                        value={state.formData.hairParticipantDiscipline}
                        onChange={setFormField("hairParticipantDiscipline")}
                      >
                        <option value="">{t("stageService.participantDisciplinePlaceholder")}</option>
                        {disciplineOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                      {fieldErrors.hairParticipantDiscipline ? (
                        <span className="site-field__error">{fieldErrors.hairParticipantDiscipline}</span>
                      ) : null}
                    </label>

                    <label className="site-field">
                      <span className="site-field__label">
                        {t("stageService.hairOption")}
                        <span className="site-field__requirement">({t("apply.required")})</span>
                      </span>
                      <select
                        className={`site-input ${fieldErrors.hairOption ? "site-input--error" : ""}`.trim()}
                        value={state.formData.hairOption}
                        onChange={setFormField("hairOption")}
                      >
                        <option value="">{t("stageService.hairOptionPlaceholder")}</option>
                        {hairOptionChoices.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label} ({formatStageServiceAmount(option.price, language)})
                          </option>
                        ))}
                      </select>
                      {fieldErrors.hairOption ? (
                        <span className="site-field__error">{fieldErrors.hairOption}</span>
                      ) : null}
                    </label>

                    <label className="site-field">
                      <span className="site-field__label">
                        {t("stageService.additionalDiscipline")}
                        <span className="site-field__requirement">({t("apply.optional")})</span>
                      </span>
                      <select
                        className="site-input"
                        value={state.formData.hairAdditionalDiscipline}
                        onChange={setFormField("hairAdditionalDiscipline")}
                      >
                        <option value="">{t("stageService.additionalDisciplinePlaceholder")}</option>
                        {disciplineOptions
                          .filter((option) => option !== state.formData.hairParticipantDiscipline)
                          .map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                      </select>
                    </label>

                    <label className="site-field">
                      <span className="site-field__label">
                        {t("stageService.optionalOption")}
                        <span className="site-field__requirement">({t("apply.optional")})</span>
                      </span>
                      <select
                        className="site-input"
                        value={state.formData.hairOptionalOption}
                        onChange={setFormField("hairOptionalOption")}
                        disabled={!state.formData.hairOption}
                      >
                        <option value="">{t("stageService.optionalOptionPlaceholder")}</option>
                        {hairOptionalChoices.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label} ({formatStageServiceAmount(option.price, language)})
                          </option>
                        ))}
                      </select>
                      <span className="site-field__hint">{t("stageService.optionalOptionHint")}</span>
                    </label>
                  </>
                ) : null}

                <div className="site-inline-actions site-stage-service-detail__actions">
                  <Button variant="ghost" onClick={() => navigate("/apply/stage-services")}>
                    {t("stageService.backToSelect")}
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? t("stageService.saving") : t("stageService.nextStep")}
                  </Button>
                </div>
              </form>

              {errorMessage ? <p className="site-error-message">{errorMessage}</p> : null}
            </div>
          </div>

          <NoticeBox title={t("stageService.noticeTitle")}>
            <ul className="site-list">
              <li>{t("stageService.notice1")}</li>
              <li>{t("stageService.notice2")}</li>
              <li>{t("stageService.notice3")}</li>
            </ul>
          </NoticeBox>
        </div>
      </section>
    </PageShell>
  );
}
