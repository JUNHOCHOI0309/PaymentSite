import { PageShell } from "../components/layout/PageShell";

export function PrivacyPage() {
  return (
    <PageShell>
      <section className="site-page site-page--narrow">
        <article className="site-document">
          <p className="site-kicker">Privacy</p>
          <h1>개인정보 수집 및 이용 안내</h1>
          <p>이 페이지는 신청 화면의 필수 동의 링크 대상입니다.</p>
          <h2>수집 항목</h2>
          <p>성함, 연락처, 이메일, 생년월일, 소속, 제출 파일 메타데이터</p>
          <h2>이용 목적</h2>
          <p>신청 접수 확인, 결제 확인, 결과 안내, 운영 공지 전달</p>
          <h2>보관 기간</h2>
          <p>운영 정책과 관련 법령 기준에 따라 보관 후 파기</p>
        </article>
      </section>
    </PageShell>
  );
}
