import refundPolicy from "./refundPolicy.json";

const refundRuleText = refundPolicy.personalCancellationRules
  .map((rule) => `- ${rule.label}: 결제 금액의 ${rule.refundPercent}% 환불`)
  .join("\n");

export const spectatorConsentItems = [
  {
    key: "privacy",
    title: "개인정보 수집 및 이용 동의",
    required: true,
    content: `수집 항목
- 성함, 연락처, 이메일 주소
- 참관객 신청번호, 주문번호, 결제 및 환불 처리 정보

이용 목적
- 참관객 본인 확인, 입장권 신청 및 결제 처리
- 신청 조회, 입장 확인, 환불 및 고객 문의 대응

보유 기간
- 관계 법령에서 정한 기간 또는 이용 목적 달성 시까지 보관한 후 안전하게 파기합니다.

동의를 거부할 수 있으나, 필수 정보 수집에 동의하지 않으면 참관객 입장권을 구매할 수 없습니다.`,
  },
  {
    key: "refund",
    title: "환불 규정 동의",
    required: true,
    content: `참관객 입장권에도 대회 신청과 동일한 환불 기준이 적용됩니다.

${refundRuleText}

환불 금액은 결제 완료 시점과 환불 요청 시점을 기준으로 시스템이 산정합니다. 환불 완료 후 동일 결제 건을 다시 환불할 수 없습니다.

본인은 본 환불 규정에 대한 전자적 동의가 서면 동의와 동일한 효력을 가질 수 있음을 확인하고, 결제 완료 후 해당 규정이 적용됨에 동의합니다.`,
  },
  {
    key: "marketing",
    title: "마케팅 정보 수신 동의",
    required: false,
    content: `MMKorea의 대회, 행사, 서비스 및 프로모션 안내를 이메일 또는 연락처로 받을 수 있습니다.

동의하지 않아도 참관객 입장권 구매와 이용에는 제한이 없으며, 동의 후에도 언제든 수신을 거부할 수 있습니다.`,
  },
  {
    key: "photoVideo",
    title: "사진·동영상 콘텐츠 사용 동의",
    required: false,
    content: `대회 현장에서 촬영된 사진과 영상에 관람객의 모습이 포함될 수 있으며, MMKorea의 대회 기록과 홍보 콘텐츠에 사용될 수 있습니다.

동의하지 않아도 참관객 입장권 구매에는 제한이 없습니다. 다만 현장 전체를 촬영하는 과정에서 식별이 어려운 배경 모습이 포함될 수 있습니다.`,
  },
];
