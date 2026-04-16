import { useNavigate } from "react-router-dom";
import { Button } from "../components/common/Button";
import { Checkbox } from "../components/common/Checkbox";
import { Input } from "../components/common/Input";
import { NoticeBox } from "../components/common/NoticeBox";
import { PageShell } from "../components/layout/PageShell";
import { useApplicationFlow } from "../context/ApplicationFlowContext";

export function ApplyPage() {
  const navigate = useNavigate();
  const { state, dispatch } = useApplicationFlow();

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
    const file = event.target.files?.[0];

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

  const handleSubmit = (event) => {
    event.preventDefault();
    navigate("/apply/review");
  };

  return (
    <PageShell>
      <section className="site-page">
        <div className="site-form-layout">
          <aside className="site-form-layout__sidebar">
            <NoticeBox title="신청 전 확인사항">
              <ul className="site-list">
                <li>이 단계는 프론트 뼈대이며, 이후 draft 저장 API와 연결할 예정입니다.</li>
                <li>파일은 서버 업로드 전이라 현재는 메타데이터만 보관합니다.</li>
                <li>개인정보, 환불 규정, 참가 유의사항 동의는 결제 전 필수로 유지합니다.</li>
              </ul>
            </NoticeBox>
            <NoticeBox title="파일 업로드 주의">
              <ul className="site-list">
                <li>허용 확장자와 MIME 검증은 백엔드에서 별도 강제해야 합니다.</li>
                <li>운영 단계에서는 랜덤 파일명과 웹 루트 밖 저장을 적용하는 것이 맞습니다.</li>
              </ul>
            </NoticeBox>
          </aside>

          <form className="site-form-card" onSubmit={handleSubmit}>
            <div className="site-form-card__header">
              <p className="site-kicker">Application</p>
              <h1>신청 정보 입력</h1>
              <p>실사용 화면이므로 장식보다 입력 정확성과 검토 편의성을 우선한 구조입니다.</p>
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

            <div className="site-consent-group">
              <Checkbox label="개인정보 수집 및 이용 동의" checked={state.consents.privacy} onChange={setConsent("privacy")} required />
              <Checkbox label="참가 유의사항 동의" checked={state.consents.terms} onChange={setConsent("terms")} required />
              <Checkbox label="환불 규정 동의" checked={state.consents.refund} onChange={setConsent("refund")} required />
              <Checkbox label="마케팅 정보 수신 동의" checked={state.consents.marketing} onChange={setConsent("marketing")} />
            </div>

            <div className="site-form-card__actions">
              <Button type="submit">다음 단계로</Button>
            </div>
          </form>
        </div>
      </section>
    </PageShell>
  );
}
