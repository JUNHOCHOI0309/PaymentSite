import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "../components/common/Button";
import { Input } from "../components/common/Input";
import { NoticeBox } from "../components/common/NoticeBox";
import { PageShell } from "../components/layout/PageShell";
import { useApplicationFlow } from "../context/ApplicationFlowContext";
import { additionalInfoByImageKey, defaultAdditionalInfo } from "../data/applicationAdditionalInfo";
import { buildApiUrl, createDraft, updateDraft, uploadFile } from "../lib/applicationApi";

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

export function ApplyPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { state, dispatch, isHydrated } = useApplicationFlow();
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);

  const selectedDivision = searchParams.get("division") || "";
  const competitionName = searchParams.get("discipline") || "대회명";
  const selectedImageKey = searchParams.get("imageKey") || "";
  const additionalInfo = additionalInfoByImageKey[selectedImageKey] || defaultAdditionalInfo;
  const [additionalInfoTitlePrimary, additionalInfoTitleSecondary] = splitDisplayTitle(
    additionalInfo.title,
  );

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

    if (!hasSavedSelection || !isSameSelection) {
      dispatch({ type: "RESET_APPLICATION_FLOW" });
      dispatch({ type: "SET_SELECTION", value: incomingSelection });
      setSelectedFile(null);
      setErrorMessage("");
    }
  }, [
    dispatch,
    isHydrated,
    searchParams,
    selectedDivision,
    selectedImageKey,
    state.selection,
  ]);

  function setApplicantField(field) {
    return (event) => {
      dispatch({
        type: "SET_APPLICANT_FIELD",
        field,
        value:
          field === "phone"
            ? formatPhoneNumber(event.target.value)
            : event.target.value,
      });
    };
  }

  function handleFileChange(event) {
    const file = event.target.files?.[0] || null;
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
    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const payload = {
        name: state.applicantInfo.name,
        phone: state.applicantInfo.phone,
        email: state.applicantInfo.email,
        birthDate: state.applicantInfo.birthDate,
        organization: state.applicantInfo.organization,
        paymentMethod: state.paymentMethod,
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
              <img src={getRegisterImageUrl(selectedImageKey)} alt={competitionName} />
            ) : (
              <div className="site-apply-detail__image-placeholder">대회 이미지</div>
            )}
          </aside>

          <form className="site-form-card site-apply-detail__form" onSubmit={handleSubmit}>
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
                required
              />
              <Input
                label="연락처"
                requirement="필수"
                value={state.applicantInfo.phone}
                onChange={setApplicantField("phone")}
                placeholder="010-0000-0000"
                required
              />
              <Input
                label="이메일"
                requirement="필수"
                type="email"
                value={state.applicantInfo.email}
                onChange={setApplicantField("email")}
                required
              />
              <Input
                label="생년월일"
                requirement="필수"
                type="date"
                value={state.applicantInfo.birthDate}
                onChange={setApplicantField("birthDate")}
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
                  onChange={handleFileChange}
                />
                <span className="site-field__hint">
                  {state.uploadedFileMeta.originalFilename ||
                    "선택된 파일이 없습니다."}
                </span>
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
                    허용된 문서 파일만 업로드할 수 있고 파일 크기 제한이
                    적용됩니다. 실제 저장 파일명은 서버에서 별도 object key로
                    생성됩니다.
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
            <li>개인정보, 환불 규정, 참가 유의사항 동의는 다음 단계에서 필수로 확인됩니다.</li>
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
