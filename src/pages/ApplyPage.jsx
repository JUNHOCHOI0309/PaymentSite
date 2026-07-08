import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "../components/common/Button";
import { Input } from "../components/common/Input";
import { NoticeBox } from "../components/common/NoticeBox";
import { PageShell } from "../components/layout/PageShell";
import uploadIcon from "../assets/upload-icon.png";
import { useApplicationFlow } from "../context/ApplicationFlowContext";
import { useLanguage } from "../context/LanguageContext";
import { getApplicationAdditionalInfo } from "../data/applicationAdditionalInfo";
import {
  formatApplicationEntryFee,
  getApplicationEntryFee,
} from "../data/applicationEntryFees";
import { getWeightClassOptions } from "../data/applicationWeightClassOptions";
import {
  getSnsPlatformOptions,
  parseStoredSnsIdentity,
  serializeDetailedSnsIdentity,
} from "../lib/applicationSns";
import {
  buildApiUrl,
  createDraft,
  updateDraft,
  uploadFile,
} from "../lib/applicationApi";
import { applicationFlowSteps } from "../lib/applicationFlowAccess";

const maxUploadBytes = 10 * 1024 * 1024;
const allowedDocumentUploadExtensions = new Set([
  ".pdf",
  ".doc",
  ".docx",
  ".ppt",
  ".pptx",
  ".jpg",
  ".jpeg",
  ".png",
]);
const allowedDocumentUploadMimeTypes = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/jpeg",
  "image/png",
]);
const documentFileInputAccept =
  ".pdf,.doc,.docx,.ppt,.pptx,.jpg,.jpeg,.png,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,image/jpeg,image/png";
const allowedAudioUploadExtensions = new Set([".mp3"]);
const allowedAudioUploadMimeTypes = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/x-mpeg-3",
  "audio/mpg",
]);
const audioFileInputAccept = ".mp3,audio/mpeg,audio/mp3,audio/x-mpeg-3,audio/mpg";
const introductionMaxLength = 100;

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

