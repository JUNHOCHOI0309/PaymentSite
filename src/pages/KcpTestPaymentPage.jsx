import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { createKcpTestOrder, prepareKcpPayment } from "../lib/applicationApi";

const testAmount = 100;

export function KcpTestPaymentPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const [customerName, setCustomerName] = useState("KCP 테스트");
  const [customerEmail, setCustomerEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function requestKcpTestPayment() {
    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const orderResult = await createKcpTestOrder({
        customerName,
        customerEmail,
        token,
      });
      const paymentResult = await prepareKcpPayment({
        context: "kcpTest",
        orderId: orderResult.order.orderId,
        paymentMethod: "CARD",
        token,
      });

      submitKcpPayment(paymentResult.payUrl, paymentResult.formFields);
    } catch (error) {
      setErrorMessage(error.message || "KCP 테스트 결제를 준비하지 못했습니다.");
      setIsSubmitting(false);
    }
  }

  return (
    <main className="kcp-test-page">
      <section className="kcp-test-panel">
        <p className="kcp-test-eyebrow">KCP 운영 결제 테스트</p>
        <h1>100원 카드 결제</h1>
        <p className="kcp-test-description">
          이 페이지는 KCP 결제 승인 흐름만 확인합니다. 결제가 성공해도 대회 신청서나 무대 서비스 주문은 생성하지 않습니다.
        </p>

        <div className="kcp-test-summary">
          <span>결제금액</span>
          <strong>{testAmount.toLocaleString("ko-KR")}원</strong>
        </div>

        <label className="kcp-test-field">
          이름
          <input
            value={customerName}
            onChange={(event) => setCustomerName(event.target.value)}
            maxLength={40}
          />
        </label>

        <label className="kcp-test-field">
          이메일
          <input
            type="email"
            value={customerEmail}
            onChange={(event) => setCustomerEmail(event.target.value)}
            maxLength={120}
            placeholder="선택 입력"
          />
        </label>

        {errorMessage ? <p className="kcp-test-error">{errorMessage}</p> : null}

        <button
          className="button kcp-test-button"
          type="button"
          onClick={requestKcpTestPayment}
          disabled={isSubmitting}
        >
          {isSubmitting ? "결제창 여는 중" : "100원 결제 테스트"}
        </button>
      </section>
    </main>
  );
}

export function KcpTestPaymentSuccessPage() {
  const [searchParams] = useSearchParams();
  const rows = useMemo(
    () => [
      ["주문번호", searchParams.get("orderId")],
      ["결제금액", formatAmount(searchParams.get("amount"))],
      ["KCP 거래번호", searchParams.get("paymentKey")],
      ["결제대행사", searchParams.get("provider")],
    ],
    [searchParams]
  );

  return (
    <main className="kcp-test-page">
      <section className="kcp-test-panel">
        <p className="kcp-test-eyebrow">KCP 테스트 결과</p>
        <h1>결제 승인 완료</h1>
        <p className="kcp-test-description">
          DB에서 주문 상태와 결제 레코드를 확인한 뒤, KCP 관리자에서 테스트 거래를 수동 취소하세요.
        </p>
        <div className="kcp-test-result">
          {rows.map(([label, value]) => (
            <div className="kcp-test-result-row" key={label}>
              <span>{label}</span>
              <strong>{value || "-"}</strong>
            </div>
          ))}
        </div>
        <Link className="button kcp-test-button kcp-test-link" to="/kcp-test">
          다시 테스트
        </Link>
      </section>
    </main>
  );
}

export function KcpTestPaymentFailPage() {
  const [searchParams] = useSearchParams();

  return (
    <main className="kcp-test-page">
      <section className="kcp-test-panel">
        <p className="kcp-test-eyebrow">KCP 테스트 결과</p>
        <h1>결제 실패</h1>
        <div className="kcp-test-result">
          <div className="kcp-test-result-row">
            <span>오류 코드</span>
            <strong>{searchParams.get("code") || "-"}</strong>
          </div>
          <div className="kcp-test-result-row">
            <span>오류 메시지</span>
            <strong>{searchParams.get("message") || "-"}</strong>
          </div>
        </div>
        <Link className="button kcp-test-button kcp-test-link" to="/kcp-test">
          다시 테스트
        </Link>
      </section>
    </main>
  );
}

function submitKcpPayment(payUrl, formFields = {}) {
  const form = document.createElement("form");
  form.method = "post";
  form.action = payUrl;

  Object.entries(formFields).forEach(([name, value]) => {
    if (value == null) {
      return;
    }

    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = String(value);
    form.appendChild(input);
  });

  document.body.appendChild(form);
  form.submit();
}

function formatAmount(value) {
  const amount = Number(value);

  if (!Number.isFinite(amount) || amount <= 0) {
    return value;
  }

  return `${amount.toLocaleString("ko-KR")}원`;
}
