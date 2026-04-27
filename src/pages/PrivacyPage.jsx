import { PageShell } from "../components/layout/PageShell";

export function PrivacyPage() {
  return (
    <PageShell>
      <section className="site-page site-page--narrow">
        <article className="site-document">
          <p className="site-kicker">Privacy</p>
          <h1>개인정보 수집 및 이용 안내</h1>
          <p>신청 페이지에서 수집하는 개인정보와 이용 목적을 안내하는 문서입니다.</p>

          <h2>수집 항목</h2>
          <p>성함, 연락처, 이메일, 생년월일, 소속, 제출 파일 정보</p>

          <h2>이용 목적</h2>
          <p>신청 접수 확인, 결제 확인, 결과 안내, 운영 공지 전달</p>

          <h2>보관 기간</h2>
          <p>운영 정책과 관련 법령 기준에 따라 보관 후 파기합니다.</p>
        </article>
      </section>
    </PageShell>
  );
}
