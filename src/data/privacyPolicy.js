export const privacyPolicy = {
  version: "1.0",
  effectiveDate: "2026. 7. 15.",
  operator: {
    name: "모델라인 컴퍼니(주)",
    representative: "박응준",
    businessNumber: "188-88-01118",
    address: "서울특별시 강남구 강남대로160길 15, 2층 (신사동)",
    phone: "02-379-2222",
    privacyOfficer: "박응준 (대표자)",
  },
  collectionPurposes: [
    {
      purpose: "대회 참가 신청 및 운영",
      required: "성함, 연락처, 이메일, 생년월일, 참가 종목, 체급, SNS 플랫폼 및 ID, 자기소개 멘트",
      optional: "소속, 제출 문서 파일",
      retention: "행사 종료 후 1년 또는 관계 법령상 보관 기간",
    },
    {
      purpose: "무대 서비스 신청 및 제공",
      required: "성함, 연락처, 이메일, 신청 서비스, 선택 옵션, 결제 및 주문 식별정보",
      optional: "추가 종목 또는 선택 옵션 정보",
      retention: "서비스 제공 완료 후 1년 또는 관계 법령상 보관 기간",
    },
    {
      purpose: "결제, 취소 및 환불 처리",
      required: "주문번호, 결제금액, 결제수단, 결제 승인 상태, 결제대행 거래 식별정보, 환불 처리 기록",
      optional: "없음",
      retention: "전자상거래 관련 법령상 보관 기간",
    },
    {
      purpose: "신청 조회 및 본인 확인",
      required: "성함, 이메일, 이메일 인증 코드 및 인증 세션 정보",
      optional: "없음",
      retention: "인증 요청 생성일로부터 3일",
    },
    {
      purpose: "고객 문의, 분쟁 및 부정 이용 대응",
      required: "문의 내용, 신청 및 결제 관련 기록, 접속 IP, 접속 일시, 서비스 이용 기록",
      optional: "없음",
      retention: "처리 완료 후 3년 또는 분쟁 해결 시까지",
    },
  ],
  legalRetention: [
    {
      record: "계약 또는 청약철회 등에 관한 기록",
      basis: "전자상거래 등에서의 소비자보호에 관한 법률",
      period: "5년",
    },
    {
      record: "대금결제 및 재화·서비스 공급에 관한 기록",
      basis: "전자상거래 등에서의 소비자보호에 관한 법률",
      period: "5년",
    },
    {
      record: "소비자 불만 또는 분쟁처리에 관한 기록",
      basis: "전자상거래 등에서의 소비자보호에 관한 법률",
      period: "3년",
    },
    {
      record: "표시·광고에 관한 기록",
      basis: "전자상거래 등에서의 소비자보호에 관한 법률",
      period: "6개월",
    },
  ],
  processors: [
    {
      name: "NHN KCP",
      work: "전자결제 승인, 거래 확인, 결제 취소 및 환불 처리",
    },
  ],
  crossBorderTransfer: {
    recipient: "Cloudflare, Inc. (Cloudflare R2)",
    contact: "privacyquestions@cloudflare.com",
    country: "미국 및 아시아 태평양(APAC) 리전에 소재한 국외 국가 (대한민국 내 저장은 보장되지 않음)",
    items: "참가자가 업로드한 제출 문서의 내용, 파일명, 파일 형식 및 파일 크기 등 파일 메타데이터",
    timingAndMethod: "파일 업로드 시점에 HTTPS를 통해 전송·보관",
    purpose: "참가 신청에 필요한 제출 파일의 객체 저장 및 권한이 확인된 관리자 다운로드 제공",
    retention: "행사 종료 후 1년 또는 관계 법령상 보관 기간까지",
    basis: "이용자와의 계약 체결·이행을 위하여 필요한 국외 처리위탁 또는 보관",
    refusal: "국외 이전을 거부할 수 있으나, 제출 파일이 필수인 신청의 경우 파일 제출 및 해당 신청 절차가 제한될 수 있습니다.",
  },
};
