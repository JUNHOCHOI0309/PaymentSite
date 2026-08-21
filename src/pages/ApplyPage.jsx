import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "../components/common/Button";
import { Input } from "../components/common/Input";
import { NoticeBox } from "../components/common/NoticeBox";
import { PageShell } from "../components/layout/PageShell";
import documentSelectIcon from "../assets/document-select-icon.png";
import imageSelectIcon from "../assets/image-select-icon.png";
import { useApplicationFlow } from "../context/ApplicationFlowContext";
import { useLanguage } from "../context/LanguageContext";
import { getApplicationAdditionalInfo } from "../data/applicationAdditionalInfo";
import {
  getCanonicalApplicationDisciplineTitle,
  getParticipantGenderFromDivision,
  isCommonApplicationDiscipline,
  normalizeApplicationSelection,
} from "../data/applicationDisciplines";
import {
  formatApplicationEntryFee,
  getApplicationAdditionalDisciplineFee,
  getApplicationEntryFeePricing,
  getApplicationEntryFeeSchedule,
} from "../data/applicationEntryFees";
import { getPaymentMaintenanceNotice } from "../data/paymentMaintenance";
import { getWeightClassOptions } from "../data/applicationWeightClassOptions";
import {
  getSnsPlatformOptions,
  parseStoredSnsIdentity,
  serializeDetailedSnsIdentity,
} from "../lib/applicationSns";
import {
  createEmailAddress,
  directEmailDomainValue,
  parseEmailAddress,
  presetEmailDomains,
} from "../lib/emailAddress";
import {
  buildPublicMediaUrl,
  createDraft,
  getApplicationEmailVerificationStatus,
  sendApplicationEmailVerificationCode,
  updateDraft,
  uploadFile,
  verifyApplicationEmailVerificationCode,
} from "../lib/applicationApi";
import { applicationFlowSteps } from "../lib/applicationFlowAccess";

const maxUploadBytes = 10 * 1024 * 1024;
const maxDocumentUploadFiles = 5;
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
  ".pdf,.doc,.docx,.ppt,.pptx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation";
const imageFileInputAccept = ".jpg,.jpeg,.png,image/jpeg,image/png";
const introductionMaxLength = 100;

