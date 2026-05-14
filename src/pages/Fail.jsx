import { Link, useSearchParams } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";

export function FailPage() {
  const [searchParams] = useSearchParams();
  const { t } = useLanguage();

  return (
    <div id="info" className="box_section" style={{ width: "600px" }}>
      <img
        width="100px"
        src="https://static.toss.im/lotties/error-spot-no-loop-space-apng.png"
        alt={t("fail.alt")}
      />
      <h2>{t("fail.title")}</h2>

      <div className="p-grid typography--p" style={{ marginTop: "50px" }}>
        <div className="p-grid-col text--left">
          <b>{t("fail.message")}</b>
        </div>
        <div className="p-grid-col text--right" id="message">
          {`${searchParams.get("message")}`}
        </div>
      </div>
      <div className="p-grid typography--p" style={{ marginTop: "10px" }}>
        <div className="p-grid-col text--left">
          <b>{t("fail.code")}</b>
        </div>
        <div className="p-grid-col text--right" id="code">
          {`${searchParams.get("code")}`}
        </div>
      </div>

      <div className="p-grid-col">
        <Link to="https://docs.tosspayments.com/guides/v2/payment-widget/integration">
          <button className="button p-grid-col5">{t("fail.docs")}</button>
        </Link>
        <Link to="https://discord.gg/A4fRFXQhRu">
          <button
            className="button p-grid-col5"
            style={{ backgroundColor: "#e8f3ff", color: "#1b64da" }}
          >
            {t("fail.support")}
          </button>
        </Link>
      </div>
    </div>
  );
}
