import { loadTossPayments } from "@tosspayments/tosspayments-sdk";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useLanguage } from "../../context/LanguageContext";
import { useStageServiceFlow } from "../../context/StageServiceFlowContext";
import { formatStageServiceAmount, getStageServiceTitle } from "../../data/stageServiceConfig";

const clientKey = import.meta.env.VITE_TOSS_WIDGET_CLIENT_KEY;
const customerKey = generateRandomString();

export function StageServiceWidgetCheckoutPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { state } = useStageServiceFlow();
  const { t, language } = useLanguage();
  const [order, setOrder] = useState(null);
  const [amount, setAmount] = useState({ currency: "KRW", value: state.totalAmount || 0 });
  const [ready, setReady] = useState(false);
  const [widgets, setWidgets] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function initializeOrderAndWidgets() {
      try {
        if (!clientKey) {
          throw new Error(t("widget.missingClientKey"));
        }

        const queryOrderId = searchParams.get("orderId");
        const draftId = searchParams.get("draftId") || state.draftId;
        const resolvedOrder = {
          orderId: queryOrderId || state.orderId,
          orderName: getStageServiceTitle(state.serviceKey),
          amount: state.totalAmount,
          customerEmail: state.applicantInfo.email,
          customerName: state.applicantInfo.name,
          draftId,
        };

        if (!resolvedOrder.orderId) {
          throw new Error(t("payment.missingOrder"));
        }

        setOrder(resolvedOrder);
        setAmount({ currency: "KRW", value: resolvedOrder.amount });

        const tossPayments = await loadTossPayments(clientKey);
        const nextWidgets = tossPayments.widgets({ customerKey });
        setWidgets(nextWidgets);
      } catch (error) {
        setErrorMessage(error.message || t("widget.prepareError"));
      }
    }

    initializeOrderAndWidgets();
  }, [searchParams, state, t]);

  useEffect(() => {
    async function renderPaymentWidgets() {
      if (!widgets || !order) {
        return;
      }

      await widgets.setAmount(amount);
      await Promise.all([
        widgets.renderPaymentMethods({
          selector: "#stage-service-payment-method",
          variantKey: "DEFAULT",
        }),
        widgets.renderAgreement({
          selector: "#stage-service-agreement",
          variantKey: "AGREEMENT",
        }),
      ]);

      setReady(true);
    }

    renderPaymentWidgets().catch((error) => {
      setErrorMessage(error.message || t("widget.renderError"));
    });
  }, [widgets, order, amount, t]);

  return (
    <div className="wrapper">
      <div className="box_section">
        <h2>{getStageServiceTitle(state.serviceKey)}</h2>
        <p>{formatStageServiceAmount(state.totalAmount, language)}</p>
        {errorMessage ? <p style={{ color: "#d14343" }}>{errorMessage}</p> : null}
        <div id="stage-service-payment-method" />
        <div id="stage-service-agreement" />
        <button
          className="button"
          style={{ marginTop: "30px" }}
          disabled={!ready || !order}
          onClick={async () => {
            try {
              await widgets.requestPayment({
                orderId: order.orderId,
                orderName: order.orderName,
                successUrl: `${window.location.origin}/stage-services/widget/success?draftId=${encodeURIComponent(order.draftId || "")}`,
                failUrl: `${window.location.origin}/stage-services/fail`,
                customerEmail: order.customerEmail || undefined,
                customerName: order.customerName || undefined,
              });
            } catch (error) {
              setErrorMessage(error.message || t("widget.requestError"));
            }
          }}
        >
          {t("widget.pay")}
        </button>
      </div>
      <div className="box_section" style={{ padding: "32px" }}>
        <button
          className="button"
          style={{ marginTop: "0" }}
          onClick={() => navigate("/apply/stage-services/review")}
        >
          {t("widget.backToReview")}
        </button>
      </div>
    </div>
  );
}

function generateRandomString() {
  return window.btoa(Math.random().toString()).slice(0, 20);
}
