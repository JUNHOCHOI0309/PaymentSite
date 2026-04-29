import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { apiFetch } from "../../lib/applicationApi";

export function PaymentBillingPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [responseData, setResponseData] = useState(null);
  const [billingConfirmed, setBillingConfirmed] = useState(false);
  const billingMethod = searchParams.get("billingMethod") || "CARD";
  const billingMethodLabel = billingMethod === "TRANSFER" ? "계좌 자동결제" : "카드 자동결제";

  useEffect(() => {
    async function issueBillingKey() {
      const requestData = {
        customerKey: searchParams.get("customerKey"),
        authKey: searchParams.get("authKey"),
      };

      const response = await apiFetch("/api/issue-billing-key", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestData),
      });

      const json = await response.json();

      if (!response.ok) {
        throw { message: json.message, code: json.code };
      }

      return json;
    }

    issueBillingKey()
      .then(function (data) {
        setResponseData(data);
      })
      .catch((err) => {
        navigate(`/fail?message=${encodeURIComponent(err.message)}&code=${err.code}`);
      });
  }, [navigate, searchParams]);

  async function confirm() {
    async function confirmBilling() {
      const requestData = {
        customerKey: searchParams.get("customerKey"),
        amount: 4900,
        orderId: generateRandomString(),
        orderName: "토스 프라임 구독",
        customerEmail: "customer123@gmail.com",
        customerName: "김토스",
      };

      const response = await apiFetch("/api/confirm-billing", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestData),
      });

      const json = await response.json();

      if (!response.ok) {
        throw { message: json.message, code: json.code };
      }

      return json;
    }

    confirmBilling()
      .then(function (data) {
        setBillingConfirmed(true);
        setResponseData(data);
      })
      .catch((err) => {
        navigate(`/fail?message=${encodeURIComponent(err.message)}&code=${err.code}`);
      });
  }

  return (
    <div className="wrapper">
      <div className="box_section" style={{ width: "600px" }}>
        <img width="100px" src="https://static.toss.im/illusts/check-blue-spot-ending-frame.png" />
        <h2 id="title">{billingConfirmed ? `${billingMethodLabel} 승인에 성공했어요` : `${billingMethodLabel} 등록이 완료되었어요`}</h2>

        {billingConfirmed === false ? (
          <button id="confirm" className="button" onClick={confirm}>
            등록한 결제수단으로 자동결제 실행하기
          </button>
        ) : null}

        <div className="p-grid" style={{ marginTop: "30px" }}>
          <button
            className="button p-grid-col5"
            onClick={() => {
              location.href = "https://docs.tosspayments.com/guides/v2/billing/integration";
            }}
          >
            연동 문서
          </button>
          <button
            className="button p-grid-col5"
            onClick={() => {
              location.href = "https://discord.gg/A4fRFXQhRu";
            }}
            style={{ backgroundColor: "#e8f3ff", color: "#1b64da" }}
          >
            실시간 문의
          </button>
        </div>
        <div className="box_section" style={{ width: "600px", textAlign: "left" }}>
          <b>Response Data :</b>
          <div id="response" style={{ whiteSpace: "initial" }}>
            {responseData && (
              <>
                <div>
                  <b>method:</b> {responseData.method || "-"}
                </div>
                <div>
                  <b>card:</b>
                  <pre>{responseData.card ? JSON.stringify(responseData.card, null, 2) : "-"}</pre>
                </div>
                <div>
                  <b>transfers:</b>
                  <pre>{responseData.transfers || responseData.transfer ? JSON.stringify(responseData.transfers || responseData.transfer, null, 2) : "-"}</pre>
                </div>
                <pre>{JSON.stringify(responseData, null, 4)}</pre>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function generateRandomString() {
  return window.btoa(Math.random().toString()).slice(0, 20);
}
