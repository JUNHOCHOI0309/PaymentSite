import { PageShell } from "../components/layout/PageShell";

export function TermsPage() {
  return (
    <PageShell>
      <section className="site-page site-page--narrow">
        <article className="site-document">
          <p className="site-kicker">Terms</p>
          <h1>참가 유의사항 및 환불 규정</h1>
          <h2>참가 유의사항</h2>
          <p>제출 파일 규격, 중복 제출 금지, 허위 정보 기재 금지 등의 항목을 정리하는 영역입니다.</p>
          <h2>환불 규정</h2>
          <p>결제 완료 이후 환불 가능 시점과 환불 불가 사유를 이 문서에서 관리합니다.</p>
          <h2>운영 정책</h2>
          <p>일정 변경, 심사 기준, 수상 취소 조건 등 운영 정책 전문을 싣는 구조입니다.</p>
        </article>
      </section>
    </PageShell>
  );
}
