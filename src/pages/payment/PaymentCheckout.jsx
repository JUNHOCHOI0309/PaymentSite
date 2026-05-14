import { loadTossPayments } from "@tosspayments/tosspayments-sdk";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useApplicationFlow } from "../../context/ApplicationFlowContext";
import { useLanguage } from "../../context/LanguageContext";

const clientKey = import.meta.env.VITE_TOSS_API_CLIENT_KEY;
const customerKey = generateRandomString();
const amount = { currency: "KRW", value: 1 };

if (!clientKey) {
  throw new Error("VITE_TOSS_API_CLIENT_KEY is not set");
}

export function PaymentCheckoutPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { state } = useApplicationFlow();
  const { t } = useLanguage();
  const [payment, setPayment] = useState(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("CARD");
  const [errorMessage, setErrorMessage] = useState("");

  const orderId = searchParams.get("orderId") || state.orderId;
  const draftId = searchParams.get("draftId") || state.draftId;

  useEffect(() => {
    async function fetchPayment() {
      try {
        const tossPayments = await loadTossPayments(clientKey);
        setPayment(tossPayments.payment({ customerKey }));
      } catch (error) {
        setErrorMessage(error.message || t("payment.prepareError"));
      }
    }

    fetchPayment();
  }, [t]);

  async function requestPayment() {
    if (!orderId) {
      setErrorMessage(t("payment.missingOrder"));
      return;
    }

    await payment.requestPayment({
      method: selectedPaymentMethod,
      amount,
      orderId,
      orderName: t("payment.orderName"),
      successUrl: `${window.location.origin}/payment/success?draftId=${encodeURIComponent(draftId || "")}`,
      failUrl: window.location.origin + "/fail",
      customerEmail: state.applicantInfo.email || "customer@example.com",
      customerName: state.applicantInfo.name || t("payment.applicant"),
    });
  }

  return (
    <div className="wrapper">
      <div className="box_section">
        <h1>{t("payment.title")}</h1>
        {errorMessage ? <p style={{ color: "#d14343" }}>{errorMessage}</p> : null}
        <div id="payment-method" style={{ display: "flex", flexWrap: "wrap" }}>
          {[
            ["CARD", t("payment.card")],
            ["TRANSFER", t("payment.transfer")],
            ["VIRTUAL_ACCOUNT", t("payment.virtualAccount")],
            ["MOBILE_PHONE", t("payment.mobilePhone")],
          ].map(([value, label]) => (
            <button
              key={value}
              className={`button2 ${selectedPaymentMethod === value ? "active" : ""}`}
              onClick={() => setSelectedPaymentMethod(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <button className="button" onClick={() => requestPayment()} disabled={!payment}>
          {t("payment.pay")}
        </button>
      </div>
      <div className="box_section" style={{ padding: "32px" }}>
        <button className="button" style={{ marginTop: "0" }} onClick={() => navigate("/apply/review")}>
          {t("payment.backToReview")}
        </button>
      </div>
    </div>
  );
}

function generateRandomString() {
  return window.btoa(Math.random().toString()).slice(0, 20);
}