function getRegisterImageUrl(key) {
  return buildPublicMediaUrl(key);
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

function getScheduledWeightClassFee(period, imageKey, weightClass) {
  return Number(
    period?.disciplineWeightClassAmounts?.[imageKey]?.[weightClass] ??
      period?.disciplineAmounts?.[imageKey] ??
      period?.amount ??
      0,
  );
}

function getInitialFieldErrors() {
  return {
    name: "",
    phone: "",
    email: "",
    birthDate: "",
    weightClass: "",
    participantGender: "",
  };
}

function getUploadExtension(filename) {
  const match = String(filename || "").match(/(\.[^.]+)$/);
  return match ? match[1].toLowerCase() : "";
}

function getCompactFilename(filename, maxLength = 20) {
  const normalizedFilename = String(filename || "");

  if (normalizedFilename.length <= maxLength) {
    return normalizedFilename;
  }

  const extension = getUploadExtension(normalizedFilename);
  const filenameWithoutExtension = extension
    ? normalizedFilename.slice(0, -extension.length)
    : normalizedFilename;
  const filenameLimit = Math.max(6, maxLength - extension.length - 3);

  return `${filenameWithoutExtension.slice(0, filenameLimit)}...${extension}`;
}

function getSelectedDocumentSummary(filenames, locale) {
  if (!filenames.length) {
    return "";
  }

  const firstFilename = getCompactFilename(filenames[0]);

  if (filenames.length === 1) {
    return firstFilename;
  }

  return locale === "ko"
    ? `${firstFilename} 외 ${filenames.length - 1}개`
    : `${firstFilename} + ${filenames.length - 1} more`;
}

function validateSelectedFile(file, t) {
  if (!file) {
    return "";
  }

  const extension = getUploadExtension(file.name);
  if (
    !allowedDocumentUploadExtensions.has(extension) ||
    !allowedDocumentUploadMimeTypes.has(file.type)
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

function getDocumentFileCountMessage(locale) {
  return locale === "en"
    ? `You can select up to ${maxDocumentUploadFiles} submission files.`
    : `제출 파일은 최대 ${maxDocumentUploadFiles}개까지 선택할 수 있습니다.`;
}

function getDocumentFileLimitDescription(locale) {
  return locale === "en"
    ? `Maximum submission files: ${maxDocumentUploadFiles}`
    : `제출 파일 최대 개수: ${maxDocumentUploadFiles}개`;
}

function validateSelectedDocumentFiles(files, locale, t) {
  if (files.length > maxDocumentUploadFiles) {
    return getDocumentFileCountMessage(locale);
  }

  return files
    .map((file) => validateSelectedFile(file, t))
    .find(Boolean) || "";
}

export function ApplyPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const documentFileInputRef = useRef(null);
  const imageFileInputRef = useRef(null);
  const { state, dispatch, isHydrated } = useApplicationFlow();
  const { locale, t } = useLanguage();
  const handledLocationKeyRef = useRef("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [fileError, setFileError] = useState("");
  const [fieldErrors, setFieldErrors] = useState(getInitialFieldErrors);
  const initialEmailAddress = parseEmailAddress(state.applicantInfo.email);
  const [emailLocalPart, setEmailLocalPart] = useState(initialEmailAddress.localPart);
  const [emailDomainSelection, setEmailDomainSelection] = useState(
    initialEmailAddress.domainSelection
  );
  const [emailCustomDomain, setEmailCustomDomain] = useState(initialEmailAddress.customDomain);
  const [emailVerificationCode, setEmailVerificationCode] = useState("");
  const [emailVerificationStatus, setEmailVerificationStatus] = useState("idle");
  const [emailVerificationMessage, setEmailVerificationMessage] = useState("");
  const [isSendingEmailVerification, setIsSendingEmailVerification] = useState(false);
  const [isVerifyingEmail, setIsVerifyingEmail] = useState(false);

  const selectedDivision = searchParams.get("division") || "";
  const selectedImageKey = searchParams.get("imageKey") || "";
  const competitionName =
    getCanonicalApplicationDisciplineTitle({
      imageKey: selectedImageKey,
      discipline: searchParams.get("discipline") || "",
    }) || t("apply.fallbackCompetition");
  const isCommonDiscipline = isCommonApplicationDiscipline({
    imageKey: selectedImageKey,
    discipline: competitionName,
  });
  const defaultParticipantGender = getParticipantGenderFromDivision(selectedDivision);
  const additionalInfo = getApplicationAdditionalInfo(locale, selectedImageKey);
  const weightClassOptions = getWeightClassOptions(selectedImageKey);
  const hasWeightClassOptions = weightClassOptions.length > 0;
  const isModelDiscipline = selectedImageKey === "register/common_1.png";
  const isFixedEntryFeeDiscipline = [
    "register/common_3.png",
    "register/common_4.png",
  ].includes(selectedImageKey);
  const entryFeePricing = getApplicationEntryFeePricing(
    selectedImageKey,
    state.applicantInfo.weightClass,
  );
  const additionalDisciplineFee = getApplicationAdditionalDisciplineFee();
  const entryFeeSchedule = getApplicationEntryFeeSchedule();
  const entryFeeCopy =
    locale === "ko"
      ? {
          firstDiscipline: "첫 종목 참가비",
          additionalDiscipline: "두 번째 종목부터 종목당",
          finalPrice: "현재 적용가",
        }
      : {
          firstDiscipline: "First discipline fee",
          additionalDiscipline: "Each additional discipline",
          finalPrice: "Current price",
        };
  const entryFeeNoticeCopy =
    locale === "ko"
      ? {
          period: "신청 기간",
          firstDiscipline: "첫 종목 참가비",
          additionalDiscipline: "추가 종목 참가비",
          consent:
            "이 단계에서 신청 정보를 저장한 뒤, 다음 단계에서 개인정보, 환불 규정, 참가 유의사항 동의를 확인합니다.",
        }
      : {
          period: "Application period",
          firstDiscipline: "First discipline fee",
          additionalDiscipline: "Additional discipline fee",
          consent:
            "Save your application details in this step, then review the privacy, refund policy, and participation terms consents in the next step.",
        };
  const modelFeeTableCopy =
    locale === "ko"
      ? {
          title: "모델 체급별 참가비",
          class: "구분",
          earlyBird: "얼리버드",
          firstRegistration: "1차 참가접수",
          finalRegistration: "최종 참가접수",
          open: "오픈",
          openDescription: "스포츠모델 오픈 / 커머셜모델 오픈",
          noviceAndSenior: "노비스 · 시니어",
          noviceAndSeniorDescription: "스포츠모델 노비스 / 커머셜모델 노비스 / 시니어",
        }
      : {
          title: "Model class entry fees",
          class: "Class",
          earlyBird: "Early bird",
          firstRegistration: "First registration",
          finalRegistration: "Final registration",
          open: "Open",
          openDescription: "Sports Model Open / Commercial Model Open",
          noviceAndSenior: "Novice / Senior",
          noviceAndSeniorDescription:
            "Sports Model Novice / Commercial Model Novice / Senior",
        };
  const fixedEntryFeeCopy =
    locale === "ko"
      ? {
          title: `${competitionName} 고정 참가비 안내`,
          description: "모든 참가 접수 기간에 아래 참가비가 동일하게 적용됩니다.",
          period: "적용 기간",
          allPeriods: "모든 참가 접수 기간",
          firstDiscipline: "첫 종목 참가비",
          additionalDiscipline: "추가 종목 참가비",
        }
      : {
          title: `${competitionName} fixed entry fee`,
          description: "The following entry fees apply throughout every registration period.",
          period: "Applicable period",
          allPeriods: "All registration periods",
          firstDiscipline: "First discipline fee",
          additionalDiscipline: "Additional discipline fee",
        };
  const modelFeeTableRows = [
    {
      id: "open",
      label: modelFeeTableCopy.open,
      description: modelFeeTableCopy.openDescription,
      weightClass: "스포츠모델 오픈",
    },
    {
      id: "novice-senior",
      label: modelFeeTableCopy.noviceAndSenior,
      description: modelFeeTableCopy.noviceAndSeniorDescription,
      weightClass: "스포츠모델 노비스",
    },
  ];
  const getModelPeriodLabel = (period) => {
    switch (period.id) {
      case "2026-early-bird":
        return modelFeeTableCopy.earlyBird;
      case "2026-first-registration":
        return modelFeeTableCopy.firstRegistration;
      case "2026-final-registration":
        return modelFeeTableCopy.finalRegistration;
      default:
        return locale === "ko" ? period.label : period.labelEn || period.label;
    }
  };
  const emailVerificationCopy =
    locale === "ko"
      ? {
          send: "인증번호 전송",
          resend: "인증번호 재전송",
          sending: "전송 중",
          code: "인증번호",
          codePlaceholder: "6자리 인증번호",
          verify: "인증 확인",
          verifying: "확인 중",
          complete: "인증 완료",
          verified: "이메일 인증이 완료되었습니다.",
          required: "다음 단계로 이동하려면 이메일 인증을 완료해 주세요.",
          codeRequired: "이메일로 받은 6자리 인증번호를 입력해 주세요.",
        }
      : {
          send: "Send code",
          resend: "Resend code",
          sending: "Sending",
          code: "Verification code",
          codePlaceholder: "6-digit code",
          verify: "Verify",
          verifying: "Verifying",
          complete: "Verified",
          verified: "Email verification is complete.",
          required: "Complete email verification before continuing.",
          codeRequired: "Enter the 6-digit verification code sent to your email.",
        };
  const emailDomainCopy =
    locale === "ko"
      ? {
          placeholder: "도메인 선택",
          direct: "직접 입력",
          customPlaceholder: "example.com",
        }
      : {
          placeholder: "Select domain",
          direct: "Direct input",
          customPlaceholder: "example.com",
        };
  const snsPlatformOptions = getSnsPlatformOptions(locale);
  const [additionalInfoTitlePrimary, additionalInfoTitleSecondary] =
    splitDisplayTitle(additionalInfo.title);
  const selectedDocumentFilenames = selectedFiles.length
    ? selectedFiles.map((file) => file.name)
    : state.uploadedFileMetas?.length
      ? state.uploadedFileMetas.map((file) => file.originalFilename)
      : state.uploadedFileMeta.originalFilename
        ? [state.uploadedFileMeta.originalFilename]
        : [];
  const selectedDocumentSummary = getSelectedDocumentSummary(selectedDocumentFilenames, locale);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    const parsedEmailAddress = parseEmailAddress(state.applicantInfo.email);
    setEmailLocalPart(parsedEmailAddress.localPart);
    setEmailDomainSelection(parsedEmailAddress.domainSelection);
    setEmailCustomDomain(parsedEmailAddress.customDomain);
  }, [isHydrated]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    const incomingSelection = normalizeApplicationSelection({
      division: selectedDivision,
      discipline: searchParams.get("discipline") || "",
      imageKey: selectedImageKey,
      participantGender: isCommonDiscipline
        ? searchParams.get("participantGender") || defaultParticipantGender
        : "",
    });

    const hasSavedSelection = Object.values(state.selection || {}).some(Boolean);
    const isSameSelection =
      state.selection?.division === incomingSelection.division &&
      state.selection?.discipline === incomingSelection.discipline &&
      state.selection?.imageKey === incomingSelection.imageKey &&
      state.selection?.participantGender === incomingSelection.participantGender;
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
        setSelectedFiles([]);
        setErrorMessage("");
        setFileError("");
        setFieldErrors(getInitialFieldErrors());
        setEmailLocalPart("");
        setEmailDomainSelection("");
        setEmailCustomDomain("");
        resetEmailVerification();
        return;
      }
    }

    if (!hasSavedSelection || !isSameSelection) {
      dispatch({ type: "RESET_APPLICATION_FLOW" });
      dispatch({ type: "SET_SELECTION", value: incomingSelection });
      setSelectedFiles([]);
      setErrorMessage("");
      setFileError("");
      setFieldErrors(getInitialFieldErrors());
      setEmailLocalPart("");
      setEmailDomainSelection("");
      setEmailCustomDomain("");
      resetEmailVerification();
    }
  }, [
    dispatch,
    isHydrated,
    location.key,
    location.state,
    searchParams,
    selectedDivision,
    selectedImageKey,
    isCommonDiscipline,
    defaultParticipantGender,
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
      participantGender:
        isCommonDiscipline && !["male", "female"].includes(state.selection.participantGender)
          ? locale === "ko"
            ? "성별을 선택해 주세요."
            : "Select a gender."
          : "",
    };

    setFieldErrors(nextErrors);
    return !Object.values(nextErrors).some(Boolean);
  }

  function resetEmailVerification() {
    setEmailVerificationCode("");
    setEmailVerificationStatus("idle");
    setEmailVerificationMessage("");
  }

  function updateApplicantEmail({
    localPart = emailLocalPart,
    domainSelection = emailDomainSelection,
    customDomain = emailCustomDomain,
  }) {
    const nextEmail = createEmailAddress({
      localPart,
      domainSelection,
      customDomain,
    });

    setEmailLocalPart(localPart);
    setEmailDomainSelection(domainSelection);
    setEmailCustomDomain(customDomain);

    if (nextEmail !== state.applicantInfo.email) {
      resetEmailVerification();
    }

    dispatch({
      type: "SET_APPLICANT_FIELD",
      field: "email",
      value: nextEmail,
    });
    setFieldErrors((current) => ({
      ...current,
      email: validateApplicantField("email", nextEmail),
    }));
  }

  function setApplicantField(field) {
    return (event) => {
      const nextValue =
        field === "phone"
          ? formatPhoneNumber(event.target.value)
          : event.target.value;

      if (
        (field === "name" || field === "email") &&
        nextValue !== state.applicantInfo[field]
      ) {
        resetEmailVerification();
      }

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

  function handleParticipantGenderChange(event) {
    dispatch({
      type: "SET_SELECTION",
      value: {
        ...state.selection,
        participantGender: event.target.value,
      },
    });
    setFieldErrors((current) => ({
      ...current,
      participantGender: "",
    }));
  }

  function handleEmailLocalPartChange(event) {
    updateApplicantEmail({
      localPart: event.target.value.replace(/[\s@]/g, ""),
    });
  }

  function handleEmailDomainSelectionChange(event) {
    const nextDomainSelection = event.target.value;
    updateApplicantEmail({
      domainSelection: nextDomainSelection,
      customDomain:
        nextDomainSelection === directEmailDomainValue ? emailCustomDomain : "",
    });
  }

  function handleEmailCustomDomainChange(event) {
    updateApplicantEmail({
      customDomain: event.target.value.replace(/[\s@]/g, "").toLowerCase(),
    });
  }

  function handleEmailDomainReset() {
    updateApplicantEmail({
      domainSelection: "",
      customDomain: "",
    });
  }

  function appendSelectedDocumentFiles(files) {
    const nextFiles = [...selectedFiles, ...files];
    const validationMessage = validateSelectedDocumentFiles(nextFiles, locale, t);

    if (validationMessage) {
      setFileError(validationMessage);
      return;
    }

    setFileError("");
    setSelectedFiles(nextFiles);
    dispatch({
      type: "SET_FILE_METAS",
      payload: nextFiles.map((file) => ({
        originalFilename: file.name,
        storedFilename: "",
        mimeType: file.type,
        fileSize: file.size,
      })),
    });
  }

  function handleDocumentFileChange(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    appendSelectedDocumentFiles(files);
  }

  function handleRemoveSelectedDocumentFile(fileIndex) {
    const nextFiles = selectedFiles.filter((_, index) => index !== fileIndex);

    setFileError("");
    setSelectedFiles(nextFiles);
    dispatch({
      type: "SET_FILE_METAS",
      payload: nextFiles.map((file) => ({
        originalFilename: file.name,
        storedFilename: "",
        mimeType: file.type,
        fileSize: file.size,
      })),
    });
  }

  async function handleSendEmailVerification() {
    const nameError = validateApplicantField("name", state.applicantInfo.name);
    const emailError = validateApplicantField("email", state.applicantInfo.email);

    setFieldErrors((current) => ({
      ...current,
      name: nameError,
      email: emailError,
    }));

    if (nameError || emailError) {
      return;
    }

    setEmailVerificationMessage("");
    setIsSendingEmailVerification(true);

    try {
      const response = await sendApplicationEmailVerificationCode({
        name: state.applicantInfo.name,
        email: state.applicantInfo.email,
      });

      setEmailVerificationCode("");
      setEmailVerificationStatus("sent");
      setEmailVerificationMessage(response.message || "");
    } catch (error) {
      setEmailVerificationStatus("idle");
      setEmailVerificationMessage(error.message || t("apply.emailError"));
    } finally {
      setIsSendingEmailVerification(false);
    }
  }

  async function handleVerifyEmail() {
    if (!emailVerificationCode) {
      setEmailVerificationMessage(emailVerificationCopy.codeRequired);
      return;
    }

    setEmailVerificationMessage("");
    setIsVerifyingEmail(true);

    try {
      const response = await verifyApplicationEmailVerificationCode({
        name: state.applicantInfo.name,
        email: state.applicantInfo.email,
        code: emailVerificationCode,
      });

      setEmailVerificationStatus("verified");
      setEmailVerificationMessage(response.message || emailVerificationCopy.verified);
    } catch (error) {
      setEmailVerificationStatus("sent");
      setEmailVerificationMessage(error.message || emailVerificationCopy.codeRequired);
    } finally {
      setIsVerifyingEmail(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setErrorMessage("");
    setFileError("");

    if (!validateApplicantForm()) {
      return;
    }

    try {
      const emailVerification = await getApplicationEmailVerificationStatus({
        name: state.applicantInfo.name,
        email: state.applicantInfo.email,
      });

      if (!emailVerification.verified) {
        setEmailVerificationStatus("idle");
        setEmailVerificationMessage(emailVerificationCopy.required);
        return;
      }

      setEmailVerificationStatus("verified");
    } catch (error) {
      setEmailVerificationMessage(error.message || emailVerificationCopy.required);
      return;
    }

    if (selectedFiles.length) {
      const validationMessage = validateSelectedDocumentFiles(selectedFiles, locale, t);

      if (validationMessage) {
        setFileError(validationMessage);
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

      if (selectedFiles.length) {
        const uploadedFileMetas = [];

        for (const selectedFile of selectedFiles) {
          const fileResponse = await uploadFile({
            draftId,
            file: selectedFile,
          });

          uploadedFileMetas.push({
            originalFilename: fileResponse.file.original_filename,
            storedFilename: fileResponse.file.stored_filename,
            mimeType: fileResponse.file.mime_type,
            fileSize: fileResponse.file.file_size,
          });

          setSelectedFiles((current) => current.filter((file) => file !== selectedFile));
        }

        dispatch({ type: "SET_FILE_METAS", payload: uploadedFileMetas });
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
            <h1
              className={
                String(competitionName || "").replace(/\s/g, "").length >= 13
                  ? "site-apply-detail__title site-apply-detail__title--long"
                  : "site-apply-detail__title"
              }
            >
              {competitionName}
            </h1>
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
              <span>{entryFeeCopy.firstDiscipline}</span>
              <div className="site-apply-detail__price-values">
                {entryFeePricing.isDiscounted ? (
                  <del>{formatApplicationEntryFee(entryFeePricing.originalAmount, locale)}</del>
                ) : null}
                <strong>{formatApplicationEntryFee(entryFeePricing.amount, locale)}</strong>
              </div>
              <p>
                {entryFeeCopy.additionalDiscipline} {formatApplicationEntryFee(additionalDisciplineFee, locale)}
              </p>
            </div>
          </aside>

          <form
            className="site-form-card site-apply-detail__form"
            onSubmit={handleSubmit}
          >
            <div className="site-form-card__header">
              <p className="site-kicker">{t("common.kickerApplication")}</p>
              <h1>{t("apply.title")}</h1>
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
              <label className="site-field site-field--full">
                <span className="site-field__label">
                  {t("apply.email")}
                  <span className="site-field__requirement">({t("apply.required")})</span>
                </span>
                <div className="site-email-verification__email-row">
                  <div className="site-email-address">
                    <input
                      className={`site-input ${fieldErrors.email ? "site-input--error" : ""}`.trim()}
                      type="text"
                      inputMode="email"
                      autoComplete="username"
                      value={emailLocalPart}
                      onChange={handleEmailLocalPartChange}
                      required
                      aria-label={t("apply.email")}
                    />
                    <span className="site-email-address__at" aria-hidden="true">
                      @
                    </span>
                    {emailDomainSelection === directEmailDomainValue ? (
                      <span className="site-email-address__custom-control">
                        <input
                          className={`site-input site-email-address__custom-input ${
                            fieldErrors.email ? "site-input--error" : ""
                          }`.trim()}
                          type="text"
                          inputMode="url"
                          autoComplete="off"
                          value={emailCustomDomain}
                          onChange={handleEmailCustomDomainChange}
                          placeholder={emailDomainCopy.customPlaceholder}
                          aria-label={emailDomainCopy.direct}
                        />
                        <button
                          className="site-email-address__clear"
                          type="button"
                          onClick={handleEmailDomainReset}
                          aria-label={emailDomainCopy.placeholder}
                          title={emailDomainCopy.placeholder}
                        >
                          ×
                        </button>
                      </span>
                    ) : (
                      <select
                        className={`site-input ${fieldErrors.email ? "site-input--error" : ""}`.trim()}
                        value={emailDomainSelection}
                        onChange={handleEmailDomainSelectionChange}
                        aria-label={emailDomainCopy.placeholder}
                      >
                        <option value="">{emailDomainCopy.placeholder}</option>
                        {presetEmailDomains.map((domain) => (
                          <option key={domain} value={domain}>
                            {domain}
                          </option>
                        ))}
                        <option value={directEmailDomainValue}>{emailDomainCopy.direct}</option>
                      </select>
                    )}
                  </div>
                  <Button
                    className="site-email-verification__action"
                    type="button"
                    onClick={handleSendEmailVerification}
                    disabled={isSendingEmailVerification}
                  >
                    {isSendingEmailVerification
                      ? emailVerificationCopy.sending
                      : emailVerificationStatus === "sent"
                        ? emailVerificationCopy.resend
                        : emailVerificationCopy.send}
                  </Button>
                </div>
                {fieldErrors.email ? (
                  <span className="site-field__error">{fieldErrors.email}</span>
                ) : null}
              </label>
              <label className="site-field site-field--full">
                <span className="site-field__label">
                  {emailVerificationCopy.code}
                  <span className="site-field__requirement">({t("apply.required")})</span>
                </span>
                <div className="site-email-verification__code-row">
                  <input
                    className="site-input"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={emailVerificationCode}
                    onChange={(event) => {
                      setEmailVerificationCode(
                        event.target.value.replace(/\D/g, "").slice(0, 6)
                      );
                    }}
                    disabled={emailVerificationStatus === "idle" || emailVerificationStatus === "verified"}
                    placeholder={emailVerificationCopy.codePlaceholder}
                  />
                  <Button
                    className="site-email-verification__action"
                    type="button"
                    onClick={handleVerifyEmail}
                    disabled={
                      emailVerificationStatus !== "sent" ||
                      isVerifyingEmail
                    }
                  >
                    {emailVerificationStatus === "verified"
                      ? emailVerificationCopy.complete
                      : isVerifyingEmail
                        ? emailVerificationCopy.verifying
                        : emailVerificationCopy.verify}
                  </Button>
                </div>
                {emailVerificationMessage ? (
                  <span
                    className={`site-email-verification__message ${
                      emailVerificationStatus === "verified"
                        ? "site-email-verification__message--verified"
                        : ""
                    }`.trim()}
                  >
                    {emailVerificationMessage}
                  </span>
                ) : null}
              </label>
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
              {isCommonDiscipline ? (
                <div className="site-field site-participant-gender">
                  <span className="site-field__label">
                    {locale === "ko" ? "성별" : "Gender"}
                    <span className="site-field__requirement">({t("apply.required")})</span>
                  </span>
                  <div
                    className="site-participant-gender__options"
                    role="radiogroup"
                    aria-label={locale === "ko" ? "성별" : "Gender"}
                  >
                    <label className="site-participant-gender__option">
                      <input
                        type="radio"
                        name="participantGender"
                        value="male"
                        checked={state.selection.participantGender === "male"}
                        onChange={handleParticipantGenderChange}
                      />
                      <span>{locale === "ko" ? "남" : "Male"}</span>
                    </label>
                    <label className="site-participant-gender__option">
                      <input
                        type="radio"
                        name="participantGender"
                        value="female"
                        checked={state.selection.participantGender === "female"}
                        onChange={handleParticipantGenderChange}
                      />
                      <span>{locale === "ko" ? "여" : "Female"}</span>
                    </label>
                  </div>
                  {fieldErrors.participantGender ? (
                    <span className="site-field__error">{fieldErrors.participantGender}</span>
                  ) : null}
                </div>
              ) : null}
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
                    multiple
                    accept={documentFileInputAccept}
                    onChange={handleDocumentFileChange}
                  />
                  <input
                    className="site-file-picker__input"
                    ref={imageFileInputRef}
                    type="file"
                    multiple
                    accept={imageFileInputAccept}
                    onChange={handleDocumentFileChange}
                  />
                  <span
                    className={`site-file-picker__value ${
                      selectedDocumentFilenames.length ? "" : "site-file-picker__value--placeholder"
                    }`.trim()}
                    title={selectedDocumentFilenames.join(", ") || undefined}
                  >
                    {selectedDocumentSummary ||
                      t("apply.noFileSelected")}
                  </span>
                  <div className="site-file-picker__source-actions">
                    <button
                      className="site-file-picker__source-button"
                      type="button"
                      onClick={() => documentFileInputRef.current?.click()}
                    >
                      <img
                        className="site-file-picker__trigger-icon"
                        src={documentSelectIcon}
                        alt=""
                      />
                      {locale === "ko" ? "문서" : "Documents"}
                    </button>
                    <button
                      className="site-file-picker__source-button"
                      type="button"
                      onClick={() => imageFileInputRef.current?.click()}
                    >
                      <img
                        className="site-file-picker__trigger-icon"
                        src={imageSelectIcon}
                        alt=""
                      />
                      <span>{locale === "ko" ? "사진" : "Photos"}</span>
                    </button>
                  </div>
                </div>
                {fileError ? (
                  <span className="site-field__error">{fileError}</span>
                ) : null}
                {selectedDocumentFilenames.length ? (
                  <ul className="site-file-picker__selected-list">
                    {selectedDocumentFilenames.map((filename, index) => (
                      <li key={`${filename}-${index}`}>
                        {selectedFiles.length ? (
                          <button
                            className="site-file-picker__remove"
                            type="button"
                            onClick={() => handleRemoveSelectedDocumentFile(index)}
                            aria-label={
                              locale === "ko"
                                ? `${filename} 삭제`
                                : `Remove ${filename}`
                            }
                            title={locale === "ko" ? "파일 삭제" : "Remove file"}
                          >
                            ×
                          </button>
                        ) : null}
                        <span title={filename}>{getCompactFilename(filename)}</span>
                      </li>
                    ))}
                  </ul>
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
                    {getDocumentFileLimitDescription(locale)}
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
          {isFixedEntryFeeDiscipline ? (
            <>
              <h3 className="site-apply-detail__fee-table-heading site-apply-detail__fee-table-heading--first">
                {fixedEntryFeeCopy.title}
              </h3>
              <p className="site-apply-detail__fixed-fee-description">
                {fixedEntryFeeCopy.description}
              </p>
              <div className="site-apply-detail__fee-table-wrap">
                <table className="site-apply-detail__fee-table site-apply-detail__fee-table--fixed">
                  <thead>
                    <tr>
                      <th>{fixedEntryFeeCopy.period}</th>
                      <th>{fixedEntryFeeCopy.firstDiscipline}</th>
                      <th>{fixedEntryFeeCopy.additionalDiscipline}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>{fixedEntryFeeCopy.allPeriods}</td>
                      <td>
                        <strong>{formatApplicationEntryFee(entryFeePricing.amount, locale)}</strong>
                      </td>
                      <td>{formatApplicationEntryFee(additionalDisciplineFee, locale)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="site-apply-detail__fee-table-wrap">
              <table className="site-apply-detail__fee-table">
                <thead>
                  <tr>
                    <th>{entryFeeNoticeCopy.period}</th>
                    <th>{entryFeeNoticeCopy.firstDiscipline}</th>
                    <th>{entryFeeNoticeCopy.additionalDiscipline}</th>
                  </tr>
                </thead>
                <tbody>
                  {entryFeeSchedule.map((period) => (
                  <tr key={period.id}>
                    <td>{locale === "ko" ? period.label : period.labelEn || period.label}</td>
                    <td>
                      <strong>{formatApplicationEntryFee(period.amount, locale)}</strong>
                    </td>
                    <td>{formatApplicationEntryFee(additionalDisciplineFee, locale)}</td>
                  </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {isModelDiscipline ? (
            <>
              <h3 className="site-apply-detail__fee-table-heading">
                {modelFeeTableCopy.title}
              </h3>
              <div className="site-apply-detail__fee-table-wrap">
                <table className="site-apply-detail__fee-table site-apply-detail__fee-table--model">
                  <thead>
                    <tr>
                      <th>{modelFeeTableCopy.class}</th>
                      {entryFeeSchedule.map((period) => (
                        <th key={period.id}>{getModelPeriodLabel(period)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {modelFeeTableRows.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <strong>{row.label}</strong>
                          <small>{row.description}</small>
                        </td>
                        {entryFeeSchedule.map((period) => (
                          <td key={period.id}>
                            <strong>
                              {formatApplicationEntryFee(
                                getScheduledWeightClassFee(
                                  period,
                                  selectedImageKey,
                                  row.weightClass,
                                ),
                                locale,
                              )}
                            </strong>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
          <p className="site-apply-detail__fee-note">{entryFeeNoticeCopy.consent}</p>
          <p className="site-apply-detail__fee-note">{getPaymentMaintenanceNotice(locale)}</p>
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
                    {section.note ? (
                      <p className="site-apply-detail__additional-note">{section.note}</p>
                    ) : null}
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
