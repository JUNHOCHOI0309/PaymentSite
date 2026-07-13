import { useSearchParams } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";

export function FailPage() {
  const [searchParams] = useSearchParams();
  const { t } = useLanguage();

  return (
    <div id="info" className="box_section" style={{ width: "600px" }}>
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
    </div>
  );
}
