import { loadTossPayments } from "@tosspayments/tosspayments-sdk";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useApplicationFlow } from "../../context/ApplicationFlowContext";
import { useLanguage } from "../../context/LanguageContext";
import { buildApiUrl } from "../../lib/applicationApi";

const clientKey = "test_ck_D5GePWvyJnrK0W0k6q8gLzN97Eoq";
const customerKey = generateRandomString();

export function BrandpayCheckoutPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { state } = useApplicationFlow();
  const { t } = useLanguage();
  const [brandpay, setBrandpay] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");

  const orderId = searchParams.get("orderId") || state.orderId;
  const draftId = searchParams.get("draftId") || state.draftId;

  useEffect(() => {
    async function fetchBrandpay() {
      try {
        const tossPayments = await loadTossPayments(clientKey);
        const nextBrandpay = tossPayments.brandpay({
          customerKey,
          redirectUrl: buildApiUrl("/api/callback-auth"),
        });

        setBrandpay(nextBrandpay);
      } catch (error) {
        setErrorMessage(error.message || t("brandpay.prepareError"));
      }
    }

    fetchBrandpay();
  }, [t]);

  async function requestPayment() {
    if (!orderId) {
      setErrorMessage(t("brandpay.missingOrder"));
      return;
    }

    await brandpay.requestPayment({
      amount: {
        currency: "KRW",
        value: 1,
      },
      orderId,
      orderName: t("brandpay.orderName"),
      successUrl: `${window.location.origin}/brandpay/success?customerKey=${customerKey}&draftId=${encodeURIComponent(draftId || "")}`,
      failUrl: window.location.origin + "/fail",
      customerEmail: state.applicantInfo.email || "customer@example.com",
      customerName: state.applicantInfo.name || t("brandpay.applicant"),
    });
  }

  return (
    <div className="wrapper">
      <div className="box_section" style={{ padding: "40px 30px 50px 30px", marginTop: "30px", marginBottom: "50px", display: "flex", flexDirection: "column" }}>
        {errorMessage ? <p style={{ color: "#d14343" }}>{errorMessage}</p> : null}
        <button className="button" style={{ marginTop: "30px" }} onClick={requestPayment} disabled={!brandpay}>
          {t("brandpay.pay")}
        </button>
        <button className="button" style={{ marginTop: "30px" }} onClick={() => navigate("/apply/review")}>
          {t("brandpay.backToReview")}
        </button>
      </div>
    </div>
  );
}

function generateRandomString() {
  return window.btoa(Math.random().toString()).slice(0, 20);
}
