import { PageShell } from "../components/layout/PageShell";
import { termsOfService } from "../data/termsOfService";

export function TermsPage() {
  return (
    <PageShell>
      <section className="site-page site-page--narrow">
        <article className="site-document site-terms">
          <p className="site-kicker">Terms of Service</p>
          <h1>이용약관</h1>
          <p className="site-terms__effective-date">
            버전 {termsOfService.version} · 시행일 {termsOfService.effectiveDate}
          </p>

          <section className="site-terms__operator" aria-label="사업자 정보">
            <h2>사업자 정보</h2>
            <dl>
              <div><dt>상호명</dt><dd>{termsOfService.operator.name}</dd></div>
              <div><dt>대표자</dt><dd>{termsOfService.operator.representative}</dd></div>
              <div><dt>사업자등록번호</dt><dd>{termsOfService.operator.businessNumber}</dd></div>
              <div><dt>통신판매업신고번호</dt><dd>{termsOfService.operator.mailOrderNumber}</dd></div>
              <div><dt>주소</dt><dd>{termsOfService.operator.address}</dd></div>
              <div><dt>전화</dt><dd>{termsOfService.operator.phone}</dd></div>
            </dl>
          </section>

          <p className="site-terms__language-notice">
            본 이용약관의 기준 언어는 한국어이며, 영문 표기가 제공되는 경우 참고용입니다.
          </p>

          {termsOfService.articles.map((article) => (
            <section className="site-terms__article" key={article.title}>
              <h2>{article.title}</h2>
              {article.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              {article.items ? (
                <ol>
                  {article.items.map((item) => <li key={item}>{item}</li>)}
                </ol>
              ) : null}
            </section>
          ))}
        </article>
      </section>
    </PageShell>
  );
}