function validateSelectedFile(file, kind, t) {
  if (!file) {
    return "";
  }

  const extension = getUploadExtension(file.name);
  const isAudio = kind === "audio";
  const allowedExtensions = isAudio
    ? allowedAudioUploadExtensions
    : allowedDocumentUploadExtensions;
  const allowedMimeTypes = isAudio
    ? allowedAudioUploadMimeTypes
    : allowedDocumentUploadMimeTypes;

  if (
    !allowedExtensions.has(extension) ||
    !allowedMimeTypes.has(file.type)
  ) {
    return t(isAudio ? "apply.audioFileTypeError" : "apply.fileTypeError");
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
  const documentFileInputRef = useRef(null);
  const audioFileInputRef = useRef(null);
  const { state, dispatch, isHydrated } = useApplicationFlow();
  const { locale, t } = useLanguage();
  const handledLocationKeyRef = useRef("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedAudioFile, setSelectedAudioFile] = useState(null);
  const [fileError, setFileError] = useState("");
  const [audioFileError, setAudioFileError] = useState("");
  const [fieldErrors, setFieldErrors] = useState(getInitialFieldErrors);

  const selectedDivision = searchParams.get("division") || "";
  const competitionName = searchParams.get("discipline") || t("apply.fallbackCompetition");
  const selectedImageKey = searchParams.get("imageKey") || "";
  const additionalInfo = getApplicationAdditionalInfo(locale, selectedImageKey);
  const weightClassOptions = getWeightClassOptions(selectedImageKey);
  const hasWeightClassOptions = weightClassOptions.length > 0;
  const entryFeeAmount = getApplicationEntryFee(selectedImageKey);
  const snsPlatformOptions = getSnsPlatformOptions(locale);
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
        setSelectedAudioFile(null);
        setErrorMessage("");
        setFileError("");
        setAudioFileError("");
        setFieldErrors(getInitialFieldErrors());
        return;
      }
    }

    if (!hasSavedSelection || !isSameSelection) {
      dispatch({ type: "RESET_APPLICATION_FLOW" });
      dispatch({ type: "SET_SELECTION", value: incomingSelection });
      setSelectedFile(null);
      setSelectedAudioFile(null);
      setErrorMessage("");
      setFileError("");
      setAudioFileError("");
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

  useEffect(() => {
    if (state.applicantInfo.snsId || !state.applicantInfo.instagramId) {
      return;
    }

    const parsedSnsIdentity = parseStoredSnsIdentity(state.applicantInfo.instagramId);

    if (parsedSnsIdentity.platform !== state.applicantInfo.snsPlatform) {
      dispatch({
        type: "SET_APPLICANT_FIELD",
        field: "snsPlatform",
        value: parsedSnsIdentity.platform,
      });
    }

    if (parsedSnsIdentity.id !== state.applicantInfo.snsId) {
      dispatch({
        type: "SET_APPLICANT_FIELD",
        field: "snsId",
        value: parsedSnsIdentity.id,
      });
    }

    if ((parsedSnsIdentity.customPlatform || "") !== (state.applicantInfo.snsOtherPlatform || "")) {
      dispatch({
        type: "SET_APPLICANT_FIELD",
        field: "snsOtherPlatform",
        value: parsedSnsIdentity.customPlatform || "",
      });
    }
  }, [
    dispatch,
    state.applicantInfo.instagramId,
    state.applicantInfo.snsId,
    state.applicantInfo.snsOtherPlatform,
    state.applicantInfo.snsPlatform,
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

      if (field === "snsPlatform") {
        dispatch({
          type: "SET_APPLICANT_FIELD",
          field,
          value: nextValue,
        });

        if (nextValue === "none" || !nextValue) {
          dispatch({
            type: "SET_APPLICANT_FIELD",
            field: "snsId",
            value: "",
          });
          dispatch({
            type: "SET_APPLICANT_FIELD",
            field: "snsOtherPlatform",
            value: "",
          });
          return;
        }

        if (nextValue !== "other") {
          dispatch({
            type: "SET_APPLICANT_FIELD",
            field: "snsOtherPlatform",
            value: "",
          });
        }

        return;
      }

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

  function handleFileChange(kind) {
    return (event) => {
      const file = event.target.files?.[0] || null;
      const validationMessage = validateSelectedFile(file, kind, t);
      const isAudio = kind === "audio";
      const actionType = isAudio ? "SET_AUDIO_FILE_META" : "SET_FILE_META";

      if (validationMessage) {
        if (isAudio) {
          setSelectedAudioFile(null);
          setAudioFileError(validationMessage);
        } else {
          setSelectedFile(null);
          setFileError(validationMessage);
        }
        event.target.value = "";

        dispatch({
          type: actionType,
          payload: {
            originalFilename: "",
            storedFilename: "",
            mimeType: "",
            fileSize: 0,
          },
        });
        return;
      }

      if (isAudio) {
        setAudioFileError("");
        setSelectedAudioFile(file);
      } else {
        setFileError("");
        setSelectedFile(file);
      }

      dispatch({
        type: actionType,
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
    };
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setErrorMessage("");
    setFileError("");
    setAudioFileError("");

    if (!validateApplicantForm()) {
      return;
    }

    if (selectedFile) {
      const validationMessage = validateSelectedFile(selectedFile, "document", t);

      if (validationMessage) {
        setFileError(validationMessage);
        return;
      }
    }

    if (selectedAudioFile) {
      const validationMessage = validateSelectedFile(selectedAudioFile, "audio", t);

      if (validationMessage) {
        setAudioFileError(validationMessage);
        return;
      }
    }

    setIsSubmitting(true);

    try {
      const serializedSnsIdentity = serializeDetailedSnsIdentity({
        platform: state.applicantInfo.snsPlatform,
        customPlatform: state.applicantInfo.snsOtherPlatform,
        id: state.applicantInfo.snsId,
      });

      const payload = {
        name: state.applicantInfo.name,
        phone: state.applicantInfo.phone,
        email: state.applicantInfo.email,
        birthDate: state.applicantInfo.birthDate,
        organization: state.applicantInfo.organization,
        instagramId: serializedSnsIdentity,
        introduction: state.applicantInfo.introduction,
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
          fileKind: "document",
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

      if (selectedAudioFile) {
        const audioFileResponse = await uploadFile({
          draftId,
          file: selectedAudioFile,
          fileKind: "audio",
        });

        dispatch({
          type: "SET_AUDIO_FILE_META",
          payload: {
            originalFilename: audioFileResponse.file.original_filename,
            storedFilename: audioFileResponse.file.stored_filename,
            mimeType: audioFileResponse.file.mime_type,
            fileSize: audioFileResponse.file.file_size,
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
            <div className="site-apply-detail__price-box">
              <span>{t("apply.entryFeeLabel")}</span>
              <strong>{formatApplicationEntryFee(entryFeeAmount, locale)}</strong>
            </div>
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
              <label className="site-field site-field--full">
                <span className="site-field__label">
                  {t("apply.snsId")}
                  <span className="site-field__requirement">({t("apply.optional")})</span>
                </span>
                <div className="site-field__compound">
                  <select
                    className="site-input"
                    value={state.applicantInfo.snsPlatform}
                    onChange={setApplicantField("snsPlatform")}
                  >
                    <option value="">{t("apply.snsPlatformPlaceholder")}</option>
                    {snsPlatformOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <input
                    className="site-input"
                    type="text"
                    disabled={!state.applicantInfo.snsPlatform || state.applicantInfo.snsPlatform === "none"}
                    value={state.applicantInfo.snsId}
                    onChange={setApplicantField("snsId")}
                    placeholder={t("apply.snsIdPlaceholder")}
                  />
                </div>
                {state.applicantInfo.snsPlatform === "other" ? (
                  <div className="site-field__compound site-field__compound--single">
                    <input
                      className="site-input"
                      type="text"
                      value={state.applicantInfo.snsOtherPlatform}
                      onChange={setApplicantField("snsOtherPlatform")}
                      placeholder={t("apply.snsOtherPlatformPlaceholder")}
                    />
                  </div>
                ) : null}
              </label>
              <label className="site-field site-field--full">
                <span className="site-field__label">
                  {t("apply.introduction")}
                  <span className="site-field__requirement">({t("apply.optional")})</span>
                </span>
                <textarea
                  className="site-input site-input--textarea"
                  maxLength={introductionMaxLength}
                  onChange={setApplicantField("introduction")}
                  placeholder={t("apply.introductionPlaceholder")}
                  rows={4}
                  value={state.applicantInfo.introduction}
                />
                <span className="site-field__hint site-field__hint--align-end">
                  {`${state.applicantInfo.introduction.length}/${introductionMaxLength}`}
                </span>
              </label>
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
                <div className={`site-input site-file-picker ${fileError ? "site-input--error" : ""}`.trim()}>
                  <input
                    className="site-file-picker__input"
                    ref={documentFileInputRef}
                    type="file"
                    accept={documentFileInputAccept}
                    onChange={handleFileChange("document")}
                  />
                  <span
                    className={`site-file-picker__value ${
                      state.uploadedFileMeta.originalFilename ? "" : "site-file-picker__value--placeholder"
                    }`.trim()}
                  >
                    {state.uploadedFileMeta.originalFilename ||
                      t("apply.noFileSelected")}
                  </span>
                  <button
                    className="site-file-picker__trigger"
                    type="button"
                    onClick={() => documentFileInputRef.current?.click()}
                    aria-label={t("apply.submitFile")}
                  >
                    <img
                      className="site-file-picker__trigger-icon"
                      src={uploadIcon}
                      alt=""
                    />
                  </button>
                </div>
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
              <label className="site-field">
                <span className="site-field__label">
                  {t("apply.submitAudioFile")}
                  <span className="site-field__requirement">({t("apply.optional")})</span>
                </span>
                <div className={`site-input site-file-picker ${audioFileError ? "site-input--error" : ""}`.trim()}>
                  <input
                    className="site-file-picker__input"
                    ref={audioFileInputRef}
                    type="file"
                    accept={audioFileInputAccept}
                    onChange={handleFileChange("audio")}
                  />
                  <span
                    className={`site-file-picker__value ${
                      state.uploadedAudioFileMeta.originalFilename ? "" : "site-file-picker__value--placeholder"
                    }`.trim()}
                  >
                    {state.uploadedAudioFileMeta.originalFilename ||
                      t("apply.noFileSelected")}
                  </span>
                  <button
                    className="site-file-picker__trigger"
                    type="button"
                    onClick={() => audioFileInputRef.current?.click()}
                    aria-label={t("apply.submitAudioFile")}
                  >
                    <img
                      className="site-file-picker__trigger-icon"
                      src={uploadIcon}
                      alt=""
                    />
                  </button>
                </div>
                {audioFileError ? (
                  <span className="site-field__error">{audioFileError}</span>
                ) : null}
                <span className="site-field__hint">
                  {t("apply.audioFileHint")}
                </span>
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
          <Link className="site-notice__link" to="/apply/guide">
            {t("common.viewApplyGuide")}
          </Link>
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
