import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { apiFetch, completeApplication } from "../../lib/applicationApi";

export function BrandpaySuccessPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [responseData, setResponseData] = useState(null);

  useEffect(() => {
    async function confirmAndComplete() {
      const requestData = {
        orderId: searchParams.get("orderId"),
        amount: searchParams.get("amount"),
        paymentKey: searchParams.get("paymentKey"),
        customerKey: searchParams.get("customerKey"),
      };

      const response = await apiFetch("/api/confirm/brandpay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestData),
      });

      const json = await response.json();

      if (!response.ok) {
        throw { message: json.message, code: json.code };
      }

      const completeResult = await completeApplication({
        draftId: searchParams.get("draftId"),
        orderId: searchParams.get("orderId"),
      });

      navigate(`/apply/complete?applicationNumber=${encodeURIComponent(completeResult.application.applicationNumber)}`);
      return json;
    }

    confirmAndComplete()
      .then((data) => setResponseData(data))
      .catch((error) => {
        navigate(`/fail?code=${error.code || "APPLICATION"}&message=${encodeURIComponent(error.message || "결제 확인에 실패했습니다.")}`);
      });
  }, [navigate, searchParams]);

  return (
    <>
      <div className="box_section" style={{ width: "600px" }}>
        <img width="100px" src="https://static.toss.im/illusts/check-blue-spot-ending-frame.png" />
        <h2>결제를 완료했어요</h2>
        <div className="p-grid typography--p" style={{ marginTop: "50px" }}>
          <div className="p-grid-col text--left"><b>주문번호</b></div>
          <div className="p-grid-col text--right" id="orderId">{searchParams.get("orderId")}</div>
        </div>
        <div className="p-grid-col">
          <Link to="/apply/complete">
            <button className="button p-grid-col5">완료 페이지</button>
          </Link>
        </div>
      </div>
      <div className="box_section" style={{ width: "600px", textAlign: "left" }}>
        <b>Response Data :</b>
        <div id="response" style={{ whiteSpace: "initial" }}>
          {responseData && <pre>{JSON.stringify(responseData, null, 4)}</pre>}
        </div>
      </div>
    </>
  );
}
