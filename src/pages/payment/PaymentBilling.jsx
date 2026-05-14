import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useLanguage } from "../../context/LanguageContext";
import { apiFetch } from "../../lib/applicationApi";

export function PaymentBillingPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useLanguage();
  const [responseData, setResponseData] = useState(null);
  const [billingConfirmed, setBillingConfirmed] = useState(false);
  const billingMethod = searchParams.get("billingMethod") || "CARD";
  const billingMethodLabel =
    billingMethod === "TRANSFER" ? t("billing.transferMethod") : t("billing.cardMethod");

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
        orderName: t("billing.orderName"),
        customerEmail: "customer123@gmail.com",
        customerName: t("billing.customerName"),
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

  const title = billingConfirmed
    ? `${billingMethodLabel} ${t("billing.approveSuccess")}`
    : `${billingMethodLabel} ${t("billing.registerSuccess")}`;

  return (
    <div className="wrapper">
      <div className="box_section" style={{ width: "600px" }}>
        <img
          width="100px"
          src="https://static.toss.im/illusts/check-blue-spot-ending-frame.png"
          alt={t("billing.successAlt")}
        />
        <h2 id="title">{title}</h2>

        {billingConfirmed === false ? (
          <button id="confirm" className="button" onClick={confirm}>
            {t("billing.runAutoBilling")}
          </button>
        ) : null}

        <div className="p-grid" style={{ marginTop: "30px" }}>
          <button
            className="button p-grid-col5"
            onClick={() => {
              location.href = "https://docs.tosspayments.com/guides/v2/billing/integration";
            }}
          >
            {t("fail.docs")}
          </button>
          <button
            className="button p-grid-col5"
            onClick={() => {
              location.href = "https://discord.gg/A4fRFXQhRu";
            }}
            style={{ backgroundColor: "#e8f3ff", color: "#1b64da" }}
          >
            {t("fail.support")}
          </button>
        </div>
        <div className="box_section" style={{ width: "600px", textAlign: "left" }}>
          <b>{t("common.debugResponseData")}:</b>
          <div id="response" style={{ whiteSpace: "initial" }}>
            {responseData && (
              <>
                <div>
                  <b>{t("common.debugMethod")}:</b> {responseData.method || "-"}
                </div>
                <div>
                  <b>{t("common.debugCard")}:</b>
                  <pre>{responseData.card ? JSON.stringify(responseData.card, null, 2) : "-"}</pre>
                </div>
                <div>
                  <b>{t("common.debugTransfers")}:</b>
                  <pre>
                    {responseData.transfers || responseData.transfer
                      ? JSON.stringify(responseData.transfers || responseData.transfer, null, 2)
                      : "-"}
                  </pre>
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
