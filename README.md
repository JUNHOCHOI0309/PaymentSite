# MMKorea KCP Payment

MMKorea 참가 신청과 무대 서비스 신청의 NHN KCP 결제 애플리케이션입니다. 결제 준비, 승인 결과 처리, 웹훅, 거래 후검증, 취소를 KCP 단일 결제 경로로 처리합니다.

## 실행

```bash
npm install
npm run dev
```

- 프런트엔드: `http://localhost:3000`
- API 서버: `http://localhost:4000`
- 프로덕션 빌드: `npm run build`

## KCP 환경변수

실제 값과 인증서 파일은 저장소에 커밋하지 않습니다.

```dotenv
KCP_ENABLED=true
KCP_MODE=production
KCP_SITE_CD=
KCP_CERT_INFO_PATH=
KCP_PRIVATE_KEY_PATH=
KCP_PRIVATE_KEY_PASSPHRASE=
KCP_MAX_AMOUNT=
PUBLIC_BASE_URL=https://www.mmkorea.com
PUBLIC_API_BASE_URL=https://api.mmkorea.com
VITE_API_BASE_URL=https://api.mmkorea.com
```

인증서는 애플리케이션 코드와 분리된 서버 전용 디렉터리에 두고, Node.js 프로세스 사용자에게 읽기 권한만 부여합니다. 인라인 인증정보가 필요한 환경에서는 `KCP_CERT_INFO`, `KCP_PRIVATE_KEY`를 사용할 수 있습니다.

## 결제 경로

- 참가 신청: `/payment/checkout` -> KCP 결제창 -> `/payment/success`
- 무대 서비스: `/stage-services/payment/checkout` -> KCP 결제창 -> `/stage-services/payment/success`
- KCP 승인 결과 수신: `POST /kcp/return`
- KCP 웹훅: `POST /webhooks/kcp`
- 운영 후검증: `POST /admin/kcp/payments/:orderId/reconcile`

KCP 상점 관리자 웹훅 URL은 `https://api.mmkorea.com/webhooks/kcp`입니다. Nginx가 `/webhooks/kcp`를 API 서버로 전달하므로 외부 URL에는 `/api`를 붙이지 않습니다.

## 테스트 결제

테스트 전용 주문 API와 화면은 `KCP_TEST_PAYMENT_ENABLED=true`일 때만 활성화합니다. 운영 확인 후에는 해당 값을 `false`로 전환하고 서버를 재시작합니다. 테스트 거래 취소는 사이트의 KCP 취소 API 또는 KCP 상점 관리자에서 처리한 뒤 후검증으로 DB 상태를 동기화합니다.
