import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/common/Button";
import { PageShell } from "../components/layout/PageShell";
import { useSpectatorFlow, spectatorFlowSteps } from "../context/SpectatorFlowContext";
import { spectatorConsentItems } from "../data/spectatorConsentContent";
import { updateSpectatorConsents } from "../lib/applicationApi";

export function SpectatorConsentPage() {
  const navigate = useNavigate();
  const { state, dispatch } = useSpectatorFlow();
  const [expandedKey, setExpandedKey] = useState("privacy");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const items = useMemo(
    () => spectatorConsentItems,
    [],
  );
  const requiredAccepted = state.consents.privacy && state.consents.refund;
  const allAccepted = items.every((item) => state.consents[item.key]);

  function toggleConsent(key) {
    dispatch({ type: "SET_CONSENTS", payload: { [key]: !state.consents[key] } });
  }

  async function handleContinue() {
    if (!requiredAccepted) return;
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
        <article className="site-document site-consent-page site-spectator-consent">
          <p className="site-kicker">CONSENT</p>
          <h1>참관객 동의 사항</h1>
          <p>필수 항목에 동의해야 결제를 진행할 수 있습니다. 마케팅 및 사진·동영상 콘텐츠 활용 동의는 선택 항목입니다.</p>
          <label className="site-consent-page__all">
            <input type="checkbox" checked={allAccepted} onChange={() => dispatch({ type: "SET_CONSENTS", payload: Object.fromEntries(items.map((item) => [item.key, !allAccepted])) })} />
            <strong>전체 동의</strong>
          </label>
          <div className="site-consent-list">
            {items.map((item) => (
              <section className="site-consent-item" key={item.key}>
                <div className="site-consent-item__heading">
                  <label><input type="checkbox" checked={Boolean(state.consents[item.key])} onChange={() => toggleConsent(item.key)} /><strong>[{item.required ? "필수" : "선택"}] {item.title}</strong></label>
                  <button type="button" onClick={() => setExpandedKey(expandedKey === item.key ? "" : item.key)}>{expandedKey === item.key ? "접기" : "내용 보기"}</button>
                </div>
                {expandedKey === item.key ? <div className="site-consent-item__content">{item.content}</div> : null}
              </section>
            ))}
          </div>
          <div className="site-inline-actions">
            <Button variant="ghost" onClick={() => navigate("/apply/spectator")}>이전</Button>
            <Button disabled={!requiredAccepted || isSubmitting} onClick={handleContinue}>{isSubmitting ? "저장 중" : "신청 내용 확인"}</Button>
          </div>
          {errorMessage ? <p className="site-error-message">{errorMessage}</p> : null}
        </article>
      </section>
    </PageShell>
  );
}
