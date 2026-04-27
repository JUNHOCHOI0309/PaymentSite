import { PageShell } from "../components/layout/PageShell";

export function TermsPage() {
  return (
    <PageShell>
      <section className="site-page site-page--narrow">
        <article className="site-document">
          <p className="site-kicker">Terms</p>
          <h1>참가 유의사항 및 환불 규정</h1>

          <h2>참가 유의사항</h2>
          <p>
            제출 파일 규격, 중복 제출 금지, 허위 정보 기재 금지 등 신청 전에 반드시 확인해야 할 내용을
            정리합니다.
          </p>

          <h2>환불 규정</h2>
          <p>
            결제 완료 이후 환불 가능 시점과 환불 불가 사유를 명확히 안내하고, 필요 시 별도 운영 문서로
            연결합니다.
          </p>

          <h2>운영 정책</h2>
          <p>
            일정 변경, 심사 기준, 수상 취소 조건 등 행사 운영에 필요한 기준을 고지하는 영역입니다.
          </p>
        </article>
      </section>
    </PageShell>
  );
}
