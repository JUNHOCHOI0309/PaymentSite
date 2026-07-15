import { PageShell } from "../components/layout/PageShell";
import { privacyPolicy } from "../data/privacyPolicy";

export function PrivacyPage() {
  return (
    <PageShell>
      <section className="site-page site-page--narrow">
        <article className="site-document site-privacy">
          <p className="site-kicker">Privacy Policy</p>
          <h1>개인정보처리방침</h1>
          <p className="site-privacy__effective-date">
            버전 {privacyPolicy.version} · 시행일 {privacyPolicy.effectiveDate}
          </p>

          <p>
            모델라인 컴퍼니(주)(이하 "회사")는 MMKorea 웹사이트에서 제공하는 대회 참가 신청,
            무대 서비스 신청, 결제, 신청 조회 및 관련 서비스(이하 "서비스")를 운영하며,
            「개인정보 보호법」 등 관계 법령에 따라 이용자의 개인정보를 보호하고 관련 고충을
            신속하게 처리하기 위해 본 개인정보처리방침을 공개합니다.
          </p>

          <section className="site-privacy__operator" aria-label="개인정보처리자 정보">
            <h2>개인정보처리자 정보</h2>
            <dl>
              <div><dt>상호명</dt><dd>{privacyPolicy.operator.name}</dd></div>
              <div><dt>대표자</dt><dd>{privacyPolicy.operator.representative}</dd></div>
              <div><dt>사업자등록번호</dt><dd>{privacyPolicy.operator.businessNumber}</dd></div>
              <div><dt>주소</dt><dd>{privacyPolicy.operator.address}</dd></div>
              <div><dt>개인정보 보호책임자</dt><dd>{privacyPolicy.operator.privacyOfficer}</dd></div>
              <div><dt>개인정보 문의</dt><dd>{privacyPolicy.operator.phone}</dd></div>
            </dl>
          </section>

          <section className="site-privacy__article">
            <h2>1. 개인정보의 처리 목적 및 항목</h2>
            <p>회사는 아래 목적에 필요한 최소한의 개인정보를 처리하며, 목적 외 이용 시에는 관계 법령에 따른 절차를 따릅니다.</p>
            <div className="site-privacy__table-wrap">
              <table className="site-privacy__table">
                <thead>
                  <tr><th>처리 목적</th><th>필수 항목</th><th>선택 항목</th><th>보유 기간</th></tr>
                </thead>
                <tbody>
                  {privacyPolicy.collectionPurposes.map((item) => (
                    <tr key={item.purpose}>
                      <td>{item.purpose}</td><td>{item.required}</td><td>{item.optional}</td><td>{item.retention}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>카드번호, CVC, 계좌 비밀번호 등 결제 인증 정보는 회사가 직접 저장하지 않으며, 결제 과정에서 결제대행사에 의해 처리됩니다.</p>
          </section>

          <section className="site-privacy__article">
            <h2>2. 개인정보의 처리 및 보유 기간</h2>
            <p>회사는 처리 목적이 달성되면 개인정보를 지체 없이 파기합니다. 다만, 관계 법령에 따라 보존이 필요한 기록은 아래 기간 동안 별도로 보관합니다.</p>
            <div className="site-privacy__table-wrap">
              <table className="site-privacy__table site-privacy__table--compact">
                <thead><tr><th>보존 기록</th><th>근거</th><th>보존 기간</th></tr></thead>
                <tbody>
                  {privacyPolicy.legalRetention.map((item) => (
                    <tr key={item.record}><td>{item.record}</td><td>{item.basis}</td><td>{item.period}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="site-privacy__article">
            <h2>3. 개인정보의 수집 방법</h2>
            <p>회사는 대회 및 무대 서비스 신청 화면, 결제 절차, 신청 조회 이메일 인증, 고객 문의, 서비스 이용 과정에서 이용자가 직접 입력하거나 자동으로 생성되는 정보의 방식으로 개인정보를 수집합니다.</p>
          </section>

          <section className="site-privacy__article">
            <h2>4. 만 14세 미만 아동의 개인정보</h2>
            <p>회사는 만 14세 미만 아동을 대상으로 한 별도 서비스를 제공하지 않습니다. 만 14세 미만 아동의 개인정보 처리가 필요한 경우에는 법정대리인의 동의 등 관계 법령에서 요구하는 절차를 별도로 마련하여 진행합니다.</p>
          </section>

          <section className="site-privacy__article">
            <h2>5. 개인정보의 제3자 제공</h2>
            <p>회사는 원칙적으로 이용자의 개인정보를 제3자에게 제공하지 않습니다. 다만, 이용자의 별도 동의가 있거나 법령에 특별한 규정이 있는 경우, 또는 수사기관 등의 적법한 요청이 있는 경우에는 필요한 범위에서 제공할 수 있습니다.</p>
          </section>

          <section className="site-privacy__article">
            <h2>6. 개인정보 처리의 위탁 및 국외 이전</h2>
            <p>회사는 서비스 운영에 필요한 업무를 아래와 같이 외부 사업자에게 맡길 수 있으며, 수탁자가 개인정보를 안전하게 처리하도록 관리·감독합니다.</p>
            <div className="site-privacy__table-wrap">
              <table className="site-privacy__table site-privacy__table--compact">
                <thead><tr><th>수탁자</th><th>위탁 업무</th></tr></thead>
                <tbody>
                  {privacyPolicy.processors.map((item) => <tr key={item.name}><td>{item.name}</td><td>{item.work}</td></tr>)}
                </tbody>
              </table>
            </div>
            <h3>Cloudflare R2 국외 이전</h3>
            <p>회사는 참가자가 제출한 개인정보 포함 가능 파일을 APAC 위치의 Cloudflare R2 버킷에 보관합니다. APAC 위치는 대한민국 내 저장을 보장하지 않으므로, 해당 파일 보관은 개인정보의 국외 처리위탁 또는 보관으로 고지합니다.</p>
            <div className="site-privacy__table-wrap">
              <table className="site-privacy__table site-privacy__table--compact">
                <tbody>
                  <tr><th>이전 근거</th><td>{privacyPolicy.crossBorderTransfer.basis}</td></tr>
                  <tr><th>이전받는 자 및 연락처</th><td>{privacyPolicy.crossBorderTransfer.recipient}<br />{privacyPolicy.crossBorderTransfer.contact}</td></tr>
                  <tr><th>이전 국가</th><td>{privacyPolicy.crossBorderTransfer.country}</td></tr>
                  <tr><th>이전 항목</th><td>{privacyPolicy.crossBorderTransfer.items}</td></tr>
                  <tr><th>이전 시기 및 방법</th><td>{privacyPolicy.crossBorderTransfer.timingAndMethod}</td></tr>
                  <tr><th>이용 목적</th><td>{privacyPolicy.crossBorderTransfer.purpose}</td></tr>
                  <tr><th>보유·이용 기간</th><td>{privacyPolicy.crossBorderTransfer.retention}</td></tr>
                  <tr><th>거부 방법 및 영향</th><td>{privacyPolicy.crossBorderTransfer.refusal}</td></tr>
                </tbody>
              </table>
            </div>
            <p>제출 파일은 서버가 별도 객체 키를 생성하여 저장하고, 관리자 권한이 확인된 경우에만 다운로드할 수 있도록 운영합니다. 로고, 배너 등 개인정보가 포함되지 않은 공개 정적 리소스는 위 국외 이전 고지 대상에 포함하지 않습니다.</p>
          </section>

          <section className="site-privacy__article">
            <h2>7. 개인정보의 파기 절차 및 방법</h2>
            <p>보유 기간이 지나거나 처리 목적이 달성되어 개인정보가 불필요해진 경우, 내부 검토 후 지체 없이 파기합니다. 전자 파일은 복구할 수 없도록 삭제하고, 출력물은 분쇄 또는 소각 등의 방법으로 파기합니다. 법령에 따라 보관하는 기록은 다른 개인정보와 분리하여 보관합니다.</p>
          </section>

          <section className="site-privacy__article">
            <h2>8. 정보주체의 권리와 행사 방법</h2>
            <p>이용자는 회사에 대해 개인정보의 열람, 정정·삭제, 처리정지 및 동의 철회를 요구할 수 있습니다. 권리 행사는 아래 문의처로 연락하여 요청할 수 있으며, 회사는 본인 또는 정당한 대리인인지 확인한 후 관계 법령에서 정한 절차에 따라 처리합니다. 법령상 보관 의무가 있는 정보는 삭제 또는 처리정지 요구가 제한될 수 있습니다.</p>
          </section>

          <section className="site-privacy__article">
            <h2>9. 개인정보의 안전성 확보 조치</h2>
            <p>회사는 개인정보 접근 권한을 업무상 필요한 인원으로 제한하고, 관리자 인증·세션 관리·접근 기록·전송 구간 보안 등 기술적·관리적 조치를 적용합니다. 첨부파일은 임의의 공개 주소가 아닌 서버 검증 절차와 관리자 권한 확인을 거쳐 처리합니다.</p>
          </section>

          <section className="site-privacy__article">
            <h2>10. 쿠키 및 유사 기술</h2>
            <p>서비스는 보안, 접속 상태 유지 및 서비스 제공을 위해 쿠키 또는 유사 기술을 사용할 수 있습니다. 이용자는 브라우저 설정에서 쿠키 저장을 거부하거나 삭제할 수 있으나, 보안 또는 인증이 필요한 일부 기능의 이용이 제한될 수 있습니다.</p>
          </section>

          <section className="site-privacy__article">
            <h2>11. 개인정보 관련 문의 및 권익침해 구제</h2>
            <p>개인정보 처리와 관련한 문의, 불만 또는 권리 행사는 모델라인 컴퍼니(주)로 연락해 주시기 바랍니다. 전화: {privacyPolicy.operator.phone}</p>
            <p>개인정보 침해에 대한 상담 또는 분쟁조정이 필요한 경우 개인정보분쟁조정위원회(1833-6972, privacy.go.kr), 개인정보침해신고센터(국번 없이 118, privacy.kisa.or.kr), 대검찰청(1301, spo.go.kr), 경찰청(182)을 이용할 수 있습니다.</p>
          </section>

          <section className="site-privacy__article">
            <h2>12. 개인정보처리방침의 변경</h2>
            <p>본 방침은 법령, 서비스 또는 처리 방식의 변경에 따라 수정될 수 있습니다. 중요한 변경이 있는 경우 시행일과 변경 내용을 사이트를 통해 안내합니다.</p>
          </section>
        </article>
      </section>
    </PageShell>
  );
}
