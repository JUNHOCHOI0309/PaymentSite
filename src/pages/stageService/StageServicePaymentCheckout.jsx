import { loadTossPayments } from "@tosspayments/tosspayments-sdk";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useLanguage } from "../../context/LanguageContext";
import { useStageServiceFlow } from "../../context/StageServiceFlowContext";
import { formatStageServiceAmount, getStageServiceTitle } from "../../data/stageServiceConfig";
import { prepareKcpPayment } from "../../lib/applicationApi";

const clientKey = import.meta.env.VITE_TOSS_API_CLIENT_KEY;
const customerKey = generateRandomString();

export function StageServicePaymentCheckoutPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { state } = useStageServiceFlow();
  const { t, language } = useLanguage();
  const [payment, setPayment] = useState(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("CARD");
  const [errorMessage, setErrorMessage] = useState("");

  const orderId = searchParams.get("orderId") || state.orderId;
  const draftId = searchParams.get("draftId") || state.draftId;

  useEffect(() => {
    async function fetchPayment() {
      if (!clientKey) {
        return;
      }

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

    try {
      const kcpPayment = await prepareKcpPayment({
        context: "stageService",
        draftId,
        orderId,
        paymentMethod: selectedPaymentMethod,
      });

      submitKcpPayment(kcpPayment.payUrl, kcpPayment.formFields);
      return;
    } catch (error) {
      if (error.code !== "PAYMENT_PROVIDER_MISMATCH") {
        setErrorMessage(error.message || t("payment.prepareError"));
        return;
      }
    }

    if (!payment) {
      setErrorMessage(t("payment.prepareError"));
      return;
    }

    await payment.requestPayment({
      method: selectedPaymentMethod,
      amount: {
        currency: "KRW",
        value: state.totalAmount,
      },
      orderId,
      orderName: getStageServiceTitle(state.serviceKey),
      successUrl: `${window.location.origin}/stage-services/payment/success?draftId=${encodeURIComponent(draftId || "")}`,
      failUrl: `${window.location.origin}/stage-services/fail`,
      customerEmail: state.applicantInfo.email || "customer@example.com",
      customerName: state.applicantInfo.name || t("payment.applicant"),
    });
  }

  return (
    <div className="wrapper">
      <div className="box_section">
        <h1>{getStageServiceTitle(state.serviceKey)}</h1>
        <p>{formatStageServiceAmount(state.totalAmount, language)}</p>
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
        <button className="button" onClick={() => requestPayment()} disabled={!orderId}>
          {t("payment.pay")}
        </button>
      </div>
      <div className="box_section" style={{ padding: "32px" }}>
        <button
          className="button"
          style={{ marginTop: "0" }}
          onClick={() => navigate("/apply/stage-services/review")}
        >
          {t("payment.backToReview")}
        </button>
      </div>
    </div>
  );
}

function generateRandomString() {
  return window.btoa(Math.random().toString()).slice(0, 20);
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
