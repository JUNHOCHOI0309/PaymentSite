import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "../components/common/Button";
import { Checkbox } from "../components/common/Checkbox";
import { Input } from "../components/common/Input";
import { NoticeBox } from "../components/common/NoticeBox";
import { PageShell } from "../components/layout/PageShell";
import { useApplicationFlow } from "../context/ApplicationFlowContext";
import { buildApiUrl, createDraft, updateDraft, uploadFile } from "../lib/applicationApi";

function getRegisterImageUrl(key) {
  return buildApiUrl(`/api/home/gallery-image?key=${encodeURIComponent(key)}`);
}

export function ApplyPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { state, dispatch } = useApplicationFlow();
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);

  const competitionName = searchParams.get("discipline") || "대회명";
  const selectedImageKey = searchParams.get("imageKey");

  const setApplicantField = (field) => (event) => {
    dispatch({
      type: "SET_APPLICANT_FIELD",
      field,
      value: event.target.value,
    });
  };

  const setConsent = (field) => (event) => {
    dispatch({
      type: "TOGGLE_CONSENT",
      field,
      value: event.target.checked,
    });
  };

  const handleFileChange = (event) => {
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
  };

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

      navigate("/apply/review");
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
             &lt; 뒤로가기
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
              <p>입력값을 draft로 먼저 저장하고, review 단계에서 결제 주문을 생성하는 흐름입니다.</p>
            </div>

            <div className="site-form-grid">
              <Input label="성함" value={state.applicantInfo.name} onChange={setApplicantField("name")} required />
              <Input label="연락처" value={state.applicantInfo.phone} onChange={setApplicantField("phone")} placeholder="010-0000-0000" required />
              <Input label="이메일" type="email" value={state.applicantInfo.email} onChange={setApplicantField("email")} required />
              <Input label="생년월일" type="date" value={state.applicantInfo.birthDate} onChange={setApplicantField("birthDate")} required />
              <Input label="소속" value={state.applicantInfo.organization} onChange={setApplicantField("organization")} />
              <label className="site-field">
                <span className="site-field__label">제출 파일</span>
                <input className="site-input site-input--file" type="file" onChange={handleFileChange} />
                <span className="site-field__hint">
                  {state.uploadedFileMeta.originalFilename || "선택된 파일이 없습니다."}
                </span>
              </label>
            </div>

            <div className="site-apply-detail__form-lower">
              <div className="site-apply-detail__submit-area">
                <div className="site-consent-group">
                  <Checkbox label="개인정보 수집 및 이용 동의 (필수)" checked={state.consents.privacy} onChange={setConsent("privacy")} required />
                  <Checkbox label="참가 유의사항 동의 (필수)" checked={state.consents.terms} onChange={setConsent("terms")} required />
                  <Checkbox label="환불 규정 동의 (필수)" checked={state.consents.refund} onChange={setConsent("refund")} required />
                  <Checkbox label="마케팅 정보 수신 동의 (선택)" checked={state.consents.marketing} onChange={setConsent("marketing")} />
                </div>

                <div className="site-form-card__actions">
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "저장 중..." : "다음 단계로"}
                  </Button>
                </div>
                {errorMessage ? <p className="site-error-message">{errorMessage}</p> : null}
              </div>

              <aside className="site-apply-detail__upload-notice">
                <h2>파일 업로드 주의사항</h2>
                <p>허용된 문서 파일만 업로드할 수 있고 파일 크기 제한이 적용됩니다.</p>
                <p>실제 저장 파일명은 서버에서 별도 object key로 생성됩니다.</p>
              </aside>
            </div>
          </form>
        </div>

        <NoticeBox title="신청 전 확인 사항">
          <ul className="site-list">
            <li>이 단계에서 draft를 생성하거나 수정한 뒤 review 단계로 이동합니다.</li>
            <li>첨부 파일은 draft 저장 뒤 서버를 거쳐 외부 스토리지에 업로드됩니다.</li>
            <li>개인정보, 환불 규정, 참가 유의사항 동의는 결제 전에 필수로 저장됩니다.</li>
          </ul>
        </NoticeBox>
      </section>
    </PageShell>
  );
}
