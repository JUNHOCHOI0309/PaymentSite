import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/common/Button";
import { ApplicationFlowStepper } from "../components/common/ApplicationFlowStepper";
import { PageShell } from "../components/layout/PageShell";
import { useSpectatorFlow, spectatorFlowSteps } from "../context/SpectatorFlowContext";
import { spectatorConsentItems } from "../data/spectatorConsentContent";
import { updateSpectatorConsents } from "../lib/applicationApi";

export function SpectatorConsentPage({ preview = false }) {
  const navigate = useNavigate();
  const { state, dispatch } = useSpectatorFlow();
  const [expandedKey, setExpandedKey] = useState("privacy");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [previewConsents, setPreviewConsents] = useState({
    privacy: false,
    refund: false,
    marketing: false,
    photoVideo: false,
  });
  const activeConsents = preview ? previewConsents : state.consents;
  const items = useMemo(
    () => spectatorConsentItems,
    [],
  );
  const requiredAccepted = items
    .filter((item) => item.required)
    .every((item) => activeConsents[item.key]);
  const allAccepted = items.every((item) => activeConsents[item.key]);

  function toggleConsent(key) {
    if (preview) {
      setPreviewConsents((current) => ({ ...current, [key]: !current[key] }));
      return;
    }

    dispatch({ type: "SET_CONSENTS", payload: { [key]: !state.consents[key] } });
  }

  function toggleAllConsents() {
    const payload = Object.fromEntries(items.map((item) => [item.key, !allAccepted]));

    if (preview) {
      setPreviewConsents((current) => ({ ...current, ...payload }));
      return;
    }

    dispatch({ type: "SET_CONSENTS", payload });
  }

  async function handleContinue() {
    if (!requiredAccepted) return;

    if (preview) {
      navigate("/preview/spectator/review");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");
    try {
      await updateSpectatorConsents(state.draftId, {
        consents: { ...state.consents, version: "spectator-v1" },
      });
      dispatch({ type: "SET_FLOW_STEP", value: spectatorFlowSteps.REVIEW });
      navigate("/apply/spectator/review");
    } catch (error) {
      setErrorMessage(error.message || "동의 사항을 저장하지 못했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <PageShell>
      <section className="site-page site-page--narrow">
        <ApplicationFlowStepper currentStep={2} type="spectator" />
        <article className="site-document site-consent-page site-spectator-consent">
          <p className="site-kicker">CONSENT</p>
          <h1>참관객 동의 사항</h1>
          <p>개인정보 수집 및 이용 동의와 환불 규정 동의는 필수이며, 마케팅 정보 수신 및 사진·동영상 콘텐츠 사용 동의는 선택 항목입니다.</p>
          <label className="site-consent-page__all">
            <input type="checkbox" checked={allAccepted} onChange={toggleAllConsents} />
            <strong>전체 동의</strong>
          </label>
          <div className="site-consent-list">
            {items.map((item) => (
              <section className="site-consent-item" key={item.key}>
                <div className="site-consent-item__heading">
                  <label><input type="checkbox" checked={Boolean(activeConsents[item.key])} onChange={() => toggleConsent(item.key)} /><strong>[{item.required ? "필수" : "선택"}] {item.title}</strong></label>
                  <button type="button" onClick={() => setExpandedKey(expandedKey === item.key ? "" : item.key)}>{expandedKey === item.key ? "접기" : "내용 보기"}</button>
                </div>
                {expandedKey === item.key ? (
                  <div className="site-consent-item__content">
                    {item.notice ? <p className="site-consent-page__policy-notice">{item.notice}</p> : null}
                    {item.content}
                  </div>
                ) : null}
              </section>
            ))}
          </div>
          <div className="site-inline-actions site-flow-actions">
            <Button variant="ghost" onClick={() => navigate("/apply/spectator")}>이전</Button>
            <Button disabled={!requiredAccepted || isSubmitting} onClick={handleContinue}>{isSubmitting ? "저장 중" : "신청 내용 확인으로 계속"}</Button>
          </div>
          {errorMessage ? <p className="site-error-message">{errorMessage}</p> : null}
        </article>
      </section>
    </PageShell>
  );
}
