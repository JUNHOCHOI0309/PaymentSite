import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "../components/common/Button";
import { Input } from "../components/common/Input";
import { NoticeBox } from "../components/common/NoticeBox";
import { PageShell } from "../components/layout/PageShell";
import { useApplicationFlow } from "../context/ApplicationFlowContext";
import {
  additionalInfoByImageKey,
  defaultAdditionalInfo,
} from "../data/applicationAdditionalInfo";
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
  };
}

function getUploadExtension(filename) {
  const match = String(filename || "").match(/(\.[^.]+)$/);
  return match ? match[1].toLowerCase() : "";
}

function validateSelectedFile(file) {
  if (!file) {
    return "";
  }

  const extension = getUploadExtension(file.name);

  if (
    !allowedUploadExtensions.has(extension) ||
    !allowedUploadMimeTypes.has(file.type)
  ) {
    return "PDF, DOC, DOCX, PPT, PPTX, JPG, JPEG, PNG 파일만 업로드할 수 있습니다.";
  }

  if (!Number.isFinite(file.size) || file.size <= 0) {
    return "빈 파일은 업로드할 수 없습니다.";
  }

  if (file.size > maxUploadBytes) {
    return "파일 크기는 10MB 이하여야 합니다.";
  }

  return "";
}

export function ApplyPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { state, dispatch, isHydrated } = useApplicationFlow();
  const handledLocationKeyRef = useRef("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileError, setFileError] = useState("");
  const [fieldErrors, setFieldErrors] = useState(getInitialFieldErrors);

  const selectedDivision = searchParams.get("division") || "";
  const competitionName = searchParams.get("discipline") || "대회명";
  const selectedImageKey = searchParams.get("imageKey") || "";
  const additionalInfo =
    additionalInfoByImageKey[selectedImageKey] || defaultAdditionalInfo;
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

  function validateApplicantField(field, value) {
    const normalizedValue = typeof value === "string" ? value.trim() : value;

    switch (field) {
      case "name":
        return normalizedValue ? "" : "성함을 입력해 주세요.";
      case "phone": {
        const digits = String(value || "").replace(/\D/g, "");
        return digits.length === 11 ? "" : "연락처를 정확히 입력해 주세요.";
      }
      case "email":
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(normalizedValue || ""))
          ? ""
          : "이메일 형식을 확인해 주세요.";
      case "birthDate":
        return normalizedValue ? "" : "생년월일을 입력해 주세요.";
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
    const validationMessage = validateSelectedFile(file);

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
      const validationMessage = validateSelectedFile(selectedFile);

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
      setErrorMessage(error.message || "신청 초안 저장에 실패했습니다.");
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
              {"< 뒤로가기"}
            </Link>
            <h1>{competitionName}</h1>
            {selectedImageKey ? (
              <img
                src={getRegisterImageUrl(selectedImageKey)}
                alt={competitionName}
              />
            ) : (
              <div className="site-apply-detail__image-placeholder">
                대회 이미지
              </div>
            )}
          </aside>

          <form
            className="site-form-card site-apply-detail__form"
            onSubmit={handleSubmit}
          >
            <div className="site-form-card__header">
              <p className="site-kicker">Application</p>
              <h1>신청 정보 입력</h1>
              <p>
                입력값을 draft로 먼저 저장하고 review 단계 전에 동의 사항을
                확인하는 흐름입니다.
              </p>
            </div>

            <div className="site-form-grid">
              <Input
                label="성함"
                requirement="필수"
                value={state.applicantInfo.name}
                onChange={setApplicantField("name")}
                error={fieldErrors.name}
                required
              />
              <Input
                label="연락처"
                requirement="필수"
                value={state.applicantInfo.phone}
                onChange={setApplicantField("phone")}
                error={fieldErrors.phone}
                placeholder="010-0000-0000"
                required
              />
              <Input
                label="이메일"
                requirement="필수"
                type="email"
                value={state.applicantInfo.email}
                onChange={setApplicantField("email")}
                error={fieldErrors.email}
                required
              />
              <Input
                label="생년월일"
                requirement="필수"
                type="date"
                value={state.applicantInfo.birthDate}
                onChange={setApplicantField("birthDate")}
                error={fieldErrors.birthDate}
                required
              />
              <Input
                label="소속"
                requirement="선택"
                value={state.applicantInfo.organization}
                onChange={setApplicantField("organization")}
              />
              <label className="site-field">
                <span className="site-field__label">
                  제출 파일
                  <span className="site-field__requirement">(선택)</span>
                </span>
                <input
                  className="site-input site-input--file"
                  type="file"
                  accept={fileInputAccept}
                  onChange={handleFileChange}
                />
                <span className="site-field__hint">
                  {state.uploadedFileMeta.originalFilename ||
                    "선택된 파일이 없습니다."}
                </span>
                {fileError ? (
                  <span className="site-field__error">{fileError}</span>
                ) : null}
                <div className="site-file-help">
                  <button
                    className="site-file-help__trigger"
                    type="button"
                    aria-label="파일 업로드 주의사항"
                  >
                    i
                  </button>
                  <span className="site-file-help__label">
                    파일 업로드 주의사항
                  </span>
                  <div className="site-file-help__tooltip" role="tooltip">
                    허용 확장자: PDF, DOC, DOCX, PPT, PPTX, JPG, JPEG, PNG
                    <br />
                    최대 파일 크기: 10MB
                    <br />
                    실제 저장 파일명은 서버에서 별도 object key로 생성됩니다.
                  </div>
                </div>
              </label>
            </div>

            <div className="site-apply-detail__form-lower">
              <div className="site-apply-detail__submit-area">
                <div className="site-form-card__actions">
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "저장 중..." : "다음 단계로"}
                  </Button>
                </div>
                {errorMessage ? (
                  <p className="site-error-message">{errorMessage}</p>
                ) : null}
              </div>
            </div>
          </form>
        </div>

        <NoticeBox title="신청 전 확인 사항">
          <ul className="site-list">
            <li>이 단계에서 draft를 생성하거나 수정한 뒤 동의 단계로 이동합니다.</li>
            <li>첨부 파일은 draft 저장 이후 서버를 거쳐 별도 object key로 업로드됩니다.</li>
            <li>개인정보, 환불 규정, 참가 유의사항 동의는 다음 단계에서 확인합니다.</li>
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
