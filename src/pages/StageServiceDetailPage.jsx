import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "../components/common/Button";
import { Input } from "../components/common/Input";
import { NoticeBox } from "../components/common/NoticeBox";
import { PageShell } from "../components/layout/PageShell";
import { useLanguage } from "../context/LanguageContext";
import { useStageServiceFlow } from "../context/StageServiceFlowContext";
import {
  calculateStageServiceTotalAmount,
  formatStageServiceAmount,
  getHairAddOnChoices,
  getHairOptionChoices,
  getHairRetouchCountChoices,
  getStagePhotoPackage,
  getStagePhotoPackages,
  getStageServiceByKey,
  getStageServiceTitle,
  getStageVideoAdditionalDisciplineChoices,
  getVideoTypeOptions,
} from "../data/stageServiceConfig";
import {
  buildApiUrl,
  createStageServiceDraft,
  getEligibleStageServiceApplications,
  updateStageServiceDraft,
} from "../lib/applicationApi";
import {
  getHairMakeupDisciplineGender,
  isHairMakeupOptionAllowed,
} from "../lib/stageServiceHairEligibility";
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
    linkedApplication: "",
    videoType: "",
    hairOption: "",
  };
}

export function StageServiceDetailPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { state, dispatch, isHydrated } = useStageServiceFlow();
  const { locale, t } = useLanguage();
  const handledLocationKeyRef = useRef("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingApplications, setIsLoadingApplications] = useState(false);
  const [eligibleApplications, setEligibleApplications] = useState([]);
  const [fieldErrors, setFieldErrors] = useState(getInitialFieldErrors);

  const serviceKey = searchParams.get("service") || "";
  const serviceConfig = getStageServiceByKey(serviceKey);
  const prefillName = searchParams.get("name") || "";
  const prefillEmail = searchParams.get("email") || "";
  const prefillPhone = searchParams.get("phone") || "";
  const videoTypeOptions = getVideoTypeOptions(locale);
  const isHairMakeupService = serviceKey === "hair-makeup";
  const isMultiApplicationService = serviceKey === "stage-photo" || isHairMakeupService;
  const selectedLinkedApplications = isMultiApplicationService
    ? state.linkedApplications
    : state.linkedApplication.applicationNumber
      ? [state.linkedApplication]
      : [];
  const selectedHairDisciplines = isHairMakeupService
    ? selectedLinkedApplications.map((application) => application.discipline)
    : [];
  const hairOptionChoices = getHairOptionChoices(locale).filter((option) =>
    selectedHairDisciplines.every((discipline) => isHairMakeupOptionAllowed(discipline, option)),
  );
  const maxHairRetouchCount = Math.max(0, selectedHairDisciplines.length - 1);
  const stagePhotoPackage =
    serviceKey === "stage-photo"
      ? getStagePhotoPackage(selectedLinkedApplications.length)
      : null;
  const stagePhotoPackages = getStagePhotoPackages();
  const hairAddOnChoices = getHairAddOnChoices(locale);
  const hairRetouchCountChoices = getHairRetouchCountChoices(state.formData.hairOption, locale)
    .filter((option) => option.count <= maxHairRetouchCount);
  const hairBodyMakeupOption = hairAddOnChoices.find((option) => option.value === "BODY_MAKEUP");
  const hairPieceOption = hairAddOnChoices.find((option) => option.value === "HAIR_PIECE");
  const videoAdditionalChoices = getStageVideoAdditionalDisciplineChoices(locale);
  const totalAmount = useMemo(
    () =>
      calculateStageServiceTotalAmount({
        serviceKey,
        photoDisciplineCount: selectedLinkedApplications.length,
        videoType: state.formData.videoType,
        videoAdditionalDiscipline: state.formData.videoAdditionalDiscipline,
        hairOption: state.formData.hairOption,
        hairBodyMakeup: state.formData.hairBodyMakeup,
        hairPiece: state.formData.hairPiece,
        hairRetouchCount: state.formData.hairRetouchCount,
      }),
    [
      serviceKey,
      selectedLinkedApplications.length,
      state.formData.videoType,
      state.formData.videoAdditionalDiscipline,
      state.formData.hairOption,
      state.formData.hairBodyMakeup,
      state.formData.hairPiece,
      state.formData.hairRetouchCount,
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
    if (Number(state.formData.hairRetouchCount || 0) > maxHairRetouchCount) {
      dispatch({ type: "SET_FORM_FIELD", field: "hairRetouchCount", value: "0" });
    }
  }, [dispatch, maxHairRetouchCount, state.formData.hairRetouchCount]);

  useEffect(() => {
    const allowedHairOptionValues = new Set(hairOptionChoices.map((option) => option.value));

    if (
      state.formData.hairOption &&
      !allowedHairOptionValues.has(state.formData.hairOption)
    ) {
      dispatch({ type: "SET_FORM_FIELD", field: "hairOption", value: "" });
      dispatch({ type: "SET_FORM_FIELD", field: "hairRetouchCount", value: "0" });
    }
  }, [
    dispatch,
    hairOptionChoices,
    state.formData.hairOption,
  ]);

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
      case "linkedApplication":
        if (isMultiApplicationService) {
          return state.linkedApplications.length
            ? ""
            : "신청한 종목 내역에서 1개 이상 선택해 주세요.";
        }

        return state.linkedApplication.applicationNumber ? "" : "신청한 종목 내역에서 연결할 종목을 선택해 주세요.";
      case "videoType":
        return normalizedValue ? "" : t("stageService.videoTypeError");
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
      linkedApplication: validateField("linkedApplication", state.linkedApplication.applicationNumber),
      videoType:
        serviceKey === "stage-video" ? validateField("videoType", state.formData.videoType) : "",
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
      setEligibleApplications([]);
      dispatch({ type: "SET_LINKED_APPLICATIONS", value: [] });
      setFieldErrors((current) => ({
        ...current,
        [field]: validateField(field, nextValue),
        linkedApplication: "",
      }));
    };
  }

  async function loadEligibleApplications() {
    const nextErrors = {
      name: validateField("name", state.applicantInfo.name),
      phone: validateField("phone", state.applicantInfo.phone),
      email: validateField("email", state.applicantInfo.email),
    };

    setFieldErrors((current) => ({ ...current, ...nextErrors }));

    if (Object.values(nextErrors).some(Boolean)) {
      return;
    }

    setIsLoadingApplications(true);
    setErrorMessage("");

    try {
      const json = await getEligibleStageServiceApplications({
        name: state.applicantInfo.name,
        phone: state.applicantInfo.phone,
        email: state.applicantInfo.email,
      });
      const applications = json.applications || [];

      setEligibleApplications(applications);

      if (!applications.length) {
        dispatch({ type: "SET_LINKED_APPLICATIONS", value: [] });
        setFieldErrors((current) => ({
          ...current,
          linkedApplication: "결제 완료된 대회 신청 내역을 찾지 못했습니다.",
        }));
        return;
      }

      const availableApplicationNumbers = new Set(
        applications.map((application) => application.applicationNumber),
      );
      const currentSelection = isMultiApplicationService
        ? state.linkedApplications
        : [state.linkedApplication];
      const nextSelection = currentSelection.filter((application) =>
        availableApplicationNumbers.has(application.applicationNumber),
      );

      dispatch({ type: "SET_LINKED_APPLICATIONS", value: nextSelection });
      setFieldErrors((current) => ({ ...current, linkedApplication: "" }));
    } catch (error) {
      setEligibleApplications([]);
      dispatch({ type: "SET_LINKED_APPLICATIONS", value: [] });
      setErrorMessage(error.message || "신청한 종목 내역을 불러오지 못했습니다.");
    } finally {
      setIsLoadingApplications(false);
    }
  }

  function selectLinkedApplication(application) {
    if (isMultiApplicationService) {
      const isSelected = state.linkedApplications.some(
        (selectedApplication) => selectedApplication.applicationNumber === application.applicationNumber,
      );
      const nextSelection = isSelected
        ? state.linkedApplications.filter(
          (selectedApplication) => selectedApplication.applicationNumber !== application.applicationNumber,
        )
        : [...state.linkedApplications, application];

      if (!isSelected && nextSelection.length > 3) {
        setErrorMessage(
          serviceKey === "stage-photo"
            ? "무대 사진 촬영은 신청한 종목을 최대 3개까지 선택할 수 있습니다."
            : "헤어&메이크업은 신청한 종목을 최대 3개까지 선택할 수 있습니다.",
        );
        return;
      }

      if (isHairMakeupService) {
        const selectedGenders = new Set(
          nextSelection
            .map((selectedApplication) => getHairMakeupDisciplineGender(selectedApplication.discipline))
            .filter((gender) => gender !== "all"),
        );

        if (selectedGenders.size > 1) {
          setErrorMessage("남성 부문과 여성 부문은 하나의 헤어&메이크업 신청으로 함께 선택할 수 없습니다.");
          return;
        }
      }

      dispatch({ type: "SET_LINKED_APPLICATIONS", value: nextSelection });
      setFieldErrors((current) => ({ ...current, linkedApplication: "" }));
      setErrorMessage("");
      return;
    }

    dispatch({
      type: "SET_LINKED_APPLICATION",
      value: {
        applicationNumber: application.applicationNumber,
        discipline: application.discipline,
      },
    });
    setFieldErrors((current) => ({ ...current, linkedApplication: "" }));
    setErrorMessage("");
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

  function setBooleanFormField(field) {
    return (event) => {
      dispatch({ type: "SET_FORM_FIELD", field, value: event.target.checked });
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
      linkedApplicationNumber: state.linkedApplication.applicationNumber,
      linkedApplicationNumbers: selectedLinkedApplications.map((application) => application.applicationNumber),
      videoType: state.formData.videoType,
      videoAdditionalDiscipline: state.formData.videoAdditionalDiscipline,
      hairOption: state.formData.hairOption,
      hairBodyMakeup: state.formData.hairBodyMakeup,
      hairPiece: state.formData.hairPiece,
      hairRetouchCount: state.formData.hairRetouchCount,
    };

    try {
      const json = state.draftId
        ? await updateStageServiceDraft(state.draftId, payload)
        : await createStageServiceDraft(payload);

      dispatch({ type: "SET_DRAFT_ID", value: json.draft.draftId });
      dispatch({ type: "SET_ORDER", payload: { orderId: null } });
      dispatch({
        type: "SET_LINKED_APPLICATIONS",
        value: json.linkedApplications || (json.linkedApplication ? [json.linkedApplication] : []),
      });
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

  const renderPriceBox = (variant) => (
    <div className={`site-stage-service-price-box site-stage-service-price-box--${variant}`}>
      <div className="site-stage-service-price-box__row">
        <span>{t("stageService.totalAmount")}</span>
        <strong>{formatStageServiceAmount(totalAmount, locale)}</strong>
      </div>
      {selectedLinkedApplications.length ? (
        <>
          <div className="site-stage-service-price-box__row">
            <span>{isMultiApplicationService ? "선택 종목" : t("stageService.linkedApplication")}</span>
            <strong>{selectedLinkedApplications.map((application) => application.applicationNumber).join(", ")}</strong>
          </div>
          <div className="site-stage-service-price-box__row">
            <span>{isMultiApplicationService ? "참가 부문" : t("stageService.linkedDiscipline")}</span>
            <strong>{selectedLinkedApplications.map((application) => application.discipline).join(", ") || "-"}</strong>
          </div>
          {stagePhotoPackage ? (
            <div className="site-stage-service-price-box__row">
              <span>사진 구성</span>
              <strong>{stagePhotoPackage.disciplineCount}종목 / {stagePhotoPackage.photoCount}장</strong>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );

  return (
    <PageShell>
      <section className="site-page site-page--stage-service">
        <div className="site-apply-detail site-stage-service-detail">
          <div className="site-apply-detail__layout">
            <aside className="site-apply-detail__summary site-stage-service-detail__summary">
              <Link className="site-apply-detail__back-link" to="/apply/stage-services">
                {`< ${t("apply.back")}`}
              </Link>
              <h1>{getStageServiceTitle(serviceKey, locale)}</h1>
              {renderPriceBox("desktop")}
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

                <div className="site-stage-service-application-picker">
                  <div className="site-stage-service-application-picker__header">
                    <span className="site-field__label">
                      신청한 종목 내역
                      <span className="site-field__requirement">({t("apply.required")})</span>
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={loadEligibleApplications}
                      disabled={isLoadingApplications}
                    >
                      {isLoadingApplications ? "불러오는 중" : "신청한 종목 내역 불러오기"}
                    </Button>
                  </div>
                  {isMultiApplicationService ? (
                    <p className="site-field__hint">
                      {serviceKey === "stage-photo"
                        ? "무대 사진 촬영을 받을 결제 완료 종목을 최대 3개까지 선택해 주세요."
                        : "헤어&메이크업을 받을 결제 완료 종목을 최대 3개까지 선택해 주세요."}
                    </p>
                  ) : null}
                  {eligibleApplications.length ? (
                    <div
                      className="site-stage-service-application-picker__options"
                      role={isMultiApplicationService ? "group" : "radiogroup"}
                    >
                      {eligibleApplications.map((application) => {
                        const selected = isMultiApplicationService
                          ? state.linkedApplications.some(
                            (selectedApplication) =>
                              selectedApplication.applicationNumber === application.applicationNumber,
                          )
                          : state.linkedApplication.applicationNumber === application.applicationNumber;

                        return (
                          <label
                            className={`site-stage-service-application-picker__option${selected ? " is-selected" : ""}`}
                            key={application.applicationNumber}
                          >
                            <input
                              checked={selected}
                              name="linked-stage-application"
                              onChange={() => selectLinkedApplication(application)}
                              type={isMultiApplicationService ? "checkbox" : "radio"}
                              value={application.applicationNumber}
                            />
                            <span>{application.discipline}</span>
                            <small>{application.applicationNumber}</small>
                          </label>
                        );
                      })}
                    </div>
                  ) : null}
                  {fieldErrors.linkedApplication ? (
                    <span className="site-field__error">{fieldErrors.linkedApplication}</span>
                  ) : null}
                </div>

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
                            {option.label} ({formatStageServiceAmount(option.price, locale)})
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
                        {t("stageService.hairOption")}
                        <span className="site-field__requirement">({t("apply.required")})</span>
                      </span>
                      <select
                        className={`site-input ${fieldErrors.hairOption ? "site-input--error" : ""}`.trim()}
                        value={state.formData.hairOption}
                        onChange={setFormField("hairOption")}
                        disabled={!selectedHairDisciplines.length}
                      >
                        <option value="">{t("stageService.hairOptionPlaceholder")}</option>
                        {hairOptionChoices.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label} ({formatStageServiceAmount(option.price, locale)})
                          </option>
                        ))}
                      </select>
                      {fieldErrors.hairOption ? (
                        <span className="site-field__error">{fieldErrors.hairOption}</span>
                      ) : null}
                    </label>

                    <label className="site-field">
                      <span className="site-field__label">
                        {locale === "ko" ? "리터치 횟수" : "Retouch sessions"}
                        <span className="site-field__requirement">({t("apply.optional")})</span>
                      </span>
                      <select
                        className="site-input"
                        value={state.formData.hairRetouchCount}
                        onChange={setFormField("hairRetouchCount")}
                        disabled={!state.formData.hairOption || maxHairRetouchCount === 0}
                      >
                        {hairRetouchCountChoices.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}{option.price ? ` (${formatStageServiceAmount(option.price, locale)})` : ""}
                          </option>
                        ))}
                      </select>
                      <span className="site-field__hint">
                        {locale === "ko"
                          ? maxHairRetouchCount
                            ? `선택한 ${selectedHairDisciplines.length}개 종목 사이에 필요한 리터치 횟수를 선택해 주세요.`
                            : "리터치는 신청한 종목을 2개 이상 선택한 경우에 신청할 수 있습니다."
                          : maxHairRetouchCount
                            ? "Select the number of retouch sessions needed between your selected disciplines."
                            : "Retouch is available when two or more disciplines are selected."}
                      </span>
                    </label>

                    <label className="site-stage-service-option-toggle">
                      <input
                        checked={Boolean(state.formData.hairBodyMakeup)}
                        disabled={!state.formData.hairOption}
                        onChange={setBooleanFormField("hairBodyMakeup")}
                        type="checkbox"
                      />
                      <span>
                        <strong>{hairBodyMakeupOption?.label || "바디메이크업"}</strong>
                        <small>{formatStageServiceAmount(hairBodyMakeupOption?.price, locale)}</small>
                      </span>
                    </label>

                    <label className="site-stage-service-option-toggle">
                      <input
                        checked={Boolean(state.formData.hairPiece)}
                        disabled={!state.formData.hairOption}
                        onChange={setBooleanFormField("hairPiece")}
                        type="checkbox"
                      />
                      <span>
                        <strong>{hairPieceOption?.label || "헤어피스(가발)"}</strong>
                        <small>{formatStageServiceAmount(hairPieceOption?.price, locale)}</small>
                      </span>
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
            {renderPriceBox("mobile")}
          </div>

          <NoticeBox title={t("stageService.noticeTitle")}>
            <ul className="site-list">
              <li>{t("stageService.notice1")}</li>
              <li>{t("stageService.notice2")}</li>
              <li>{t("stageService.notice3")}</li>
              {serviceKey === "stage-photo" ? (
                <li>모든 전달 사진은 보정 완료본이며, 원본 사이즈로 제공됩니다.</li>
              ) : null}
              {serviceKey === "hair-makeup" ? (
                <li>대회장 내에서 공식 헤어&amp;메이크업 업체를 제외한 출장 헤어&amp;메이크업 업체는 입장이 불가합니다.</li>
              ) : null}
            </ul>
            {serviceKey === "stage-photo" ? (
              <div className="site-apply-detail__fee-table-wrap site-stage-photo-price-table-wrap">
                <table className="site-apply-detail__fee-table">
                  <thead>
                    <tr>
                      <th>구성</th>
                      <th>신청 종목</th>
                      <th>장수</th>
                      <th>금액</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stagePhotoPackages.map((stagePhotoPackage, index) => (
                      <tr key={stagePhotoPackage.disciplineCount}>
                        {index === 0 ? (
                          <td rowSpan={stagePhotoPackages.length}>보정 완료 사진<br />원본 사이즈</td>
                        ) : null}
                        <td>{stagePhotoPackage.disciplineCount}종목</td>
                        <td>{stagePhotoPackage.photoCount}장</td>
                        <td>{formatStageServiceAmount(stagePhotoPackage.price, locale)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </NoticeBox>
          {serviceKey === "stage-photo" ? (
            <div className="site-stage-service-notice-images">
              <img
                src={buildApiUrl(`/api/home/gallery-image?key=${encodeURIComponent("register/stagephoto_1.png")}`)}
                alt="무대 사진 촬영 안내"
              />
            </div>
          ) : null}
          {serviceKey === "hair-makeup" ? (
            <div className="site-stage-service-notice-images">
              {["hairmakeup_1.png", "hairmakeup_2.png"].map((filename) => (
                <img
                  key={filename}
                  src={buildApiUrl(`/api/home/gallery-image?key=${encodeURIComponent(`register/${filename}`)}`)}
                  alt=""
                />
              ))}
            </div>
          ) : null}
        </div>
      </section>
    </PageShell>
  );
}
