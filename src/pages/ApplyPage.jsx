import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "../components/common/Button";
import { Input } from "../components/common/Input";
import { NoticeBox } from "../components/common/NoticeBox";
import { PageShell } from "../components/layout/PageShell";
import { useApplicationFlow } from "../context/ApplicationFlowContext";
import { useLanguage } from "../context/LanguageContext";
import { getApplicationAdditionalInfo } from "../data/applicationAdditionalInfo";
import { getWeightClassOptions } from "../data/applicationWeightClassOptions";
import {
  buildApiUrl,
  createDraft,
  updateDraft,
  uploadFile,
} from "../lib/applicationApi";
import { applicationFlowSteps } from "../lib/applicationFlowAccess";

const maxUploadBytes = 10 * 1024 * 1024;
const allowedUploadExtensions = new Set([
  ".pdf",
  ".doc",
  ".docx",
  ".ppt",
  ".pptx",
  ".jpg",
  ".jpeg",
  ".png",
]);
const allowedUploadMimeTypes = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/jpeg",
  "image/png",
]);
const fileInputAccept =
  ".pdf,.doc,.docx,.ppt,.pptx,.jpg,.jpeg,.png,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,image/jpeg,image/png";

function getRegisterImageUrl(key) {
  return buildApiUrl(`/api/home/gallery-image?key=${encodeURIComponent(key)}`);
}

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

