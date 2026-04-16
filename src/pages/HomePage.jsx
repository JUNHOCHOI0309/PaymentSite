import { Link } from "react-router-dom";
import { Button } from "../components/common/Button";
import { SectionTitle } from "../components/common/SectionTitle";
import { PageShell } from "../components/layout/PageShell";

const scheduleItems = [
  ["신청 기간", "2026.05.01 - 2026.05.31"],
  ["예선 발표", "2026.06.10"],
  ["본선 일정", "2026.06.21"],
  ["최종 결과", "2026.06.30"],
];

const prizeItems = [
  ["대상", "상금 300만원 + 특별 멘토링"],
  ["최우수상", "상금 150만원"],
  ["우수상", "상금 50만원"],
];

export function HomePage() {
  return (
    <PageShell hero>
      <section className="site-hero">
        <div className="site-hero__content">
          <p className="site-hero__eyebrow">2026 Creative Entry Program</p>
          <h1 className="site-hero__title">신청부터 결제까지 한 번에 연결되는 대회 접수 페이지</h1>
          <p className="site-hero__description">
            브랜드 랜딩의 분위기는 유지하고, 실제 신청 플로우는 더 명확하게 분리한 구조를 기준으로
            서비스 뼈대를 준비했습니다.
          </p>
          <div className="site-hero__actions">
            <Link to="/apply">
              <Button>신청하기</Button>
            </Link>
            <Link to="/lookup">
              <Button variant="ghost">신청 조회</Button>
            </Link>
          </div>
        </div>
        <aside className="site-hero__panel">
          <p className="site-hero__panel-title">핵심 일정</p>
          <ul className="site-hero__panel-list">
            {scheduleItems.map(([label, value]) => (
              <li key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </li>
            ))}
          </ul>
        </aside>
      </section>

      <section className="site-section">
        <SectionTitle
          eyebrow="Overview"
          title="메인 페이지는 브랜드 경험, 신청 페이지는 실사용 흐름에 맞춰 분리합니다."
          description="레퍼런스 이미지의 세리프 타이틀, 아이보리 배경, 네이비 포인트를 유지하면서 정보 전달은 더 분명하게 정리한 구조입니다."
        />
        <div className="site-grid site-grid--3">
          <article className="site-card">
            <h3>참가 대상</h3>
            <p>학생, 일반 참가자, 팀 단위 지원자까지 확장 가능한 기본 구조입니다.</p>
          </article>
          <article className="site-card">
            <h3>진행 방식</h3>
            <p>신청 입력, 검토, 결제, 완료, 조회로 흐름을 분리해 운영 리스크를 낮춥니다.</p>
          </article>
          <article className="site-card">
            <h3>파일 제출</h3>
            <p>업로드 메타데이터와 동의 이력을 분리 저장하는 방향으로 확장할 수 있습니다.</p>
          </article>
        </div>
      </section>

      <section className="site-section site-section--accent">
        <SectionTitle
          eyebrow="Prize"
          title="상금 및 혜택"
          description="랜딩 페이지에서는 가장 강조되는 정보만 압축해서 보여주는 편이 좋습니다."
        />
        <div className="site-grid site-grid--3">
          {prizeItems.map(([label, value]) => (
            <article className="site-card site-card--soft" key={label}>
              <h3>{label}</h3>
              <p>{value}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="site-section">
        <SectionTitle
          eyebrow="Process"
          title="신청 절차"
          description="정보 입력, 내용 확인, 결제, 접수 완료의 단계형 구조를 기준으로 구현합니다."
          align="center"
        />
        <div className="site-process">
          <div className="site-process__item">1. 신청 정보 입력</div>
          <div className="site-process__item">2. 신청 내용 확인</div>
          <div className="site-process__item">3. 결제 진행</div>
          <div className="site-process__item">4. 접수 완료</div>
        </div>
      </section>
    </PageShell>
  );
}
