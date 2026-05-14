import { loadTossPayments } from "@tosspayments/tosspayments-sdk";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useApplicationFlow } from "../../context/ApplicationFlowContext";
import { useLanguage } from "../../context/LanguageContext";

const clientKey = import.meta.env.VITE_TOSS_WIDGET_CLIENT_KEY;
const customerKey = generateRandomString();

export function WidgetCheckoutPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { state } = useApplicationFlow();
  const { t } = useLanguage();

  const [order, setOrder] = useState(null);
  const [amount, setAmount] = useState({ currency: "KRW", value: 1 });
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
          orderName: t("widget.orderName"),
          amount: 1,
          customerEmail: state.applicantInfo.email,
          customerName: state.applicantInfo.name,
          draftId,
        };

        if (!resolvedOrder.orderId) {
          throw new Error(t("widget.missingOrder"));
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
          selector: "#payment-method",
          variantKey: "DEFAULT",
        }),
        widgets.renderAgreement({
          selector: "#agreement",
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
        {errorMessage ? <p style={{ color: "#d14343" }}>{errorMessage}</p> : null}
        <div id="payment-method" />
        <div id="agreement" />
        <button
          className="button"
          style={{ marginTop: "30px" }}
          disabled={!ready || !order}
          onClick={async () => {
            try {
              await widgets.requestPayment({
                orderId: order.orderId,
                orderName: order.orderName,
                successUrl: `${window.location.origin}/widget/success?draftId=${encodeURIComponent(order.draftId || "")}`,
                failUrl: window.location.origin + "/fail",
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
        <button className="button" style={{ marginTop: "0" }} onClick={() => navigate("/apply/review")}>
          {t("widget.backToReview")}
        </button>
      </div>
    </div>
  );
}

function generateRandomString() {
  return window.btoa(Math.random().toString()).slice(0, 20);
}