function splitDisplayTitle(title) {
  return title
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function getInitialFieldErrors() {
  return {
    name: "",
    phone: "",
    email: "",
    birthDate: "",
    weightClass: "",
  };
}

function getUploadExtension(filename) {
  const match = String(filename || "").match(/(\.[^.]+)$/);
  return match ? match[1].toLowerCase() : "";
}

function validateSelectedFile(file, t) {
  if (!file) {
    return "";
  }

  const extension = getUploadExtension(file.name);

  if (
    !allowedUploadExtensions.has(extension) ||
    !allowedUploadMimeTypes.has(file.type)
  ) {
    return t("apply.fileTypeError");
  }

  if (!Number.isFinite(file.size) || file.size <= 0) {
    return t("apply.emptyFileError");
  }

  if (file.size > maxUploadBytes) {
    return t("apply.fileSizeError");
  }

  return "";
}

export function ApplyPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { state, dispatch, isHydrated } = useApplicationFlow();
  const { locale, t } = useLanguage();
  const handledLocationKeyRef = useRef("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileError, setFileError] = useState("");
  const [fieldErrors, setFieldErrors] = useState(getInitialFieldErrors);

  const selectedDivision = searchParams.get("division") || "";
  const competitionName = searchParams.get("discipline") || t("apply.fallbackCompetition");
  const selectedImageKey = searchParams.get("imageKey") || "";
  const additionalInfo = getApplicationAdditionalInfo(locale, selectedImageKey);
  const weightClassOptions = getWeightClassOptions(selectedImageKey);
  const hasWeightClassOptions = weightClassOptions.length > 0;
  const [additionalInfoTitlePrimary, additionalInfoTitleSecondary] =
    splitDisplayTitle(additionalInfo.title);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    const incomingSelection = {
      division: selectedDivision,
      discipline: searchParams.get("discipline") || "",
      imageKey: selectedImageKey,
    };

    const hasSavedSelection = Object.values(state.selection || {}).some(Boolean);
    const isSameSelection =
      state.selection?.division === incomingSelection.division &&
      state.selection?.discipline === incomingSelection.discipline &&
      state.selection?.imageKey === incomingSelection.imageKey;
    const navigationSource = location.state?.source;
    const shouldHandleNavigationSource =
      Boolean(navigationSource) && handledLocationKeyRef.current !== location.key;

    if (shouldHandleNavigationSource) {
      handledLocationKeyRef.current = location.key;

      if (navigationSource === "consent" && hasSavedSelection && isSameSelection) {
        return;
      }

      if (navigationSource === "select") {
        dispatch({ type: "RESET_APPLICATION_FLOW" });
        dispatch({ type: "SET_SELECTION", value: incomingSelection });
        setSelectedFile(null);
        setErrorMessage("");
        setFileError("");
        setFieldErrors(getInitialFieldErrors());
        return;
      }
    }

    if (!hasSavedSelection || !isSameSelection) {
      dispatch({ type: "RESET_APPLICATION_FLOW" });
      dispatch({ type: "SET_SELECTION", value: incomingSelection });
      setSelectedFile(null);
      setErrorMessage("");
      setFileError("");
      setFieldErrors(getInitialFieldErrors());
    }
  }, [
    dispatch,
    isHydrated,
    location.key,
    location.state,
    searchParams,
    selectedDivision,
    selectedImageKey,
    state.selection,
  ]);

  useEffect(() => {
    if (!hasWeightClassOptions) {
      if (state.applicantInfo.weightClass) {
        dispatch({
          type: "SET_APPLICANT_FIELD",
          field: "weightClass",
          value: "",
        });
      }
      return;
    }

    if (
      state.applicantInfo.weightClass &&
      !weightClassOptions.includes(state.applicantInfo.weightClass)
    ) {
      dispatch({
        type: "SET_APPLICANT_FIELD",
        field: "weightClass",
        value: "",
      });
      setFieldErrors((current) => ({
        ...current,
        weightClass: "",
      }));
    }
  }, [
    dispatch,
    hasWeightClassOptions,
    state.applicantInfo.weightClass,
    weightClassOptions,
  ]);

  function validateApplicantField(field, value) {
    const normalizedValue = typeof value === "string" ? value.trim() : value;

    switch (field) {
      case "name":
        return normalizedValue ? "" : t("apply.nameError");
      case "phone": {
        const digits = String(value || "").replace(/\D/g, "");
        return digits.length === 11 ? "" : t("apply.phoneError");
      }
      case "email":
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(normalizedValue || ""))
          ? ""
          : t("apply.emailError");
      case "birthDate":
        return normalizedValue ? "" : t("apply.birthDateError");
      case "weightClass":
        return hasWeightClassOptions && !normalizedValue ? t("apply.weightClassError") : "";
      default:
        return "";
    }
  }

  function validateApplicantForm() {
    const nextErrors = {
      name: validateApplicantField("name", state.applicantInfo.name),
      phone: validateApplicantField("phone", state.applicantInfo.phone),
      email: validateApplicantField("email", state.applicantInfo.email),
      birthDate: validateApplicantField("birthDate", state.applicantInfo.birthDate),
      weightClass: validateApplicantField("weightClass", state.applicantInfo.weightClass),
    };

    setFieldErrors(nextErrors);
    return !Object.values(nextErrors).some(Boolean);
  }

  function setApplicantField(field) {
    return (event) => {
      const nextValue =
        field === "phone"
          ? formatPhoneNumber(event.target.value)
          : event.target.value;

      dispatch({
        type: "SET_APPLICANT_FIELD",
        field,
        value: nextValue,
      });

      if (field in fieldErrors) {
        setFieldErrors((current) => ({
          ...current,
          [field]: validateApplicantField(field, nextValue),
        }));
      }
    };
  }

  function handleFileChange(event) {
    const file = event.target.files?.[0] || null;
    const validationMessage = validateSelectedFile(file, t);

    if (validationMessage) {
      setSelectedFile(null);
      setFileError(validationMessage);
      event.target.value = "";

      dispatch({
        type: "SET_FILE_META",
        payload: {
          originalFilename: "",
          storedFilename: "",
          mimeType: "",
          fileSize: 0,
        },
      });
      return;
    }

    setFileError("");
    setSelectedFile(file);

    dispatch({
      type: "SET_FILE_META",
      payload: file
        ? {
            originalFilename: file.name,
            storedFilename: "",
            mimeType: file.type,
            fileSize: file.size,
          }
        : {
            originalFilename: "",
            storedFilename: "",
            mimeType: "",
            fileSize: 0,
          },
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setErrorMessage("");
    setFileError("");

    if (!validateApplicantForm()) {
      return;
    }

    if (selectedFile) {
      const validationMessage = validateSelectedFile(selectedFile, t);

      if (validationMessage) {
        setFileError(validationMessage);
        return;
      }
    }

    setIsSubmitting(true);

    try {
      const payload = {
        name: state.applicantInfo.name,
        phone: state.applicantInfo.phone,
        email: state.applicantInfo.email,
        birthDate: state.applicantInfo.birthDate,
        organization: state.applicantInfo.organization,
        weightClass: state.applicantInfo.weightClass,
        paymentMethod: state.paymentMethod,
        selection: state.selection,
        consents: {
          ...state.consents,
          version: "v1",
        },
      };

      const draftResponse = state.draftId
        ? await updateDraft(state.draftId, payload)
        : await createDraft(payload);

      const draftId = draftResponse.draft.draftId;
      dispatch({ type: "SET_DRAFT_ID", value: draftId });

      if (selectedFile) {
        const fileResponse = await uploadFile({
          draftId,
          file: selectedFile,
        });

        dispatch({
          type: "SET_FILE_META",
          payload: {
            originalFilename: fileResponse.file.original_filename,
            storedFilename: fileResponse.file.stored_filename,
            mimeType: fileResponse.file.mime_type,
            fileSize: fileResponse.file.file_size,
          },
        });
      }

      dispatch({
        type: "SET_FLOW_STEP",
        value: applicationFlowSteps.CONSENT,
      });
      navigate("/apply/consent");
    } catch (error) {
      setErrorMessage(error.message || t("apply.saveDraftError"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <PageShell>
      <section className="site-apply-detail">
        <div className="site-apply-detail__layout">
          <aside className="site-apply-detail__summary">
            <Link className="site-apply-detail__back-link" to="/apply">
              {`< ${t("apply.back")}`}
            </Link>
            <h1>{competitionName}</h1>
            {selectedImageKey ? (
              <img
                src={getRegisterImageUrl(selectedImageKey)}
                alt={competitionName}
              />
            ) : (
              <div className="site-apply-detail__image-placeholder">
                {t("apply.imagePlaceholder")}
              </div>
            )}
          </aside>

          <form
            className="site-form-card site-apply-detail__form"
            onSubmit={handleSubmit}
          >
            <div className="site-form-card__header">
              <p className="site-kicker">{t("common.kickerApplication")}</p>
              <h1>{t("apply.title")}</h1>
              <p>{t("apply.description")}</p>
            </div>

            <div className="site-form-grid">
              <Input
                label={t("apply.name")}
                requirement={t("apply.required")}
                value={state.applicantInfo.name}
                onChange={setApplicantField("name")}
                error={fieldErrors.name}
                required
              />
              <Input
                label={t("apply.phone")}
                requirement={t("apply.required")}
                value={state.applicantInfo.phone}
                onChange={setApplicantField("phone")}
                error={fieldErrors.phone}
                placeholder="010-0000-0000"
                required
              />
              <Input
                label={t("apply.email")}
                requirement={t("apply.required")}
                type="email"
                value={state.applicantInfo.email}
                onChange={setApplicantField("email")}
                error={fieldErrors.email}
                required
              />
              <Input
                label={t("apply.birthDate")}
                requirement={t("apply.required")}
                type="date"
                value={state.applicantInfo.birthDate}
                onChange={setApplicantField("birthDate")}
                error={fieldErrors.birthDate}
                required
              />
              <Input
                label={t("apply.organization")}
                requirement={t("apply.optional")}
                value={state.applicantInfo.organization}
                onChange={setApplicantField("organization")}
              />
              {hasWeightClassOptions ? (
                <label className="site-field">
                  <span className="site-field__label">
                    {t("apply.weightClass")}
                    <span className="site-field__requirement">({t("apply.required")})</span>
                  </span>
                  <select
                    className={`site-input ${fieldErrors.weightClass ? "site-input--error" : ""}`.trim()}
                    value={state.applicantInfo.weightClass}
                    onChange={setApplicantField("weightClass")}
                    required
                  >
                    <option value="">{t("apply.weightClassPlaceholder")}</option>
                    {weightClassOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.weightClass ? (
                    <span className="site-field__error">{fieldErrors.weightClass}</span>
                  ) : null}
                </label>
              ) : null}
              <label className="site-field">
                <span className="site-field__label">
                  {t("apply.submitFile")}
                  <span className="site-field__requirement">({t("apply.optional")})</span>
                </span>
                <input
                  className="site-input site-input--file"
                  type="file"
                  accept={fileInputAccept}
                  onChange={handleFileChange}
                />
                <span className="site-field__hint">
                  {state.uploadedFileMeta.originalFilename ||
                    t("apply.noFileSelected")}
                </span>
                {fileError ? (
                  <span className="site-field__error">{fileError}</span>
                ) : null}
                <div className="site-file-help">
                  <button
                    className="site-file-help__trigger"
                    type="button"
                    aria-label={t("apply.fileUploadTipsAria")}
                  >
                    i
                  </button>
                  <span className="site-file-help__label">
                    {t("apply.fileUploadTips")}
                  </span>
                  <div className="site-file-help__tooltip" role="tooltip">
                    {t("apply.allowedExtensions")}
                    <br />
                    {t("apply.maxFileSize")}
                    <br />
                    {t("apply.objectKeyMessage")}
                  </div>
                </div>
              </label>
            </div>

            <div className="site-apply-detail__form-lower">
              <div className="site-apply-detail__submit-area">
                <div className="site-form-card__actions">
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? t("apply.saving") : t("apply.nextStep")}
                  </Button>
                </div>
                {errorMessage ? (
                  <p className="site-error-message">{errorMessage}</p>
                ) : null}
              </div>
            </div>
          </form>
        </div>

        <NoticeBox title={t("apply.noticeTitle")}>
          <ul className="site-list">
            <li>{t("apply.notice1")}</li>
            <li>{t("apply.notice2")}</li>
            <li>{t("apply.notice3")}</li>
          </ul>
        </NoticeBox>

        <section
          className="site-apply-detail__additional-info"
          aria-labelledby="apply-additional-info-title"
        >
          <h2 id="apply-additional-info-title">
            <span className="site-apply-detail__additional-title-primary">
              {additionalInfoTitlePrimary || additionalInfo.title}
            </span>
            {additionalInfoTitleSecondary ? (
              <span className="site-apply-detail__additional-title-secondary">
                {additionalInfoTitleSecondary}
              </span>
            ) : null}
          </h2>
          <div className="site-apply-detail__additional-sections">
            {additionalInfo.sections.map((section) => (
              <section
                className={`site-apply-detail__additional-section ${
                  section.tone === "danger"
                    ? "site-apply-detail__additional-section--danger"
                    : ""
                }`}
                key={section.title}
              >
                {section.type === "image" ? (
                  <img
                    className="site-apply-detail__additional-image"
                    src={getRegisterImageUrl(section.imageKey)}
                    alt={section.title}
                  />
                ) : (
                  <>
                    <h3>{section.title}</h3>
                    <p>{section.body}</p>
                  </>
                )}
              </section>
            ))}
          </div>
        </section>
      </section>
    </PageShell>
  );
}
