import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "../components/common/Button";
import { PageShell } from "../components/layout/PageShell";
import refundPolicy from "../data/refundPolicy.json";
import {
  getApplicationRefundQuote,
  getStageServiceRefundQuote,
  requestApplicationRefund,
  requestStageServiceRefund,
} from "../lib/applicationApi";

const lookupSessionStorageKey = "mmkorea-lookup-session";

const stageServiceTitles = {
  "stage-photo": "무대 사진 촬영",
  "stage-video": "무대 영상 촬영",
  "hair-makeup": "헤어&메이크업",
};

function formatAmount(value) {
  if (!Number.isFinite(Number(value))) {
    return "-";
  }

  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW",
    maximumFractionDigits: 0,
  }).format(Number(value));
}

function getLookupSession() {
  try {
    const value = window.sessionStorage.getItem(lookupSessionStorageKey);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

export function RefundRequestPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const refundType = searchParams.get("type");
  const targetId = searchParams.get("id");
  const isStageService = refundType === "stage-service";
  const isApplication = refundType === "application";
  const [lookupSession] = useState(getLookupSession);
  const [quote, setQuote] = useState(null);
  const [target, setTarget] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAcknowledged, setIsAcknowledged] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const targetTitle = useMemo(() => {
    if (!target) {
      return isStageService ? "무대 서비스" : "대회 신청";
    }

    if (isStageService) {
      const serviceTitle = stageServiceTitles[target.serviceType] || target.serviceType || "무대 서비스";
      return target.linkedDiscipline ? `${serviceTitle} · ${target.linkedDiscipline}` : serviceTitle;
    }

    return target.discipline || target.categoryTitle || "대회 신청";
  }, [isStageService, target]);

  useEffect(() => {
    async function loadRefundQuote() {
      if ((!isApplication && !isStageService) || !targetId) {
        setErrorMessage("환불 대상을 찾을 수 없습니다. 신청 조회에서 다시 선택해 주세요.");
        setIsLoading(false);
        return;
      }

      if (!lookupSession?.name || !lookupSession?.email || !lookupSession?.verificationToken) {
        setErrorMessage("신청 조회 인증이 필요합니다. 신청 조회에서 인증 후 다시 시도해 주세요.");
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setErrorMessage("");

      try {
        const payload = {
          name: lookupSession.name,
          email: lookupSession.email,
          verificationToken: lookupSession.verificationToken,
          ...(isStageService
            ? { serviceOrderNumber: targetId }
            : { applicationNumber: targetId }),
        };
        const response = isStageService
          ? await getStageServiceRefundQuote(payload)
          : await getApplicationRefundQuote(payload);

        setQuote(response.refundQuote || null);
        setTarget(response.serviceOrder || response.application || null);
      } catch (error) {
        setErrorMessage(error.message || "환불 정보를 불러오지 못했습니다.");
      } finally {
        setIsLoading(false);
      }
    }

    loadRefundQuote();
  }, [isApplication, isStageService, lookupSession, targetId]);

  async function handleRefund() {
    if (!quote?.canAutoRefund || !isAcknowledged || isSubmitting || !lookupSession) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const payload = {
        name: lookupSession.name,
        email: lookupSession.email,
        verificationToken: lookupSession.verificationToken,
        requestReason: "사용자 요청 자동 환불",
        ...(isStageService
          ? { serviceOrderNumber: targetId }
          : { applicationNumber: targetId }),
      };
      const response = isStageService
        ? await requestStageServiceRefund(payload)
        : await requestApplicationRefund(payload);

      window.sessionStorage.removeItem(lookupSessionStorageKey);
      navigate("/refund/complete", {
        replace: true,
        state: {
          targetTitle,
          refundAmount: response.refundQuote?.refundAmount ?? quote.refundAmount,
          refundPercent: response.refundQuote?.refundPercent ?? quote.refundPercent,
        },
      });
    } catch (error) {
      setErrorMessage(error.message || "환불 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <PageShell>
      <section className="site-page site-page--narrow">
        <article className="site-document site-refund-page">
          <p className="site-kicker">REFUND</p>
          <h1>환불 진행</h1>
          <p>대상 결제와 환불 규정을 확인한 뒤 환불을 진행해 주세요. 대회 신청과 무대 서비스에 동일한 환불 규정이 적용됩니다.</p>

          {isLoading ? <p className="site-lookup-refund__pending">환불 정보를 확인하고 있습니다.</p> : null}
          {errorMessage ? <p className="site-lookup-refund__error">{errorMessage}</p> : null}

          {quote && target ? (
            <>
              <section className="site-refund-page__target" aria-label="환불 대상">
                <h2>환불 대상</h2>
                <div className="site-review-row"><span>신청 / 서비스</span><strong>{targetTitle}</strong></div>
                <div className="site-review-row"><span>원 결제 금액</span><strong>{formatAmount(quote.originalAmount)}</strong></div>
                <div className="site-review-row"><span>적용 환불 비율</span><strong>{quote.refundPercent}%</strong></div>
                <div className="site-review-row"><span>환불 예정 금액</span><strong>{formatAmount(quote.refundAmount)}</strong></div>
                <div className="site-review-row"><span>적용 기준</span><strong>{quote.matchedRuleLabel || "환불 불가 구간"}</strong></div>
                <p className={quote.canAutoRefund ? "site-lookup-refund__success" : "site-lookup-refund__error"}>
                  {quote.message}
                </p>
              </section>

              <section className="site-refund-page__policy">
                <h2>환불 규정</h2>
                <p>대회일: {refundPolicy.eventDate}</p>
                <div className="site-refund-page__policy-table-wrap">
                  <table className="site-refund-page__policy-table">
                    <thead>
                      <tr><th>적용 구간</th><th>환불 비율</th></tr>
                    </thead>
                    <tbody>
                      {refundPolicy.personalCancellationRules.map((rule) => (
                        <tr key={rule.id}>
                          <td>{rule.label}</td>
                          <td>{rule.refundPercent}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="site-refund-page__policy-note">결제 완료 시점과 환불 요청 시점 기준으로 시스템이 자동 산정하며, 환불 완료 후에는 동일한 결제를 다시 환불할 수 없습니다.</p>
              </section>

              <label className="site-refund-page__acknowledgment">
                <input
                  checked={isAcknowledged}
                  disabled={!quote.canAutoRefund || isSubmitting}
                  onChange={(event) => setIsAcknowledged(event.target.checked)}
                  type="checkbox"
                />
                <span>위 환불 규정을 모두 읽고 이해했으며, 환불 진행에 동의합니다.</span>
              </label>

              <div className="site-inline-actions site-refund-page__actions">
                <Button onClick={() => navigate("/lookup") } variant="ghost">신청 조회로 돌아가기</Button>
                <Button disabled={!quote.canAutoRefund || !isAcknowledged || isSubmitting} onClick={handleRefund}>
                  {isSubmitting ? "환불 처리 중" : "환불 진행하기"}
                </Button>
              </div>
            </>
          ) : null}
        </article>
      </section>
    </PageShell>
  );
}
