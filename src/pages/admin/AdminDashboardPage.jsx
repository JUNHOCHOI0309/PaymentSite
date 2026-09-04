import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import excelDownloadIcon from "../../assets/excel-download-icon.png";
import { Button } from "../../components/common/Button";
import applicationDisciplineCatalog from "../../data/applicationDisciplineCatalog.json";
import {
  getHairAdditionalOptionLabels,
  getHairOptionChoices,
  getStagePhotoPackage,
  stageServiceItems,
  getStageServiceTitle,
  getStageVideoAdditionalDisciplineMeta,
  getVideoTypeOptions,
} from "../../data/stageServiceConfig";
import { formatStoredSnsIdentity } from "../../lib/applicationSns";
import {
  adminLogout,
  buildApiUrl,
  createAdminSmsCampaign,
  createAdminSmsMarketingOptOut,
  createAdminUser,
  deleteAdminSmsMarketingOptOut,
  deleteAdminApplication,
  getAdminAnalytics,
  getAdminApplications,
  getAdminAuditLogs,
  getAdminCanceledPayments,
  getAdminMe,
  getAdminRefundRequests,
  getAdminSmsCampaigns,
  getAdminSmsMarketingOptOuts,
  getAdminSpectators,
  getAdminStageServices,
  getAdminUsers,
  keepAliveAdminSession,
  previewAdminSmsCampaign,
  reconcileAdminKcpPayment,
  retryAdminRefundSync,
  retryAdminSmsCampaign,
  updateAdminApplication,
  updateAdminUser,
} from "../../lib/applicationApi";

function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatAmount(value) {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return "-";
  }

  return `${amount.toLocaleString("ko-KR")}원`;
}

function formatPercent(value) {
  const percent = Number(value);

  if (!Number.isFinite(percent)) {
    return "-";
  }

  return `${percent}%`;
}

function formatCountdown(seconds) {
  const safeSeconds = Math.max(0, Math.ceil(Number(seconds) || 0));
  const minutes = String(Math.floor(safeSeconds / 60)).padStart(2, "0");
  const remainingSeconds = String(safeSeconds % 60).padStart(2, "0");
  return `${minutes}:${remainingSeconds}`;
}

const ADMIN_IDLE_TIMEOUT_MS = 15 * 60 * 1000;
const ADMIN_IDLE_WARNING_MS = 60 * 1000;

function formatBirthDate(value) {
  if (!value) {
    return "-";
  }

  const normalized = String(value).trim();
  return normalized || "-";
}

function getLinkedApplications(row) {
  const linkedApplications = Array.isArray(row.linkedApplications)
    ? row.linkedApplications.filter((application) => application?.applicationNumber)
    : [];

  if (linkedApplications.length) {
    return linkedApplications;
  }

  return row.linkedApplicationNumber
    ? [{
      applicationNumber: row.linkedApplicationNumber,
      discipline: row.linkedDiscipline,
    }]
    : [];
}

function getLinkedApplicationNumbers(row) {
  return getLinkedApplications(row)
    .map((application) => application.applicationNumber)
    .filter(Boolean)
    .join(", ");
}

function getLinkedDisciplines(row) {
  return getLinkedApplications(row)
    .map((application) => application.discipline)
    .filter(Boolean)
    .join(", ");
}

function getStageServiceMeta(row) {
  const title = getStageServiceTitle(row.serviceType) || row.serviceType || "-";

  if (row.serviceType === "stage-photo") {
    const linkedApplications = getLinkedApplications(row);
    const stagePhotoPackage = getStagePhotoPackage(linkedApplications.length);

    if (stagePhotoPackage && Number(row.totalAmount) === Number(stagePhotoPackage.price)) {
      return {
        primary: `${title} / ${stagePhotoPackage.disciplineCount}종목`,
        secondary: `${stagePhotoPackage.photoCount}장 제공 / ${getLinkedDisciplines(row) || "-"}`,
      };
    }

    return {
      primary: title,
      secondary:
        row.photoHasAdditionalDiscipline === "O"
          ? `추가 종목 ${row.photoAdditionalDiscipline || "-"}`
          : "추가 종목 없음",
    };
  }

  if (row.serviceType === "stage-video") {
    const videoTypeLabel =
      getVideoTypeOptions().find((option) => option.value === row.videoType)?.label
      || row.videoType
      || "-";
    const additionalVideoLabel =
      getStageVideoAdditionalDisciplineMeta(row.videoAdditionalDiscipline, row.videoType)?.label
      || row.videoAdditionalDiscipline
      || "추가 촬영 없음";

    return {
      primary: `${title} / ${videoTypeLabel}`,
      secondary: additionalVideoLabel,
    };
  }

  if (row.serviceType === "hair-makeup") {
    const hairOptionLabel =
      getHairOptionChoices().find((option) => option.value === row.hairOption)?.label
      || row.hairOption
      || "-";
    const hairAdditionalOptionLabels = getHairAdditionalOptionLabels({
      hairOptionValue: row.hairOption,
      hairBodyMakeup: row.hairBodyMakeup,
      hairPiece: row.hairPiece,
      hairRetouchCount: row.hairRetouchCount,
    });
    const linkedDisciplines = getLinkedDisciplines(row) || "-";

    return {
      primary: `${title} / ${hairOptionLabel}`,
      secondary: `신청 종목 ${linkedDisciplines} / ${hairAdditionalOptionLabels.join(", ") || "추가 옵션 없음"}`,
    };
  }

  return {
    primary: title,
    secondary: "-",
  };
}

function MetaCell({ primary, secondary }) {
  return (
    <div className="site-admin-table__meta">
      <strong>{primary || "-"}</strong>
      {secondary ? <span>{secondary}</span> : null}
    </div>
  );
}

function maskAdminPhone(value) {
  const normalized = String(value || "").trim();

  if (!normalized) {
    return "-";
  }

  const digits = normalized.replace(/\D/g, "");
  if (digits.length < 7) {
    return normalized;
  }

  return `${digits.slice(0, 3)}-****-${digits.slice(-4)}`;
}

function maskAdminEmail(value) {
  const normalized = String(value || "").trim();
  const separatorIndex = normalized.indexOf("@");

  if (!normalized || separatorIndex < 1) {
    return normalized || "-";
  }

  const localPart = normalized.slice(0, separatorIndex);
  const domain = normalized.slice(separatorIndex + 1);
  return `${localPart.slice(0, Math.min(2, localPart.length))}***@${domain}`;
}

function getShortIdentifier(value) {
  const normalized = String(value || "").trim();

  if (!normalized || normalized.length <= 18) {
    return normalized || "-";
  }

  const prefix = normalized.includes("-") ? normalized.split("-").slice(0, 2).join("-") : normalized.slice(0, 8);
  return `${prefix}...${normalized.slice(-6)}`;
}

function getPaymentStatusMeta(value) {
  const status = String(value || "").toUpperCase();
  const statusMap = {
    DONE: { label: "결제 완료", tone: "success" },
    READY: { label: "결제 대기", tone: "warning" },
    CANCELED: { label: "환불 완료", tone: "refund" },
    PARTIAL_CANCELED: { label: "부분 환불", tone: "refund" },
    FAILED: { label: "결제 실패", tone: "danger" },
  };

  return statusMap[status] || { label: value || "상태 없음", tone: "neutral" };
}

function getServiceStatusMeta(value) {
  const status = String(value || "").toUpperCase();
  const statusMap = {
    READY: { label: "서비스 준비", tone: "warning" },
    PROCESSING: { label: "처리 중", tone: "info" },
    COMPLETED: { label: "서비스 완료", tone: "success" },
    CANCELED: { label: "서비스 취소", tone: "neutral" },
    REFUNDED: { label: "환불 완료", tone: "refund" },
  };

  return statusMap[status] || { label: value || "상태 없음", tone: "neutral" };
}

function getAdmissionStatusMeta(value) {
  const status = String(value || "").toUpperCase();
  const statusMap = {
    READY: { label: "입장 대기", tone: "warning" },
    ADMITTED: { label: "입장 완료", tone: "success" },
    REFUNDED: { label: "환불 완료", tone: "refund" },
    PARTIAL_REFUNDED: { label: "부분 환불", tone: "refund" },
  };

  return statusMap[status] || { label: value || "상태 없음", tone: "neutral" };
}

function StatusBadge({ meta }) {
  return (
    <span className={`site-admin-status-badge site-admin-status-badge--${meta.tone}`}>
      {meta.label}
    </span>
  );
}

function IdentifierCell({ value }) {
  const [isCopied, setIsCopied] = useState(false);

  async function handleCopy() {
    if (!value) {
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setIsCopied(true);
      window.setTimeout(() => setIsCopied(false), 1400);
    } catch (_error) {
      setIsCopied(false);
    }
  }

  return (
    <div className="site-admin-identifier">
      <strong title={value || undefined}>{getShortIdentifier(value)}</strong>
      <button onClick={handleCopy} type="button">{isCopied ? "복사됨" : "복사"}</button>
    </div>
  );
}

function PaymentStatusCell({ amount, status }) {
  return (
    <div className="site-admin-status-cell">
      <StatusBadge meta={getPaymentStatusMeta(status)} />
      <span>{amount == null ? "-" : formatAmount(amount)}</span>
    </div>
  );
}

function DocumentStatusCell({ files = [] }) {
  const count = files.length;
  const meta = count
    ? { label: `${count}개 제출`, tone: "success" }
    : { label: "미제출", tone: "neutral" };

  return (
    <div className="site-admin-status-cell">
      <StatusBadge meta={meta} />
      <span>{count ? "파일 확인 가능" : "첨부 없음"}</span>
    </div>
  );
}

function getParticipationCertificationPlatformLabel(value) {
  const labels = {
    facebook: "Facebook",
    instagram: "Instagram",
    x: "X",
  };

  return labels[value] || "SNS";
}

function ParticipationCertificationCell({ certification }) {
  if (!certification?.completed || !certification.postUrl) {
    return <StatusBadge meta={{ label: "인증 미제출", tone: "warning" }} />;
  }

  return (
    <div className="site-admin-certification">
      <a
        className="site-admin-certification__link"
        href={certification.postUrl}
        rel="noreferrer"
        target="_blank"
      >
        <StatusBadge meta={{ label: "인증 완료", tone: "info" }} />
      </a>
      <span>{getParticipationCertificationPlatformLabel(certification.sourcePlatform)}</span>
    </div>
  );
}

function DetailField({ label, value, wide = false }) {
  return (
    <div className={`site-admin-detail-drawer__field${wide ? " site-admin-detail-drawer__field--wide" : ""}`}>
      <dt>{label}</dt>
      <dd>{value || "-"}</dd>
    </div>
  );
}

function DetailSection({ children, title }) {
  return (
    <section className="site-admin-detail-drawer__section">
      <h3>{title}</h3>
      <dl className="site-admin-detail-drawer__grid">{children}</dl>
    </section>
  );
}

function AdminRecordDetailDrawer({ adminRole, detail, onClose, onDeleteApplication, onEditApplication }) {
  const { record, type } = detail;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const isApplication = type === "application";
  const isStageService = type === "stage-service";
  const identifier = isApplication
    ? record.applicationNumber
    : isStageService
      ? record.serviceOrderNumber
      : record.spectatorOrderNumber;
  const paymentAmount = isApplication ? record.paymentAmount : record.totalAmount;
  const participationMeta = record.participationCertification?.completed
    ? { label: "인증 완료", tone: "info" }
    : { label: "인증 미제출", tone: "warning" };

  return (
    <div className="site-admin-detail-drawer__backdrop" onMouseDown={onClose} role="presentation">
      <aside
        aria-label={`${record.name || "신청"} 상세 정보`}
        aria-modal="true"
        className="site-admin-detail-drawer"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="site-admin-detail-drawer__header">
          <div>
            <span>{isApplication ? "대회 신청" : isStageService ? "무대 서비스" : "참관객 신청"}</span>
            <h2>{record.name || "신청 상세"}</h2>
            <p>{identifier || "-"}</p>
          </div>
          <button aria-label="상세 패널 닫기" onClick={onClose} type="button">×</button>
        </header>

        <div className="site-admin-detail-drawer__status-row">
          <StatusBadge meta={getPaymentStatusMeta(record.paymentStatus)} />
          {isApplication ? (
            <StatusBadge meta={record.documentFiles?.length
              ? { label: `서류 ${record.documentFiles.length}개`, tone: "success" }
              : { label: "서류 미제출", tone: "neutral" }} />
          ) : null}
          {isStageService ? <StatusBadge meta={getServiceStatusMeta(record.serviceStatus)} /> : null}
          {!isApplication && !isStageService ? <StatusBadge meta={getAdmissionStatusMeta(record.admissionStatus)} /> : null}
          <StatusBadge meta={participationMeta} />
        </div>

        <div className="site-admin-detail-drawer__body">
          <DetailSection title="신청자 정보">
            <DetailField label="이름" value={record.name} />
            {isApplication ? <DetailField label="생년월일" value={formatBirthDate(record.birthDate)} /> : null}
            <DetailField label="연락처" value={record.phone} />
            <DetailField label="이메일" value={record.email} />
            {isApplication ? <DetailField label="소속" value={record.organization || "없음"} /> : null}
          </DetailSection>

          {isApplication ? (
            <>
              <DetailSection title="참가 정보">
                <DetailField label="부문" value={record.division} />
                <DetailField label="종목" value={record.discipline} />
                <DetailField label="성별" value={record.participantGender === "female" ? "여" : record.participantGender === "male" ? "남" : "-"} />
                <DetailField label="체급" value={record.weightClass} />
              </DetailSection>
              <DetailSection title="SNS 및 소개">
                <DetailField label="SNS" value={formatStoredSnsIdentity(record.snsIdentity || record.instagramId, "ko", "-")} wide />
                <DetailField label="자기소개" value={record.introduction || "작성 내용 없음"} wide />
              </DetailSection>
              <section className="site-admin-detail-drawer__section">
                <h3>{`제출 문서 ${record.documentFiles?.length || 0}개`}</h3>
                <DocumentDownloadLinks applicationNumber={record.applicationNumber} files={record.documentFiles} />
              </section>
            </>
          ) : null}

          {isStageService ? (
            <>
              <DetailSection title="서비스 정보">
                <DetailField label="서비스" value={getStageServiceMeta(record).primary} wide />
                <DetailField label="상세 옵션" value={getStageServiceMeta(record).secondary} wide />
                <DetailField label="서비스 상태" value={getServiceStatusMeta(record.serviceStatus).label} />
                <DetailField label="구매 일시" value={formatDateTime(record.purchasedAt)} />
              </DetailSection>
              <DetailSection title="연동 신청">
                <DetailField label="신청번호" value={getLinkedApplicationNumbers(record) || "연동 없음"} wide />
                <DetailField label="종목" value={getLinkedDisciplines(record) || "-"} wide />
              </DetailSection>
            </>
          ) : null}

          {!isApplication && !isStageService ? (
            <>
              <DetailSection title="입장권 정보">
                <DetailField label="수량" value={`${record.quantity || 1}매`} />
                <DetailField label="단가" value={formatAmount(record.unitAmount)} />
                <DetailField label="입장 상태" value={getAdmissionStatusMeta(record.admissionStatus).label} />
                <DetailField label="테스트 결제" value={record.isTest ? "예" : "아니오"} />
              </DetailSection>
              <DetailSection title="동의 정보">
                <DetailField label="개인정보" value={record.consents?.privacy ? "동의" : "미동의"} />
                <DetailField label="환불 규정" value={record.consents?.refund ? "동의" : "미동의"} />
                <DetailField label="마케팅 수신" value={record.consents?.marketing ? "동의" : "미동의"} />
                <DetailField label="사진·영상" value={record.consents?.photoVideo ? "동의" : "미동의"} />
              </DetailSection>
            </>
          ) : null}

          <DetailSection title="결제 정보">
            <DetailField label="결제 상태" value={getPaymentStatusMeta(record.paymentStatus).label} />
            <DetailField label="결제 금액" value={formatAmount(paymentAmount)} />
            <DetailField label="주문번호" value={record.orderId} wide />
            {!isApplication ? <DetailField label="결제키" value={record.paymentKey} wide /> : null}
            <DetailField label={isApplication ? "접수 일시" : "구매 일시"} value={formatDateTime(isApplication ? record.submittedAt : record.purchasedAt)} />
            {!isApplication && !isStageService ? <DetailField label="결제 완료" value={formatDateTime(record.paymentCompletedAt)} /> : null}
          </DetailSection>

          <DetailSection title="참가 인증">
            <DetailField label="상태" value={participationMeta.label} />
            <DetailField label="SNS" value={record.participationCertification?.completed ? getParticipationCertificationPlatformLabel(record.participationCertification.sourcePlatform) : "-"} />
            {record.participationCertification?.postUrl ? (
              <DetailField
                label="게시물"
                value={<a href={record.participationCertification.postUrl} rel="noreferrer" target="_blank">게시물 열기</a>}
                wide
              />
            ) : null}
          </DetailSection>
        </div>

        <footer className="site-admin-detail-drawer__footer">
          {isApplication && adminRole === "superadmin" ? (
            <button
              className="site-admin-action-button site-admin-action-button--danger"
              disabled={record.paymentStatus === "DONE"}
              onClick={() => onDeleteApplication(record)}
              title={record.paymentStatus === "DONE" ? "결제 완료 건은 환불 절차를 사용해야 합니다." : undefined}
              type="button"
            >
              신청 삭제
            </button>
          ) : <span />}
          <div>
            <button className="site-admin-action-button" onClick={onClose} type="button">닫기</button>
            {isApplication ? (
              <button className="site-admin-action-button site-admin-action-button--primary" onClick={() => onEditApplication(record)} type="button">
                정보 수정
              </button>
            ) : null}
          </div>
        </footer>
      </aside>
    </div>
  );
}

function SummaryCard({ label, value }) {
  return (
    <article className="site-admin-summary-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function formatAnalyticsPeriod(value, bucket) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  if (bucket === "month") {
    return new Intl.DateTimeFormat("ko-KR", { year: "2-digit", month: "2-digit" }).format(date);
  }

  return new Intl.DateTimeFormat("ko-KR", { month: "2-digit", day: "2-digit" }).format(date);
}

function AnalyticsFunnelCard({ source }) {
  const draftCount = Math.max(0, Number(source.draftCount) || 0);
  const orderCount = Math.max(0, Number(source.orderCount) || 0);
  const completedCount = Math.max(0, Number(source.completedCount) || 0);
  const orderWidth = draftCount > 0 ? Math.max(3, (orderCount / draftCount) * 100) : 0;
  const completedWidth = draftCount > 0 ? Math.max(3, (completedCount / draftCount) * 100) : 0;

  return (
    <article className="site-admin-analytics-funnel">
      <div className="site-admin-analytics-funnel__header">
        <div>
          <span>신청 유형</span>
          <h3>{source.label}</h3>
        </div>
        <strong>{`${source.conversionRate}%`}</strong>
      </div>
      <div className="site-admin-analytics-funnel__steps">
        <div className="site-admin-analytics-funnel__step">
          <span style={{ width: draftCount ? "100%" : "0%" }} />
          <p><b>초안 생성</b><strong>{draftCount.toLocaleString("ko-KR")}</strong></p>
        </div>
        <div className="site-admin-analytics-funnel__step">
          <span style={{ width: `${orderWidth}%` }} />
          <p><b>주문 생성</b><strong>{orderCount.toLocaleString("ko-KR")}</strong></p>
        </div>
        <div className="site-admin-analytics-funnel__step site-admin-analytics-funnel__step--completed">
          <span style={{ width: `${completedWidth}%` }} />
          <p><b>결제 승인</b><strong>{completedCount.toLocaleString("ko-KR")}</strong></p>
        </div>
      </div>
      <dl className="site-admin-analytics-funnel__details">
        <div><dt>현재 결제 유지</dt><dd>{source.paidCount.toLocaleString("ko-KR")}</dd></div>
        <div><dt>결제 대기</dt><dd>{source.readyCount.toLocaleString("ko-KR")}</dd></div>
        <div><dt>취소 / 실패</dt><dd>{(source.canceledCount + source.failedCount).toLocaleString("ko-KR")}</dd></div>
        <div><dt>완료 환불</dt><dd>{source.refundCount.toLocaleString("ko-KR")}</dd></div>
        <div><dt>결제 승인액</dt><dd>{formatAmount(source.approvedAmount)}</dd></div>
        <div><dt>기간 순결제액</dt><dd>{formatAmount(source.netAmount)}</dd></div>
      </dl>
    </article>
  );
}

function AnalyticsTrendChart({ rows, bucket }) {
  const maxAmount = Math.max(1, ...rows.map((row) => Number(row.approvedAmount) || 0));

  if (!rows.length) {
    return <div className="site-admin-loading">선택한 기간의 결제 또는 환불 데이터가 없습니다.</div>;
  }

  return (
    <div className="site-admin-analytics-trend" role="img" aria-label="기간별 결제 승인액과 환불액 추이">
      <div className="site-admin-analytics-trend__legend" aria-hidden="true">
        <span><i className="site-admin-analytics-trend__key site-admin-analytics-trend__key--sales" />결제 승인액</span>
        <span><i className="site-admin-analytics-trend__key site-admin-analytics-trend__key--refund" />환불 완료액</span>
      </div>
      <div className="site-admin-analytics-trend__viewport">
        <div className="site-admin-analytics-trend__plot">
          {rows.map((row) => {
            const approvedAmount = Number(row.approvedAmount) || 0;
            const refundedAmount = Number(row.refundedAmount) || 0;
            const approvedHeight = approvedAmount > 0 ? Math.max(4, (approvedAmount / maxAmount) * 100) : 0;
            const refundedHeight = refundedAmount > 0 ? Math.max(4, (refundedAmount / maxAmount) * 100) : 0;

            return (
              <div className="site-admin-analytics-trend__item" key={row.periodStart}>
                <div className="site-admin-analytics-trend__bars" title={`승인 ${formatAmount(approvedAmount)} / 환불 ${formatAmount(refundedAmount)}`}>
                  <span className="site-admin-analytics-trend__bar site-admin-analytics-trend__bar--sales" style={{ height: `${approvedHeight}%` }} />
                  <span className="site-admin-analytics-trend__bar site-admin-analytics-trend__bar--refund" style={{ height: `${refundedHeight}%` }} />
                </div>
                <span className="site-admin-analytics-trend__label">{formatAnalyticsPeriod(row.periodStart, bucket)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DownloadLinkCell({ applicationNumber, fileReference, filename, emptyLabel = "-" }) {
  if (!filename) {
    return <span>{emptyLabel}</span>;
  }

  const href = buildApiUrl(
    `/api/admin/applications/${encodeURIComponent(applicationNumber)}/files/${encodeURIComponent(fileReference)}/download`,
  );

  return (
    <a
      className="site-admin-file-links__item"
      href={href}
      rel="noreferrer"
      target="_blank"
    >
      {filename}
    </a>
  );
}

function DocumentDownloadLinks({ applicationNumber, files = [] }) {
  if (!files.length) {
    return <span>-</span>;
  }

  return (
    <div className="site-admin-file-links">
      {files.map((file) => (
        <DownloadLinkCell
          applicationNumber={applicationNumber}
          fileReference={String(file.id)}
          filename={file.originalFilename}
          key={file.id}
        />
      ))}
    </div>
  );
}

function normalizeSearchValue(value) {
  return String(value || "").trim().toLowerCase();
}

function matchesSearch(query, ...values) {
  const normalizedQuery = normalizeSearchValue(query);

  if (!normalizedQuery) {
    return true;
  }

  return values.some((value) => normalizeSearchValue(value).includes(normalizedQuery));
}

function normalizeWorkbookCell(value) {
  if (value == null) {
    return "";
  }

  const normalizedValue =
    typeof value === "object" ? JSON.stringify(value) : String(value);

  return /^[=+\-@\t\r]/.test(normalizedValue)
    ? `'${normalizedValue}`
    : normalizedValue;
}

function sanitizeSheetName(value) {
  return String(value || "Sheet1")
    .replace(/[\\/*?:[\]]/g, " ")
    .trim()
    .slice(0, 31) || "Sheet1";
}

function getWorksheetColumns(rows) {
  if (!rows.length) {
    return [];
  }

  return rows[0].map((_, index) => {
    const width = rows.reduce((max, row) => {
      const cellLength = normalizeWorkbookCell(row[index]).length;
      return Math.max(max, cellLength);
    }, 0);

    return {
      width: Math.min(Math.max(width + 2, 12), 48),
    };
  });
}

async function downloadWorkbookFile(filename, sheetName, columns, rows) {
  if (!rows.length) {
    return;
  }

  const excelModule = await import("exceljs");
  const ExcelJS = excelModule.default || excelModule;

  if (typeof ExcelJS?.Workbook !== "function") {
    throw new Error("엑셀 내보내기 모듈을 불러오지 못했습니다.");
  }

  const worksheetRows = [
    columns.map((column) => column.label),
    ...rows.map((row) =>
      columns.map((column) =>
        normalizeWorkbookCell(column.getValue ? column.getValue(row) : row[column.key]),
      ),
    ),
  ];
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sanitizeSheetName(sheetName));
  worksheet.addRows(worksheetRows);
  worksheet.columns = getWorksheetColumns(worksheetRows);
  worksheet.getRow(1).font = { bold: true };

  const workbookBuffer = await workbook.xlsx.writeBuffer({
    useSharedStrings: true,
    useStyles: true,
  });
  const blob = new Blob([workbookBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

function compareSortValues(left, right) {
  const leftValue = left == null ? "" : left;
  const rightValue = right == null ? "" : right;

  if (typeof leftValue === "number" && typeof rightValue === "number") {
    return leftValue - rightValue;
  }

  if (leftValue instanceof Date && rightValue instanceof Date) {
    return leftValue.getTime() - rightValue.getTime();
  }

  const normalizedLeft = String(leftValue).trim();
  const normalizedRight = String(rightValue).trim();

  return normalizedLeft.localeCompare(normalizedRight, "ko-KR", {
    numeric: true,
    sensitivity: "base",
  });
}

function SectionControls({
  searchValue,
  onSearchChange,
  searchPlaceholder,
  filterValue = "all",
  onFilterChange = null,
  filterOptions = [],
  additionalFilters = [],
  onDownload = null,
  downloadLabel = "엑셀 다운로드",
  downloadDisabled = false,
}) {
  async function handleDownloadClick() {
    if (!onDownload) {
      return;
    }

    try {
      await onDownload();
    } catch (error) {
      console.error("Failed to export workbook:", error);
    }
  }

  return (
    <div className="site-admin-controls">
      <input
        className="site-admin-controls__search"
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder={searchPlaceholder}
        type="search"
        value={searchValue}
      />
      {onFilterChange ? (
        <select
          className="site-admin-controls__select"
          onChange={(event) => onFilterChange(event.target.value)}
          value={filterValue}
        >
          <option value="all">전체</option>
          {filterOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : null}
      {additionalFilters.map((filter) => (
        <select
          className="site-admin-controls__select"
          key={filter.key}
          onChange={(event) => filter.onChange(event.target.value)}
          value={filter.value}
        >
          <option value="all">{filter.allLabel || "전체"}</option>
          {filter.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ))}
      {onDownload ? (
        <button
          className="site-admin-controls__download"
          disabled={downloadDisabled}
          onClick={handleDownloadClick}
          type="button"
        >
          <img
            alt=""
            aria-hidden="true"
            className="site-admin-controls__download-icon"
            src={excelDownloadIcon}
          />
          <span>{downloadLabel}</span>
        </button>
      ) : null}
    </div>
  );
}

function TableSection({
  title,
  columns,
  rows,
  emptyText,
  tableClassName = "",
  pageSize = 20,
  defaultSortKey: preferredDefaultSortKey = "",
  defaultSortDirection = "desc",
  pagination = null,
  onPageChange = null,
  controlledSortKey = null,
  controlledSortDirection = null,
  onSortChange = null,
}) {
  const isColumnSortable = useCallback(
    (column) =>
      column.sortable !== false
      && (typeof column.sortValue === "function"
        || rows.some((row) => row?.[column.key] != null && row?.[column.key] !== "")),
    [rows],
  );
  const sortableColumns = useMemo(
    () => columns.filter((column) => isColumnSortable(column)),
    [columns, isColumnSortable],
  );
  const fallbackDefaultSortKey = sortableColumns[0]?.key || "";
  const defaultSortKey = sortableColumns.some(
    (column) => column.key === preferredDefaultSortKey,
  )
    ? preferredDefaultSortKey
    : fallbackDefaultSortKey;
  const [localSortKey, setLocalSortKey] = useState(defaultSortKey);
  const [localSortDirection, setLocalSortDirection] = useState(defaultSortDirection);
  const [page, setPage] = useState(1);
  const isRemotePagination = Boolean(pagination && onPageChange);
  const sortKey = controlledSortKey || localSortKey;
  const sortDirection = controlledSortDirection || localSortDirection;

  useEffect(() => {
    if (!sortableColumns.some((column) => column.key === sortKey)) {
      setLocalSortKey(defaultSortKey);
    }
  }, [defaultSortKey, sortKey, sortableColumns]);

  useEffect(() => {
    setPage(1);
  }, [rows]);

  const sortedRows = useMemo(() => {
    if (isRemotePagination) {
      return rows;
    }
    if (!sortKey) {
      return rows;
    }

    const targetColumn = columns.find((column) => column.key === sortKey);

    if (!targetColumn || !isColumnSortable(targetColumn)) {
      return rows;
    }

    const readSortValue =
      targetColumn.sortValue || ((row) => row?.[targetColumn.key]);

    return [...rows].sort((leftRow, rightRow) => {
      const comparison = compareSortValues(
        readSortValue(leftRow),
        readSortValue(rightRow),
      );

      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [columns, isRemotePagination, rows, sortDirection, sortKey]);

  const totalPages = isRemotePagination
    ? Math.max(1, Number(pagination.totalPages) || 1)
    : Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const currentPage = isRemotePagination
    ? Math.min(Number(pagination.page) || 1, totalPages)
    : Math.min(page, totalPages);
  const pagedRows = useMemo(() => {
    if (isRemotePagination) {
      return sortedRows;
    }
    const startIndex = (currentPage - 1) * pageSize;
    return sortedRows.slice(startIndex, startIndex + pageSize);
  }, [currentPage, isRemotePagination, pageSize, sortedRows]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  function handleSort(column) {
    if (!isColumnSortable(column)) {
      return;
    }

    if (sortKey === column.key) {
      const nextDirection = sortDirection === "asc" ? "desc" : "asc";
      if (onSortChange) {
        onSortChange({ sortKey, sortDirection: nextDirection });
      } else {
        setLocalSortDirection(nextDirection);
      }
      return;
    }

    if (onSortChange) {
      onSortChange({ sortKey: column.key, sortDirection: "desc" });
    } else {
      setLocalSortKey(column.key);
      setLocalSortDirection("asc");
    }
  }

  return (
    <section className="site-admin-section">
      <div className="site-admin-section__header">
        <h2>{title}</h2>
      </div>
      <div className="site-admin-table-wrap">
        <table className={`site-admin-table ${tableClassName}`.trim()}>
          <thead>
            <tr>
              {columns.map((column) => (
                <th className={column.className || undefined} key={column.key}>
                  {column.sortable === false ? (
                    column.label
                  ) : isColumnSortable(column) ? (
                    <button
                      className={`site-admin-table__sort ${
                        sortKey === column.key ? "site-admin-table__sort--active" : ""
                      }`.trim()}
                      onClick={() => handleSort(column)}
                      type="button"
                    >
                      <span>{column.label}</span>
                      <span className="site-admin-table__sort-icon" aria-hidden="true">
                        {sortKey === column.key
                          ? sortDirection === "asc"
                            ? "▲"
                            : "▼"
                          : "↕"}
                      </span>
                    </button>
                  ) : (
                    column.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pagedRows.length ? (
              pagedRows.map((row, index) => (
                <tr key={`${row.refundTarget || ""}:${row.id || row.orderId || row.applicationNumber || index}`}>
                  {columns.map((column) => (
                    <td className={column.className || undefined} key={`${column.key}-${index}`}>
                      {column.render ? column.render(row) : row[column.key] || "-"}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td className="site-admin-table__empty" colSpan={columns.length}>
                  {emptyText}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {rows.length ? (
        <div className="site-admin-pagination">
          <span className="site-admin-pagination__summary">
            총 {isRemotePagination ? pagination.totalCount : rows.length}건 / {currentPage} / {totalPages} 페이지
          </span>
          <div className="site-admin-pagination__actions">
            <button
              className="site-admin-pagination__button"
              disabled={currentPage <= 1}
              onClick={() => (isRemotePagination ? onPageChange(1) : setPage(1))}
              type="button"
            >
              처음
            </button>
            <button
              className="site-admin-pagination__button"
              disabled={currentPage <= 1}
              onClick={() => (isRemotePagination ? onPageChange(Math.max(1, currentPage - 1)) : setPage((value) => Math.max(1, value - 1)))}
              type="button"
            >
              이전
            </button>
            <button
              className="site-admin-pagination__button"
              disabled={currentPage >= totalPages}
              onClick={() => (isRemotePagination ? onPageChange(Math.min(totalPages, currentPage + 1)) : setPage((value) => Math.min(totalPages, value + 1)))}
              type="button"
            >
              다음
            </button>
            <button
              className="site-admin-pagination__button"
              disabled={currentPage >= totalPages}
              onClick={() => (isRemotePagination ? onPageChange(totalPages) : setPage(totalPages))}
              type="button"
            >
              마지막
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function AdminDialog({ children, onClose, title }) {
  return (
    <div className="site-admin-dialog-backdrop" onMouseDown={onClose} role="presentation">
      <section
        aria-modal="true"
        className="site-admin-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="site-admin-dialog__header">
          <h2>{title}</h2>
          <button aria-label="닫기" className="site-admin-dialog__close" onClick={onClose} type="button">
            ×
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function ApplicationEditor({ application, form, isSubmitting, onChange, onClose, onSubmit }) {
  const disciplineItems = Array.isArray(applicationDisciplineCatalog.items)
    ? applicationDisciplineCatalog.items
    : [];

  return (
    <AdminDialog onClose={onClose} title={`신청 정보 수정 · ${application.applicationNumber}`}>
      <form className="site-admin-form" onSubmit={onSubmit}>
        <p className="site-admin-form__notice">
          신청자 정보만 수정합니다. 결제 상태와 환불 이력은 이 화면에서 변경되지 않습니다.
        </p>
        <div className="site-admin-form__grid">
          <label className="site-admin-form__field">
            <span>성함</span>
            <input name="name" onChange={onChange} required value={form.name} />
          </label>
          <label className="site-admin-form__field">
            <span>연락처</span>
            <input name="phone" onChange={onChange} required value={form.phone} />
          </label>
          <label className="site-admin-form__field">
            <span>이메일</span>
            <input name="email" onChange={onChange} required type="email" value={form.email} />
          </label>
          <label className="site-admin-form__field">
            <span>생년월일</span>
            <input name="birthDate" onChange={onChange} value={form.birthDate} />
          </label>
          <label className="site-admin-form__field">
            <span>소속</span>
            <input name="organization" onChange={onChange} value={form.organization} />
          </label>
          <label className="site-admin-form__field">
            <span>SNS 저장값</span>
            <input name="snsIdentity" onChange={onChange} value={form.snsIdentity} />
          </label>
          <label className="site-admin-form__field">
            <span>부문</span>
            <input name="division" onChange={onChange} value={form.division} />
          </label>
          <label className="site-admin-form__field">
            <span>종목</span>
            <select name="discipline" onChange={onChange} value={form.discipline}>
              {disciplineItems.map((item) => (
                <option key={item.title} value={item.title}>{item.title}</option>
              ))}
            </select>
          </label>
          <label className="site-admin-form__field">
            <span>체급</span>
            <input name="weightClass" onChange={onChange} value={form.weightClass} />
          </label>
          <label className="site-admin-form__field site-admin-form__field--wide">
            <span>자기소개</span>
            <textarea maxLength="100" name="introduction" onChange={onChange} value={form.introduction} />
          </label>
        </div>
        <div className="site-admin-form__actions">
          <button className="site-admin-action-button" onClick={onClose} type="button">취소</button>
          <button className="site-admin-action-button site-admin-action-button--primary" disabled={isSubmitting} type="submit">
            {isSubmitting ? "저장 중..." : "변경 저장"}
          </button>
        </div>
      </form>
    </AdminDialog>
  );
}

function AdminUserEditor({ adminUser, form, isSubmitting, isCurrentUser, onChange, onClose, onSubmit }) {
  const isCreate = !adminUser;

  return (
    <AdminDialog onClose={onClose} title={isCreate ? "관리자 계정 추가" : "관리자 계정 수정"}>
      <form className="site-admin-form" onSubmit={onSubmit}>
        <div className="site-admin-form__grid">
          {isCreate ? (
            <label className="site-admin-form__field site-admin-form__field--wide">
              <span>이메일</span>
              <input name="email" onChange={onChange} required type="email" value={form.email} />
            </label>
          ) : (
            <label className="site-admin-form__field site-admin-form__field--wide">
              <span>이메일</span>
              <input disabled value={adminUser.email} />
            </label>
          )}
          <label className="site-admin-form__field">
            <span>표시 이름</span>
            <input name="displayName" onChange={onChange} required value={form.displayName} />
          </label>
          <label className="site-admin-form__field">
            <span>권한</span>
            <select disabled={isCurrentUser} name="role" onChange={onChange} value={form.role}>
              <option value="admin">admin</option>
              <option value="superadmin">superadmin</option>
            </select>
          </label>
          <label className="site-admin-form__field">
            <span>{isCreate ? "초기 비밀번호" : "새 비밀번호"}</span>
            <input
              minLength="12"
              name="password"
              onChange={onChange}
              placeholder={isCreate ? "12자 이상" : "변경할 때만 입력"}
              required={isCreate}
              type="password"
              value={form.password}
            />
          </label>
          {!isCreate ? (
            <label className="site-admin-form__field">
              <span>계정 상태</span>
              <select disabled={isCurrentUser} name="isActive" onChange={onChange} value={String(form.isActive)}>
                <option value="true">활성</option>
                <option value="false">비활성</option>
              </select>
            </label>
          ) : null}
        </div>
        <p className="site-admin-form__notice">
          비밀번호 변경 또는 계정 비활성화 시 해당 계정의 기존 로그인 세션은 즉시 만료됩니다.
        </p>
        <div className="site-admin-form__actions">
          <button className="site-admin-action-button" onClick={onClose} type="button">취소</button>
          <button className="site-admin-action-button site-admin-action-button--primary" disabled={isSubmitting} type="submit">
            {isSubmitting ? "저장 중..." : isCreate ? "계정 추가" : "변경 저장"}
          </button>
        </div>
      </form>
    </AdminDialog>
  );
}

export function AdminDashboardPage() {
  const navigate = useNavigate();
  const [adminUser, setAdminUser] = useState(null);
  const [applications, setApplications] = useState([]);
  const [applicationSummary, setApplicationSummary] = useState({ totalCount: 0, paidCount: 0 });
  const [stageServices, setStageServices] = useState([]);
  const [spectators, setSpectators] = useState([]);
  const [spectatorSummary, setSpectatorSummary] = useState({
    totalCount: 0,
    paidCount: 0,
    soldCount: 0,
    capacity: 500,
  });
  const [refundRequests, setRefundRequests] = useState([]);
  const [refunds, setRefunds] = useState([]);
  const [adminUsers, setAdminUsers] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [analyticsRange, setAnalyticsRange] = useState("30d");
  const [analytics, setAnalytics] = useState(null);
  const [isAnalyticsLoading, setIsAnalyticsLoading] = useState(false);
  const [smsCampaigns, setSmsCampaigns] = useState([]);
  const [smsMarketingOptOuts, setSmsMarketingOptOuts] = useState([]);
  const [smsCampaignForm, setSmsCampaignForm] = useState({
    messageKind: "NOTICE",
    audience: "ALL_PAID",
    content: "",
  });
  const [smsCampaignPreview, setSmsCampaignPreview] = useState(null);
  const [isSmsPreviewing, setIsSmsPreviewing] = useState(false);
  const [isSendingSmsCampaign, setIsSendingSmsCampaign] = useState(false);
  const [retryingSmsCampaignId, setRetryingSmsCampaignId] = useState(null);
  const [smsOptOutForm, setSmsOptOutForm] = useState({ phone: "", reason: "" });
  const [isSavingSmsOptOut, setIsSavingSmsOptOut] = useState(false);
  const [activeSection, setActiveSection] = useState("overview");
  const [applicationSearch, setApplicationSearch] = useState("");
  const [applicationPaymentStatusFilter, setApplicationPaymentStatusFilter] = useState("all");
  const [applicationDivisionFilter, setApplicationDivisionFilter] = useState("all");
  const [applicationDisciplineFilter, setApplicationDisciplineFilter] = useState("all");
  const [applicationPage, setApplicationPage] = useState(1);
  const [applicationPagination, setApplicationPagination] = useState({
    page: 1,
    pageSize: 50,
    totalCount: 0,
    totalPages: 1,
  });
  const [applicationSort, setApplicationSort] = useState({
    sortKey: "submittedAt",
    sortDirection: "desc",
  });
  const [stageServiceSearch, setStageServiceSearch] = useState("");
  const [stageServiceTypeFilter, setStageServiceTypeFilter] = useState("all");
  const [stageServicePage, setStageServicePage] = useState(1);
  const [stageServicePagination, setStageServicePagination] = useState({
    page: 1,
    pageSize: 50,
    totalCount: 0,
    totalPages: 1,
  });
  const [stageServiceSort, setStageServiceSort] = useState({
    sortKey: "purchasedAt",
    sortDirection: "desc",
  });
  const [spectatorSearch, setSpectatorSearch] = useState("");
  const [spectatorPaymentStatusFilter, setSpectatorPaymentStatusFilter] = useState("all");
  const [spectatorAdmissionStatusFilter, setSpectatorAdmissionStatusFilter] = useState("all");
  const [spectatorPage, setSpectatorPage] = useState(1);
  const [spectatorPagination, setSpectatorPagination] = useState({
    page: 1,
    pageSize: 50,
    totalCount: 0,
    totalPages: 1,
  });
  const [spectatorSort, setSpectatorSort] = useState({
    sortKey: "purchasedAt",
    sortDirection: "desc",
  });
  const [refundRequestSearch, setRefundRequestSearch] = useState("");
  const [refundRequestStatusFilter, setRefundRequestStatusFilter] = useState("all");
  const [refundRequestPage, setRefundRequestPage] = useState(1);
  const [refundRequestPagination, setRefundRequestPagination] = useState({
    page: 1,
    pageSize: 50,
    totalCount: 0,
    totalPages: 1,
  });
  const [refundRequestSummary, setRefundRequestSummary] = useState({
    totalCount: 0,
    processingCount: 0,
    completedCount: 0,
    failedCount: 0,
  });
  const [refundRequestSort, setRefundRequestSort] = useState({
    sortKey: "createdAt",
    sortDirection: "desc",
  });
  const [refundPaymentSearch, setRefundPaymentSearch] = useState("");
  const [refundPaymentStatusFilter, setRefundPaymentStatusFilter] = useState("all");
  const [refundPaymentPage, setRefundPaymentPage] = useState(1);
  const [refundPaymentPagination, setRefundPaymentPagination] = useState({
    page: 1,
    pageSize: 50,
    totalCount: 0,
    totalPages: 1,
  });
  const [refundPaymentSort, setRefundPaymentSort] = useState({
    sortKey: "updatedAt",
    sortDirection: "desc",
  });
  const [auditSearch, setAuditSearch] = useState("");
  const [auditActionFilter, setAuditActionFilter] = useState("all");
  const [auditPage, setAuditPage] = useState(1);
  const [auditPagination, setAuditPagination] = useState({
    page: 1,
    pageSize: 50,
    totalCount: 0,
    totalPages: 1,
  });
  const [auditSort, setAuditSort] = useState({
    sortKey: "createdAt",
    sortDirection: "desc",
  });
  const [retryingRefundRequestId, setRetryingRefundRequestId] = useState(null);
  const [kcpReconcileOrderId, setKcpReconcileOrderId] = useState("");
  const [isReconcilingKcp, setIsReconcilingKcp] = useState(false);
  const [kcpReconcileMessage, setKcpReconcileMessage] = useState("");
  const [editingApplication, setEditingApplication] = useState(null);
  const [applicationForm, setApplicationForm] = useState(null);
  const [recordDetail, setRecordDetail] = useState(null);
  const [editingAdminUser, setEditingAdminUser] = useState(null);
  const [adminUserForm, setAdminUserForm] = useState(null);
  const [isSavingApplication, setIsSavingApplication] = useState(false);
  const [isSavingAdminUser, setIsSavingAdminUser] = useState(false);
  const [isIdleWarningOpen, setIsIdleWarningOpen] = useState(false);
  const [idleSecondsRemaining, setIdleSecondsRemaining] = useState(
    Math.ceil(ADMIN_IDLE_TIMEOUT_MS / 1000),
  );
  const [isExtendingAdminSession, setIsExtendingAdminSession] = useState(false);
  const lastAdminActivityAtRef = useRef(Date.now());
  const isIdleWarningOpenRef = useRef(false);
  const isAutoLogoutRunningRef = useRef(false);
  const resetIdleTimersRef = useRef(null);
  const hasInitializedAdminDataRef = useRef(false);
  const skipInitialApplicationQueryRef = useRef(true);
  const skipInitialStageServiceQueryRef = useRef(true);
  const skipInitialSpectatorQueryRef = useRef(true);
  const skipInitialAuditQueryRef = useRef(true);
  const skipInitialRefundRequestQueryRef = useRef(true);
  const skipInitialRefundPaymentQueryRef = useRef(true);

  const forceAdminLogout = useCallback(async () => {
    if (isAutoLogoutRunningRef.current) {
      return;
    }

    isAutoLogoutRunningRef.current = true;

    try {
      await adminLogout();
    } catch (_error) {
      // The local session may already have expired on the API server.
    } finally {
      navigate("/admin/login", { replace: true });
    }
  }, [navigate]);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialAdminDataLoaded, setIsInitialAdminDataLoaded] = useState(false);

  const applicationQuery = useMemo(
    () => ({
      page: applicationPage,
      pageSize: 50,
      paymentStatus: applicationPaymentStatusFilter,
      division: applicationDivisionFilter,
      discipline: applicationDisciplineFilter,
      search: applicationSearch,
      sortKey: applicationSort.sortKey,
      sortDirection: applicationSort.sortDirection,
    }),
    [
      applicationDisciplineFilter,
      applicationDivisionFilter,
      applicationPage,
      applicationPaymentStatusFilter,
      applicationSearch,
      applicationSort,
    ],
  );

  const stageServiceQuery = useMemo(
    () => ({
      page: stageServicePage,
      pageSize: 50,
      search: stageServiceSearch,
      serviceType: stageServiceTypeFilter,
      sortKey: stageServiceSort.sortKey,
      sortDirection: stageServiceSort.sortDirection,
    }),
    [stageServicePage, stageServiceSearch, stageServiceSort, stageServiceTypeFilter],
  );

  const spectatorQuery = useMemo(
    () => ({
      page: spectatorPage,
      pageSize: 50,
      search: spectatorSearch,
      paymentStatus: spectatorPaymentStatusFilter,
      admissionStatus: spectatorAdmissionStatusFilter,
      sortKey: spectatorSort.sortKey,
      sortDirection: spectatorSort.sortDirection,
    }),
    [
      spectatorAdmissionStatusFilter,
      spectatorPage,
      spectatorPaymentStatusFilter,
      spectatorSearch,
      spectatorSort,
    ],
  );

  const auditQuery = useMemo(
    () => ({
      page: auditPage,
      pageSize: 50,
      search: auditSearch,
      action: auditActionFilter,
      sortKey: auditSort.sortKey,
      sortDirection: auditSort.sortDirection,
    }),
    [auditActionFilter, auditPage, auditSearch, auditSort],
  );

  const refundRequestQuery = useMemo(
    () => ({
      page: refundRequestPage,
      pageSize: 50,
      search: refundRequestSearch,
      requestStatus: refundRequestStatusFilter,
      sortKey: refundRequestSort.sortKey,
      sortDirection: refundRequestSort.sortDirection,
    }),
    [refundRequestPage, refundRequestSearch, refundRequestSort, refundRequestStatusFilter],
  );

  const refundPaymentQuery = useMemo(
    () => ({
      page: refundPaymentPage,
      pageSize: 50,
      search: refundPaymentSearch,
      paymentStatus: refundPaymentStatusFilter,
      sortKey: refundPaymentSort.sortKey,
      sortDirection: refundPaymentSort.sortDirection,
    }),
    [refundPaymentPage, refundPaymentSearch, refundPaymentSort, refundPaymentStatusFilter],
  );

  const loadApplications = useCallback(async () => {
    const response = await getAdminApplications(applicationQuery);
    setApplications(response.applications || []);
    setApplicationSummary(response.summary || { totalCount: response.applications?.length || 0, paidCount: 0 });
    setApplicationPagination(response.pagination || {
      page: 1,
      pageSize: 50,
      totalCount: response.applications?.length || 0,
      totalPages: 1,
    });
  }, [applicationQuery]);

  const loadStageServices = useCallback(async () => {
    const response = await getAdminStageServices(stageServiceQuery);
    setStageServices(response.stageServices || []);
    setStageServicePagination(response.pagination || {
      page: 1,
      pageSize: 50,
      totalCount: response.stageServices?.length || 0,
      totalPages: 1,
    });
  }, [stageServiceQuery]);

  const loadSpectators = useCallback(async () => {
    const response = await getAdminSpectators(spectatorQuery);
    setSpectators(response.spectators || []);
    setSpectatorSummary(response.summary || {
      totalCount: response.spectators?.length || 0,
      paidCount: 0,
      soldCount: 0,
      capacity: 500,
    });
    setSpectatorPagination(response.pagination || {
      page: 1,
      pageSize: 50,
      totalCount: response.spectators?.length || 0,
      totalPages: 1,
    });
  }, [spectatorQuery]);

  const loadAuditLogs = useCallback(async () => {
    const response = await getAdminAuditLogs(auditQuery);
    setAuditLogs(response.auditLogs || []);
    setAuditPagination(response.pagination || {
      page: 1,
      pageSize: 50,
      totalCount: response.auditLogs?.length || 0,
      totalPages: 1,
    });
  }, [auditQuery]);

  const loadAnalytics = useCallback(async () => {
    setIsAnalyticsLoading(true);

    try {
      const response = await getAdminAnalytics(analyticsRange);
      setAnalytics(response);
    } finally {
      setIsAnalyticsLoading(false);
    }
  }, [analyticsRange]);

  const loadRefundRequests = useCallback(async () => {
    const response = await getAdminRefundRequests(refundRequestQuery);
    setRefundRequests(response.refundRequests || []);
    setRefundRequestPagination(response.pagination || {
      page: 1,
      pageSize: 50,
      totalCount: response.refundRequests?.length || 0,
      totalPages: 1,
    });
    setRefundRequestSummary(response.summary || {
      totalCount: response.refundRequests?.length || 0,
      processingCount: 0,
      completedCount: 0,
      failedCount: 0,
    });
  }, [refundRequestQuery]);

  const loadCanceledPayments = useCallback(async () => {
    const response = await getAdminCanceledPayments(refundPaymentQuery);
    setRefunds(response.refunds || []);
    setRefundPaymentPagination(response.pagination || {
      page: 1,
      pageSize: 50,
      totalCount: response.refunds?.length || 0,
      totalPages: 1,
    });
  }, [refundPaymentQuery]);

  const loadSmsData = useCallback(async () => {
    const [campaignResponse, optOutResponse] = await Promise.all([
      getAdminSmsCampaigns(),
      getAdminSmsMarketingOptOuts(),
    ]);
    setSmsCampaigns(campaignResponse.campaigns || []);
    setSmsMarketingOptOuts(optOutResponse.optOuts || []);
  }, []);

  const loadAdminData = useCallback(async ({ silent = false } = {}) => {
    let didLoad = false;

    if (!silent) {
      setIsLoading(true);
    }
    setErrorMessage("");

    try {
      const meResponse = await getAdminMe();
      const [
        applicationsResponse,
        stageServicesResponse,
        spectatorsResponse,
        refundsResponse,
        auditLogsResponse,
        adminUsersResponse,
      ] = await Promise.all([
        getAdminApplications(applicationQuery),
        getAdminStageServices(stageServiceQuery),
        getAdminSpectators(spectatorQuery),
        Promise.all([
          getAdminRefundRequests(refundRequestQuery),
          getAdminCanceledPayments(refundPaymentQuery),
        ]),
        getAdminAuditLogs(auditQuery),
        meResponse.adminUser?.role === "superadmin"
          ? getAdminUsers()
          : Promise.resolve({ adminUsers: [] }),
      ]);

      setAdminUser(meResponse.adminUser);
      resetIdleTimersRef.current?.(meResponse.session?.lastSeenAt);
      setApplications(applicationsResponse.applications || []);
      setApplicationSummary(applicationsResponse.summary || {
        totalCount: applicationsResponse.applications?.length || 0,
        paidCount: 0,
      });
      setApplicationPagination(applicationsResponse.pagination || {
        page: 1,
        pageSize: 50,
        totalCount: applicationsResponse.applications?.length || 0,
        totalPages: 1,
      });
      setStageServices(stageServicesResponse.stageServices || []);
      setStageServicePagination(stageServicesResponse.pagination || {
        page: 1,
        pageSize: 50,
        totalCount: stageServicesResponse.stageServices?.length || 0,
        totalPages: 1,
      });
      setSpectators(spectatorsResponse.spectators || []);
      setSpectatorSummary(spectatorsResponse.summary || {
        totalCount: spectatorsResponse.spectators?.length || 0,
        paidCount: 0,
        soldCount: 0,
        capacity: 500,
      });
      setSpectatorPagination(spectatorsResponse.pagination || {
        page: 1,
        pageSize: 50,
        totalCount: spectatorsResponse.spectators?.length || 0,
        totalPages: 1,
      });
      const [refundRequestsResponse, canceledPaymentsResponse] = refundsResponse;
      setRefundRequests(refundRequestsResponse.refundRequests || []);
      setRefundRequestPagination(refundRequestsResponse.pagination || {
        page: 1,
        pageSize: 50,
        totalCount: refundRequestsResponse.refundRequests?.length || 0,
        totalPages: 1,
      });
      setRefundRequestSummary(refundRequestsResponse.summary || {
        totalCount: refundRequestsResponse.refundRequests?.length || 0,
        processingCount: 0,
        completedCount: 0,
        failedCount: 0,
      });
      setRefunds(canceledPaymentsResponse.refunds || []);
      setRefundPaymentPagination(canceledPaymentsResponse.pagination || {
        page: 1,
        pageSize: 50,
        totalCount: canceledPaymentsResponse.refunds?.length || 0,
        totalPages: 1,
      });
      setAuditLogs(auditLogsResponse.auditLogs || []);
      setAuditPagination(auditLogsResponse.pagination || {
        page: 1,
        pageSize: 50,
        totalCount: auditLogsResponse.auditLogs?.length || 0,
        totalPages: 1,
      });
      setAdminUsers(adminUsersResponse.adminUsers || []);
      didLoad = true;
    } catch (error) {
      if (
        error.code === "ADMIN_AUTH_REQUIRED"
        || error.code === "ADMIN_SESSION_EXPIRED"
        || error.code === "ADMIN_SESSION_IDLE_EXPIRED"
      ) {
        forceAdminLogout();
        return;
      }

      setErrorMessage(error.message || "관리자 데이터를 불러오지 못했습니다.");
    } finally {
      if (!silent) {
        setIsLoading(false);
        setIsInitialAdminDataLoaded(didLoad);
      }
    }
  }, [
    applicationQuery,
    auditQuery,
    forceAdminLogout,
    refundPaymentQuery,
    refundRequestQuery,
    spectatorQuery,
    stageServiceQuery,
  ]);

  useEffect(() => {
    if (hasInitializedAdminDataRef.current) {
      return;
    }

    hasInitializedAdminDataRef.current = true;
    loadAdminData();
  }, [loadAdminData]);

  useEffect(() => {
    if (!isInitialAdminDataLoaded || activeSection !== "analytics") {
      return undefined;
    }

    loadAnalytics().catch((error) => {
      if (
        error.code === "ADMIN_AUTH_REQUIRED"
        || error.code === "ADMIN_SESSION_EXPIRED"
        || error.code === "ADMIN_SESSION_IDLE_EXPIRED"
      ) {
        forceAdminLogout();
        return;
      }

      setErrorMessage(error.message || "분석 지표를 불러오지 못했습니다.");
    });

    return undefined;
  }, [activeSection, forceAdminLogout, isInitialAdminDataLoaded, loadAnalytics]);

  useEffect(() => {
    if (!isInitialAdminDataLoaded) {
      return undefined;
    }

    if (skipInitialApplicationQueryRef.current) {
      skipInitialApplicationQueryRef.current = false;
      return undefined;
    }

    const timerId = window.setTimeout(() => {
      loadApplications().catch((error) => {
        if (
          error.code === "ADMIN_AUTH_REQUIRED"
          || error.code === "ADMIN_SESSION_EXPIRED"
          || error.code === "ADMIN_SESSION_IDLE_EXPIRED"
        ) {
          forceAdminLogout();
          return;
        }

        setErrorMessage(error.message || "등록 현황을 불러오지 못했습니다.");
      });
    }, applicationSearch ? 300 : 0);

    return () => window.clearTimeout(timerId);
  }, [applicationQuery, applicationSearch, forceAdminLogout, isInitialAdminDataLoaded, loadApplications]);

  useEffect(() => {
    if (!isInitialAdminDataLoaded) {
      return undefined;
    }

    if (skipInitialStageServiceQueryRef.current) {
      skipInitialStageServiceQueryRef.current = false;
      return undefined;
    }

    const timerId = window.setTimeout(() => {
      loadStageServices().catch((error) => {
        if (
          error.code === "ADMIN_AUTH_REQUIRED"
          || error.code === "ADMIN_SESSION_EXPIRED"
          || error.code === "ADMIN_SESSION_IDLE_EXPIRED"
        ) {
          forceAdminLogout();
          return;
        }

        setErrorMessage(error.message || "무대 서비스 등록 현황을 불러오지 못했습니다.");
      });
    }, stageServiceSearch ? 300 : 0);

    return () => window.clearTimeout(timerId);
  }, [forceAdminLogout, isInitialAdminDataLoaded, loadStageServices, stageServiceQuery, stageServiceSearch]);

  useEffect(() => {
    if (!isInitialAdminDataLoaded) {
      return undefined;
    }

    if (skipInitialSpectatorQueryRef.current) {
      skipInitialSpectatorQueryRef.current = false;
      return undefined;
    }

    const timerId = window.setTimeout(() => {
      loadSpectators().catch((error) => {
        if (
          error.code === "ADMIN_AUTH_REQUIRED"
          || error.code === "ADMIN_SESSION_EXPIRED"
          || error.code === "ADMIN_SESSION_IDLE_EXPIRED"
        ) {
          forceAdminLogout();
          return;
        }

        setErrorMessage(error.message || "참관객 신청 장부를 불러오지 못했습니다.");
      });
    }, spectatorSearch ? 300 : 0);

    return () => window.clearTimeout(timerId);
  }, [
    forceAdminLogout,
    isInitialAdminDataLoaded,
    loadSpectators,
    spectatorQuery,
    spectatorSearch,
  ]);

  useEffect(() => {
    if (!isInitialAdminDataLoaded) {
      return undefined;
    }

    if (skipInitialAuditQueryRef.current) {
      skipInitialAuditQueryRef.current = false;
      return undefined;
    }

    const timerId = window.setTimeout(() => {
      loadAuditLogs().catch((error) => {
        if (
          error.code === "ADMIN_AUTH_REQUIRED"
          || error.code === "ADMIN_SESSION_EXPIRED"
          || error.code === "ADMIN_SESSION_IDLE_EXPIRED"
        ) {
          forceAdminLogout();
          return;
        }

        setErrorMessage(error.message || "감사 로그를 불러오지 못했습니다.");
      });
    }, auditSearch ? 300 : 0);

    return () => window.clearTimeout(timerId);
  }, [auditQuery, auditSearch, forceAdminLogout, isInitialAdminDataLoaded, loadAuditLogs]);

  useEffect(() => {
    if (!isInitialAdminDataLoaded) {
      return undefined;
    }

    if (skipInitialRefundRequestQueryRef.current) {
      skipInitialRefundRequestQueryRef.current = false;
      return undefined;
    }

    const timerId = window.setTimeout(() => {
      loadRefundRequests().catch((error) => {
        if (
          error.code === "ADMIN_AUTH_REQUIRED"
          || error.code === "ADMIN_SESSION_EXPIRED"
          || error.code === "ADMIN_SESSION_IDLE_EXPIRED"
        ) {
          forceAdminLogout();
          return;
        }

        setErrorMessage(error.message || "환불 요청 이력을 불러오지 못했습니다.");
      });
    }, refundRequestSearch ? 300 : 0);

    return () => window.clearTimeout(timerId);
  }, [
    forceAdminLogout,
    isInitialAdminDataLoaded,
    loadRefundRequests,
    refundRequestQuery,
    refundRequestSearch,
  ]);

  useEffect(() => {
    if (!isInitialAdminDataLoaded) {
      return undefined;
    }

    if (skipInitialRefundPaymentQueryRef.current) {
      skipInitialRefundPaymentQueryRef.current = false;
      return undefined;
    }

    const timerId = window.setTimeout(() => {
      loadCanceledPayments().catch((error) => {
        if (
          error.code === "ADMIN_AUTH_REQUIRED"
          || error.code === "ADMIN_SESSION_EXPIRED"
          || error.code === "ADMIN_SESSION_IDLE_EXPIRED"
        ) {
          forceAdminLogout();
          return;
        }

        setErrorMessage(error.message || "환불 결제 결과를 불러오지 못했습니다.");
      });
    }, refundPaymentSearch ? 300 : 0);

    return () => window.clearTimeout(timerId);
  }, [
    forceAdminLogout,
    isInitialAdminDataLoaded,
    loadCanceledPayments,
    refundPaymentQuery,
    refundPaymentSearch,
  ]);

  useEffect(() => {
    if (!isInitialAdminDataLoaded || activeSection !== "sms" || adminUser?.role !== "superadmin") {
      return undefined;
    }

    loadSmsData().catch((error) => {
      if (
        error.code === "ADMIN_AUTH_REQUIRED"
        || error.code === "ADMIN_SESSION_EXPIRED"
        || error.code === "ADMIN_SESSION_IDLE_EXPIRED"
      ) {
        forceAdminLogout();
        return;
      }

      setErrorMessage(error.message || "문자 발송 데이터를 불러오지 못했습니다.");
    });

    return undefined;
  }, [activeSection, adminUser?.role, forceAdminLogout, isInitialAdminDataLoaded, loadSmsData]);

  useEffect(() => {
    let warningTimerId = null;
    let logoutTimerId = null;
    let countdownIntervalId = null;

    const clearIdleTimers = () => {
      if (warningTimerId) {
        window.clearTimeout(warningTimerId);
        warningTimerId = null;
      }

      if (logoutTimerId) {
        window.clearTimeout(logoutTimerId);
        logoutTimerId = null;
      }

      if (countdownIntervalId) {
        window.clearInterval(countdownIntervalId);
        countdownIntervalId = null;
      }
    };

    const runAutoLogout = () => {
      clearIdleTimers();
      forceAdminLogout();
    };

    const updateWarningCountdown = () => {
      const remainingMs = Math.max(
        0,
        lastAdminActivityAtRef.current + ADMIN_IDLE_TIMEOUT_MS - Date.now(),
      );
      setIdleSecondsRemaining(Math.ceil(remainingMs / 1000));

      if (remainingMs <= 0) {
        runAutoLogout();
      }
    };

    const openIdleWarning = () => {
      const elapsedMs = Date.now() - lastAdminActivityAtRef.current;

      if (elapsedMs >= ADMIN_IDLE_TIMEOUT_MS) {
        runAutoLogout();
        return;
      }

      isIdleWarningOpenRef.current = true;
      setIsIdleWarningOpen(true);
      updateWarningCountdown();
    };

    const scheduleIdleTimers = () => {
      clearIdleTimers();

      const elapsedMs = Date.now() - lastAdminActivityAtRef.current;
      const remainingMs = ADMIN_IDLE_TIMEOUT_MS - elapsedMs;

      if (remainingMs <= 0) {
        runAutoLogout();
        return;
      }

      updateWarningCountdown();
      countdownIntervalId = window.setInterval(updateWarningCountdown, 1000);

      if (elapsedMs >= ADMIN_IDLE_TIMEOUT_MS - ADMIN_IDLE_WARNING_MS) {
        openIdleWarning();
      } else {
        warningTimerId = window.setTimeout(
          openIdleWarning,
          ADMIN_IDLE_TIMEOUT_MS - ADMIN_IDLE_WARNING_MS - elapsedMs,
        );
      }

      logoutTimerId = window.setTimeout(runAutoLogout, remainingMs);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      updateWarningCountdown();
    };

    resetIdleTimersRef.current = (lastSeenAt) => {
      const lastSeenAtMs = new Date(lastSeenAt).getTime();

      isIdleWarningOpenRef.current = false;
      setIsIdleWarningOpen(false);
      lastAdminActivityAtRef.current = Number.isFinite(lastSeenAtMs)
        ? lastSeenAtMs
        : Date.now();
      scheduleIdleTimers();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    scheduleIdleTimers();

    return () => {
      clearIdleTimers();
      resetIdleTimersRef.current = null;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [forceAdminLogout]);

  const paidApplicationCount = useMemo(
    () => applicationSummary.paidCount,
    [applicationSummary.paidCount],
  );
  const latestApplications = useMemo(() => applications.slice(0, 5), [applications]);
  const latestStageServices = useMemo(() => stageServices.slice(0, 5), [stageServices]);
  const latestRefunds = useMemo(() => refundRequests.slice(0, 5), [refundRequests]);
  const latestAuditLogs = useMemo(() => auditLogs.slice(0, 5), [auditLogs]);
  const refundProcessingCount = useMemo(
    () => refundRequestSummary.processingCount,
    [refundRequestSummary.processingCount],
  );
  const refundCompletedCount = useMemo(
    () => refundRequestSummary.completedCount,
    [refundRequestSummary.completedCount],
  );
  const refundFailedCount = useMemo(
    () => refundRequestSummary.failedCount,
    [refundRequestSummary.failedCount],
  );
  const applicationPaymentStatusOptions = useMemo(
    () =>
      Array.from(new Set(["DONE", "CANCELED", "FAILED", ...applications.map((item) => item.paymentStatus).filter(Boolean)])).map(
        (value) => ({
          value,
          label: getPaymentStatusMeta(value).label,
        }),
      ),
    [applications],
  );
  const applicationDivisionOptions = useMemo(
    () => [
      { value: "man", label: "남성" },
      { value: "woman", label: "여성" },
      { value: "TEST", label: "테스트" },
    ],
    [],
  );
  const applicationDisciplineOptions = useMemo(
    () => (Array.isArray(applicationDisciplineCatalog.items) ? applicationDisciplineCatalog.items : [])
      .map((item) => ({ value: item.title, label: item.title })),
    [],
  );
  const stageServiceTypeOptions = useMemo(
    () => stageServiceItems.map((item) => ({
      value: item.key,
      label: getStageServiceTitle(item.key) || item.key,
    })),
    [],
  );
  const spectatorPaymentStatusOptions = useMemo(
    () => ["DONE", "CANCELED", "PARTIAL_CANCELED", "FAILED"].map((value) => ({
      value,
      label: getPaymentStatusMeta(value).label,
    })),
    [],
  );
  const spectatorAdmissionStatusOptions = useMemo(
    () => ["READY", "ADMITTED", "REFUNDED", "PARTIAL_REFUNDED"].map((value) => ({
      value,
      label: getAdmissionStatusMeta(value).label,
    })),
    [],
  );
  const refundRequestStatusOptions = useMemo(
    () => ["REQUESTED", "PROCESSING", "COMPLETED", "FAILED", "SYNC_FAILED"].map((value) => ({ value, label: value })),
    [],
  );
  const refundPaymentStatusOptions = useMemo(
    () => ["CANCELED", "PARTIAL_CANCELED"].map((value) => ({ value, label: value })),
    [],
  );
  const auditActionOptions = useMemo(
    () =>
      Array.from(new Set(auditLogs.map((item) => item.action).filter(Boolean))).map((value) => ({
        value,
        label: value,
      })),
    [auditLogs],
  );
  const filteredApplications = useMemo(
    () => applications,
    [applications],
  );
  const filteredStageServices = useMemo(() => stageServices, [stageServices]);
  const filteredSpectators = useMemo(() => spectators, [spectators]);
  const filteredRefundRequests = useMemo(() => refundRequests, [refundRequests]);
  const filteredRefundPayments = useMemo(() => refunds, [refunds]);
  const filteredAuditLogs = useMemo(() => auditLogs, [auditLogs]);

  const dashboardSections = [
    { id: "overview", label: "개요" },
    { id: "analytics", label: "분석 지표" },
    { id: "applications", label: "등록 현황" },
    { id: "stageServices", label: "무대 서비스 관리" },
    { id: "spectators", label: "참관객 신청 장부" },
    { id: "refunds", label: "환불 / 취소 현황" },
    { id: "audit", label: "감사 로그" },
    ...(adminUser?.role === "superadmin"
      ? [
          { id: "sms", label: "문자 발송" },
          { id: "accounts", label: "관리자 계정" },
        ]
      : []),
  ];

  async function handleLogout() {
    try {
      await adminLogout();
    } finally {
      navigate("/admin/login", { replace: true });
    }
  }

  async function handleExtendAdminSession() {
    setIsExtendingAdminSession(true);

    try {
      const keepAliveResponse = await keepAliveAdminSession();
      resetIdleTimersRef.current?.(keepAliveResponse.session?.lastSeenAt);
    } catch (_error) {
      await forceAdminLogout();
    } finally {
      setIsExtendingAdminSession(false);
    }
  }

  async function handleSectionChange(sectionId) {
    try {
      const keepAliveResponse = await keepAliveAdminSession();
      resetIdleTimersRef.current?.(keepAliveResponse.session?.lastSeenAt);
      setRecordDetail(null);
      setActiveSection(sectionId);
    } catch (_error) {
      await forceAdminLogout();
    }
  }

  async function handleRetryRefundSync(refundRequestId, refundTarget = "application") {
    const retryKey = `${refundTarget}:${refundRequestId}`;
    setRetryingRefundRequestId(retryKey);
    setErrorMessage("");

    try {
      await retryAdminRefundSync(refundRequestId, refundTarget);
      await loadAdminData({ silent: true });
    } catch (error) {
      setErrorMessage(error.message || "환불 재동기화에 실패했습니다.");
    } finally {
      setRetryingRefundRequestId(null);
    }
  }

  function updateSmsCampaignForm(nextValues) {
    setSmsCampaignForm((current) => ({ ...current, ...nextValues }));
    setSmsCampaignPreview(null);
  }

  async function handlePreviewSmsCampaign() {
    if (!smsCampaignForm.content.trim()) {
      setErrorMessage("발송할 문자 내용을 입력해 주세요.");
      return;
    }

    setIsSmsPreviewing(true);
    setErrorMessage("");

    try {
      const response = await previewAdminSmsCampaign(smsCampaignForm);
      setSmsCampaignPreview(response);
    } catch (error) {
      setErrorMessage(error.message || "문자 발송 대상을 미리 확인하지 못했습니다.");
    } finally {
      setIsSmsPreviewing(false);
    }
  }

  async function handleSendSmsCampaign() {
    if (!smsCampaignForm.content.trim()) {
      setErrorMessage("발송할 문자 내용을 입력해 주세요.");
      return;
    }

    setIsSendingSmsCampaign(true);
    setErrorMessage("");

    try {
      const preview = await previewAdminSmsCampaign(smsCampaignForm);
      if (!preview.recipientCount) {
        setErrorMessage("현재 조건에 해당하는 발송 대상이 없습니다.");
        return;
      }

      const kindLabel = smsCampaignForm.messageKind === "MARKETING" ? "마케팅 문자" : "공지 문자";
      if (!window.confirm(`${kindLabel}를 ${preview.recipientCount.toLocaleString("ko-KR")}명에게 발송하시겠습니까?`)) {
        return;
      }

      await createAdminSmsCampaign(smsCampaignForm);
      setSmsCampaignForm({ messageKind: "NOTICE", audience: "ALL_PAID", content: "" });
      setSmsCampaignPreview(null);
      await loadSmsData();
    } catch (error) {
      setErrorMessage(error.message || "문자 발송을 시작하지 못했습니다.");
    } finally {
      setIsSendingSmsCampaign(false);
    }
  }

  async function handleRetrySmsCampaign(campaignId) {
    setRetryingSmsCampaignId(campaignId);
    setErrorMessage("");

    try {
      await retryAdminSmsCampaign(campaignId);
      await loadSmsData();
    } catch (error) {
      setErrorMessage(error.message || "실패한 문자 재발송을 시작하지 못했습니다.");
    } finally {
      setRetryingSmsCampaignId(null);
    }
  }

  async function handleSaveSmsMarketingOptOut(event) {
    event.preventDefault();
    setIsSavingSmsOptOut(true);
    setErrorMessage("");

    try {
      await createAdminSmsMarketingOptOut(smsOptOutForm);
      setSmsOptOutForm({ phone: "", reason: "" });
      await loadSmsData();
    } catch (error) {
      setErrorMessage(error.message || "마케팅 수신 거부를 저장하지 못했습니다.");
    } finally {
      setIsSavingSmsOptOut(false);
    }
  }

  async function handleDeleteSmsMarketingOptOut(phone) {
    if (!window.confirm(`${phone} 번호의 마케팅 수신 거부를 해제하시겠습니까?`)) {
      return;
    }

    setErrorMessage("");

    try {
      await deleteAdminSmsMarketingOptOut(phone);
      await loadSmsData();
    } catch (error) {
      setErrorMessage(error.message || "마케팅 수신 거부를 해제하지 못했습니다.");
    }
  }

  async function handleKcpReconciliation(event) {
    event.preventDefault();

    const orderId = kcpReconcileOrderId.trim();

    if (!orderId) {
      setErrorMessage("KCP 후검증을 실행할 주문번호를 입력해 주세요.");
      return;
    }

    setIsReconcilingKcp(true);
    setErrorMessage("");
    setKcpReconcileMessage("");

    try {
      const response = await reconcileAdminKcpPayment(orderId);
      const result = response.reconciliation;
      setKcpReconcileMessage(
        `${result.orderId} / ${result.paymentStatus} / 잔액 ${formatAmount(result.remainingAmount)}`,
      );
      await loadAdminData({ silent: true });
    } catch (error) {
      setErrorMessage(error.message || "KCP 결제 후검증에 실패했습니다.");
    } finally {
      setIsReconcilingKcp(false);
    }
  }

  function openApplicationEditor(application) {
    setRecordDetail(null);
    setEditingApplication(application);
    setApplicationForm({
      name: application.name || "",
      phone: application.phone || "",
      email: application.email || "",
      birthDate: application.birthDate || "",
      organization: application.organization || "",
      snsIdentity: application.snsIdentity || application.instagramId || "",
      introduction: application.introduction || "",
      division: application.division || "",
      discipline: application.discipline || "",
      weightClass: application.weightClass || "",
    });
  }

  async function handleApplicationSave(event) {
    event.preventDefault();

    if (!editingApplication || !applicationForm) {
      return;
    }

    setIsSavingApplication(true);
    setErrorMessage("");

    try {
      await updateAdminApplication(editingApplication.applicationNumber, applicationForm);
      setEditingApplication(null);
      setApplicationForm(null);
      await loadAdminData({ silent: true });
    } catch (error) {
      setErrorMessage(error.message || "신청 정보 수정에 실패했습니다.");
    } finally {
      setIsSavingApplication(false);
    }
  }

  async function handleApplicationDelete(application) {
    const shouldDelete = window.confirm(
      `${application.applicationNumber} 신청을 삭제 처리할까요? 결제 완료, 환불 또는 무대 서비스 연동 건은 삭제할 수 없습니다.`,
    );

    if (!shouldDelete) {
      return;
    }

    setErrorMessage("");

    try {
      await deleteAdminApplication(application.applicationNumber);
      setRecordDetail(null);
      await loadAdminData({ silent: true });
    } catch (error) {
      setErrorMessage(error.message || "신청 삭제에 실패했습니다.");
    }
  }

  function openAdminUserEditor(adminUserToEdit = null) {
    setEditingAdminUser(adminUserToEdit);
    setAdminUserForm({
      email: adminUserToEdit?.email || "",
      displayName: adminUserToEdit?.displayName || "",
      role: adminUserToEdit?.role || "admin",
      isActive: adminUserToEdit?.isActive ?? true,
      password: "",
    });
  }

  async function handleAdminUserSave(event) {
    event.preventDefault();

    if (!adminUserForm) {
      return;
    }

    setIsSavingAdminUser(true);
    setErrorMessage("");

    try {
      if (editingAdminUser) {
        await updateAdminUser(editingAdminUser.id, {
          displayName: adminUserForm.displayName,
          role: adminUserForm.role,
          isActive: String(adminUserForm.isActive) === "true",
          ...(adminUserForm.password ? { password: adminUserForm.password } : {}),
        });
      } else {
        await createAdminUser({
          email: adminUserForm.email,
          displayName: adminUserForm.displayName,
          role: adminUserForm.role,
          password: adminUserForm.password,
        });
      }

      setEditingAdminUser(null);
      setAdminUserForm(null);
      await loadAdminData({ silent: true });
    } catch (error) {
      setErrorMessage(error.message || "관리자 계정 저장에 실패했습니다.");
    } finally {
      setIsSavingAdminUser(false);
    }
  }

  return (
    <section className="site-admin-page">
      <div className="site-admin-page__header">
        <div>
          <p className="site-kicker">Admin Dashboard</p>
          <h1>MMKorea 관리자</h1>
          <p>
            {adminUser
              ? `${adminUser.displayName || adminUser.email} / ${adminUser.role}`
              : "관리자 세션 확인 중"}
          </p>
        </div>
        <div className="site-admin-page__header-actions">
          <span className="site-admin-session-countdown" aria-live="polite">
            자동 로그아웃까지 <strong>{formatCountdown(idleSecondsRemaining)}</strong>
          </span>
          <Button variant="ghost" onClick={handleLogout}>
            로그아웃
          </Button>
        </div>
      </div>

      {errorMessage ? <p className="site-error-message">{errorMessage}</p> : null}

      <div className="site-admin-summary">
        <SummaryCard label="전체 등록 건수" value={applicationSummary.totalCount} />
        <SummaryCard label="결제 완료" value={paidApplicationCount} />
        <SummaryCard label="무대 서비스 주문" value={stageServicePagination.totalCount} />
        <SummaryCard label="참관객 판매" value={`${spectatorSummary.soldCount} / ${spectatorSummary.capacity}`} />
        <SummaryCard label="환불 요청" value={refundRequests.length} />
        <SummaryCard label="최근 감사 로그" value={auditPagination.totalCount} />
        {adminUser?.role === "superadmin" ? <SummaryCard label="활성 관리자" value={adminUsers.filter((item) => item.isActive).length} /> : null}
      </div>

      <div className="site-admin-panel-nav" role="tablist" aria-label="관리자 섹션">
        {dashboardSections.map((section) => (
          <button
            aria-selected={activeSection === section.id}
            className={`site-admin-panel-nav__button ${
              activeSection === section.id ? "site-admin-panel-nav__button--active" : ""
            }`.trim()}
            key={section.id}
            onClick={() => handleSectionChange(section.id)}
            role="tab"
            type="button"
          >
            {section.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="site-admin-loading">관리자 데이터를 불러오는 중입니다.</div>
      ) : (
        <>
          {activeSection === "overview" ? (
            <div className="site-admin-overview-grid">
              <section className="site-admin-overview-card">
                <div className="site-admin-overview-card__header">
                  <div>
                    <p className="site-kicker">Applications</p>
                    <h2>대회 신청 최근 접수</h2>
                  </div>
                  <button
                    className="site-admin-overview-card__action"
                    onClick={() => handleSectionChange("applications")}
                    type="button"
                  >
                    전체 보기
                  </button>
                </div>
                {latestApplications.length ? (
                  <div className="site-admin-overview-list">
                    {latestApplications.map((item) => (
                      <article className="site-admin-overview-list__item" key={item.applicationNumber}>
                        <strong>{item.name || item.applicationNumber}</strong>
                        <span>{item.discipline || "-"}</span>
                        <span>{formatDateTime(item.submittedAt)}</span>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="site-admin-loading">등록된 신청 내역이 없습니다.</div>
                )}
              </section>

              <section className="site-admin-overview-card">
                <div className="site-admin-overview-card__header">
                  <div>
                    <p className="site-kicker">Stage Services</p>
                    <h2>무대 서비스 최근 주문</h2>
                  </div>
                  <button
                    className="site-admin-overview-card__action"
                    onClick={() => handleSectionChange("stageServices")}
                    type="button"
                  >
                    전체 보기
                  </button>
                </div>
                {latestStageServices.length ? (
                  <div className="site-admin-overview-list">
                    {latestStageServices.map((item) => (
                      <article className="site-admin-overview-list__item" key={item.serviceOrderNumber}>
                        <strong>{item.name || item.serviceOrderNumber}</strong>
                        <span>{getStageServiceTitle(item.serviceType) || item.serviceType || "-"}</span>
                        <span>{formatAmount(item.totalAmount)}</span>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="site-admin-loading">등록된 무대 서비스 주문이 없습니다.</div>
                )}
              </section>

              <section className="site-admin-overview-card">
                <div className="site-admin-overview-card__header">
                  <div>
                    <p className="site-kicker">Refunds</p>
                    <h2>환불 / 취소 최근 내역</h2>
                  </div>
                  <button
                    className="site-admin-overview-card__action"
                    onClick={() => handleSectionChange("refunds")}
                    type="button"
                  >
                    전체 보기
                  </button>
                </div>
                {latestRefunds.length ? (
                  <div className="site-admin-overview-list">
                    {latestRefunds.map((item) => (
                      <article className="site-admin-overview-list__item" key={item.id || item.orderId}>
                        <strong>{item.name || item.applicationNumber || item.orderId}</strong>
                        <span>{`${formatPercent(item.refundPercent)} / ${formatAmount(item.refundAmount)}`}</span>
                        <span>{item.requestStatus || "-"}</span>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="site-admin-loading">환불 요청 이력이 없습니다.</div>
                )}
              </section>

              <section className="site-admin-overview-card">
                <div className="site-admin-overview-card__header">
                  <div>
                    <p className="site-kicker">Audit</p>
                    <h2>감사 로그 최근 항목</h2>
                  </div>
                  <button
                    className="site-admin-overview-card__action"
                    onClick={() => handleSectionChange("audit")}
                    type="button"
                  >
                    전체 보기
                  </button>
                </div>
                {latestAuditLogs.length ? (
                  <div className="site-admin-overview-list">
                    {latestAuditLogs.map((item) => (
                      <article className="site-admin-overview-list__item" key={item.id}>
                        <strong>{item.action || "-"}</strong>
                        <span>{item.adminUserDisplayName || item.adminUserEmail || "-"}</span>
                        <span>{formatDateTime(item.createdAt)}</span>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="site-admin-loading">감사 로그가 없습니다.</div>
                )}
              </section>
            </div>
          ) : null}

          {activeSection === "analytics" ? (
            <section className="site-admin-analytics">
              <div className="site-admin-analytics__header">
                <div>
                  <p className="site-kicker">Conversion Analytics</p>
                  <h2>신청 및 결제 분석</h2>
                  <p>서버에 저장된 초안, 주문, 결제 승인, 환불 완료 기록을 기준으로 집계합니다.</p>
                </div>
                <label className="site-admin-analytics__range">
                  <span>조회 기간</span>
                  <select value={analyticsRange} onChange={(event) => setAnalyticsRange(event.target.value)}>
                    <option value="7d">최근 7일</option>
                    <option value="30d">최근 30일</option>
                    <option value="90d">최근 90일</option>
                    <option value="all">전체 기간</option>
                  </select>
                </label>
              </div>

              {isAnalyticsLoading ? (
                <div className="site-admin-loading">분석 지표를 집계하는 중입니다.</div>
              ) : analytics ? (
                <>
                  <div className="site-admin-mini-summary site-admin-analytics__summary">
                    <SummaryCard label="초안 생성" value={analytics.totals.draftCount.toLocaleString("ko-KR")} />
                    <SummaryCard label="주문 생성" value={analytics.totals.orderCount.toLocaleString("ko-KR")} />
                    <SummaryCard label="결제 승인" value={analytics.totals.completedCount.toLocaleString("ko-KR")} />
                    <SummaryCard label="초안 대비 승인율" value={`${analytics.totals.conversionRate}%`} />
                    <SummaryCard label="결제 승인액" value={formatAmount(analytics.totals.approvedAmount)} />
                    <SummaryCard label="환불 완료액" value={formatAmount(analytics.totals.refundedAmount)} />
                    <SummaryCard label="기간 순결제액" value={formatAmount(analytics.totals.netAmount)} />
                    <SummaryCard label="현재 결제 대기" value={analytics.totals.readyCount.toLocaleString("ko-KR")} />
                  </div>

                  <div className="site-admin-analytics__notice">
                    <strong>집계 기준</strong>
                    <span>결제 승인액은 해당 기간 승인 건, 환불 완료액은 해당 기간 환불 완료 건을 기준으로 계산합니다.</span>
                    <span>페이지 방문 수는 현재 서버에 저장하지 않으므로 초안 작성 이전의 유입·이탈은 포함되지 않습니다.</span>
                  </div>

                  <div className="site-admin-analytics__funnels">
                    {(analytics.sources || []).map((source) => (
                      <AnalyticsFunnelCard key={source.id} source={source} />
                    ))}
                  </div>

                  <section className="site-admin-analytics__trend-card">
                    <div className="site-admin-section__header">
                      <h2>결제·환불 추이</h2>
                      <p>{analytics.trendBucket === "month" ? "월별" : analytics.trendBucket === "week" ? "주별" : "일별"} 승인액과 환불 완료액입니다.</p>
                    </div>
                    <AnalyticsTrendChart rows={analytics.trend || []} bucket={analytics.trendBucket} />
                  </section>
                </>
              ) : (
                <div className="site-admin-loading">표시할 분석 데이터가 없습니다.</div>
              )}
            </section>
          ) : null}

          {activeSection === "applications" ? (
            <>
              <SectionControls
                searchPlaceholder="신청번호, 이름, 이메일, 종목, SNS, 파일명 검색"
                searchValue={applicationSearch}
                onSearchChange={(value) => {
                  setApplicationSearch(value);
                  setApplicationPage(1);
                }}
                filterValue={applicationPaymentStatusFilter}
                onFilterChange={(value) => {
                  setApplicationPaymentStatusFilter(value);
                  setApplicationPage(1);
                }}
                filterOptions={applicationPaymentStatusOptions}
                additionalFilters={[
                  {
                    key: "division",
                    value: applicationDivisionFilter,
                    onChange: (value) => {
                      setApplicationDivisionFilter(value);
                      setApplicationPage(1);
                    },
                    allLabel: "전체 부문",
                    options: applicationDivisionOptions,
                  },
                  {
                    key: "discipline",
                    value: applicationDisciplineFilter,
                    onChange: (value) => {
                      setApplicationDisciplineFilter(value);
                      setApplicationPage(1);
                    },
                    allLabel: "전체 종목",
                    options: applicationDisciplineOptions,
                  },
                ]}
                onDownload={async () => {
                  const exportResponse = await getAdminApplications({
                    ...applicationQuery,
                    page: 1,
                    export: 1,
                  });

                  await downloadWorkbookFile(
                    "admin-applications.xlsx",
                    "대회 신청",
                    [
                      { key: "refundTarget", label: "구분" },
                      { key: "applicationNumber", label: "신청번호" },
                      { key: "serviceOrderNumber", label: "서비스 주문번호" },
                      { key: "serviceType", label: "서비스 종류" },
                      { key: "orderId", label: "주문번호" },
                      { key: "name", label: "신청자" },
                      { key: "phone", label: "연락처" },
                      { key: "email", label: "이메일" },
                      { key: "birthDate", label: "생년월일" },
                      { key: "organization", label: "소속" },
                      {
                        key: "snsIdentity",
                        label: "SNS",
                        getValue: (row) =>
                          formatStoredSnsIdentity(row.snsIdentity || row.instagramId, "ko", "-"),
                      },
                      { key: "introduction", label: "자기소개" },
                      { key: "division", label: "부문" },
                      { key: "discipline", label: "종목" },
                      {
                        key: "participantGender",
                        label: "성별",
                        getValue: (row) =>
                          row.participantGender === "female"
                            ? "여"
                            : row.participantGender === "male"
                              ? "남"
                              : "-",
                      },
                      { key: "weightClass", label: "체급" },
                      { key: "paymentStatus", label: "결제상태" },
                      {
                        key: "participationCertification",
                        label: "참가 인증 상태",
                        getValue: (row) =>
                          row.participationCertification?.completed ? "제출 완료" : "미제출",
                      },
                      {
                        key: "participationCertificationPlatform",
                        label: "참가 인증 SNS",
                        getValue: (row) =>
                          row.participationCertification?.completed
                            ? getParticipationCertificationPlatformLabel(
                                row.participationCertification.sourcePlatform,
                              )
                            : "-",
                      },
                      {
                        key: "participationCertificationUrl",
                        label: "참가 인증 링크",
                        getValue: (row) => row.participationCertification?.postUrl || "-",
                      },
                      {
                        key: "participationCertificationUpdatedAt",
                        label: "참가 인증 수정일시",
                        getValue: (row) =>
                          formatDateTime(row.participationCertification?.updatedAt),
                      },
                      { key: "documentOriginalFilename", label: "문서 파일" },
                      {
                        key: "submittedAt",
                        label: "접수일시",
                        getValue: (row) => formatDateTime(row.submittedAt),
                      },
                    ],
                    exportResponse.applications || [],
                  );
                }}
                downloadDisabled={!filteredApplications.length}
              />
              <TableSection
                title="등록 현황"
                defaultSortKey="submittedAt"
                columns={[
                  {
                    key: "applicationNumber",
                    label: "접수번호",
                    className: "site-admin-table__cell--identifier",
                    render: (row) => <IdentifierCell value={row.applicationNumber} />,
                  },
                  {
                    key: "name",
                    label: "신청자",
                    className: "site-admin-table__cell--person",
                    render: (row) => (
                      <MetaCell
                        primary={row.name}
                        secondary={`${maskAdminPhone(row.phone)} · ${maskAdminEmail(row.email)}`}
                      />
                    ),
                  },
                  {
                    key: "discipline",
                    label: "참가 부문",
                    className: "site-admin-table__cell--category",
                    render: (row) => (
                      <MetaCell
                        primary={row.discipline}
                        secondary={[
                          row.division || "-",
                          row.participantGender === "female"
                            ? "여"
                            : row.participantGender === "male"
                              ? "남"
                              : null,
                          `체급 ${row.weightClass || "-"}`,
                        ]
                          .filter(Boolean)
                          .join(" / ")}
                      />
                    ),
                  },
                  {
                    key: "documentFile",
                    label: "제출 문서",
                    className: "site-admin-table__cell--status",
                    sortable: false,
                    render: (row) => <DocumentStatusCell files={row.documentFiles} />,
                  },
                  {
                    key: "paymentStatus",
                    label: "결제",
                    className: "site-admin-table__cell--status",
                    render: (row) => <PaymentStatusCell amount={row.paymentAmount} status={row.paymentStatus} />,
                  },
                  {
                    key: "participationCertification",
                    label: "참가 인증",
                    className: "site-admin-table__cell--status",
                    sortable: false,
                    render: (row) => (
                      <ParticipationCertificationCell
                        certification={row.participationCertification}
                      />
                    ),
                  },
                  {
                    key: "submittedAt",
                    label: "접수 일시",
                    className: "site-admin-table__cell--date",
                    render: (row) => formatDateTime(row.submittedAt),
                  },
                  {
                    key: "actions",
                    label: "관리",
                    className: "site-admin-table__cell--actions",
                    sortable: false,
                    render: (row) => (
                      <div className="site-admin-table__actions">
                        <button
                          className="site-admin-action-button"
                          onClick={() => setRecordDetail({ type: "application", record: row })}
                          type="button"
                        >
                          상세
                        </button>
                      </div>
                    ),
                  },
                ]}
                rows={filteredApplications}
                emptyText="조건에 맞는 신청 내역이 없습니다."
                pageSize={50}
                pagination={applicationPagination}
                onPageChange={setApplicationPage}
                controlledSortKey={applicationSort.sortKey}
                controlledSortDirection={applicationSort.sortDirection}
                onSortChange={(nextSort) => {
                  setApplicationSort(nextSort);
                  setApplicationPage(1);
                }}
                tableClassName="site-admin-table--records"
              />
            </>
          ) : null}

          {activeSection === "stageServices" ? (
            <>
              <SectionControls
                searchPlaceholder="주문번호, 신청자, 연동 신청번호, 서비스 내용 검색"
                searchValue={stageServiceSearch}
                onSearchChange={(value) => {
                  setStageServiceSearch(value);
                  setStageServicePage(1);
                }}
                filterValue={stageServiceTypeFilter}
                onFilterChange={(value) => {
                  setStageServiceTypeFilter(value);
                  setStageServicePage(1);
                }}
                filterOptions={stageServiceTypeOptions}
                onDownload={async () => {
                  const exportResponse = await getAdminStageServices({
                    ...stageServiceQuery,
                    page: 1,
                    export: 1,
                  });

                  return downloadWorkbookFile(
                    "admin-stage-services.xlsx",
                    "무대 서비스",
                    [
                      { key: "serviceOrderNumber", label: "서비스주문번호" },
                      { key: "orderId", label: "주문번호" },
                      { key: "paymentKey", label: "결제키" },
                      {
                        key: "serviceType",
                        label: "서비스",
                        getValue: (row) => getStageServiceTitle(row.serviceType) || row.serviceType,
                      },
                      { key: "name", label: "신청자" },
                      { key: "phone", label: "연락처" },
                      { key: "email", label: "이메일" },
                      {
                        key: "linkedApplicationNumber",
                        label: "연동 신청번호",
                        getValue: (row) => getLinkedApplicationNumbers(row),
                      },
                      {
                        key: "linkedDiscipline",
                        label: "연동 종목",
                        getValue: (row) => getLinkedDisciplines(row),
                      },
                      {
                        key: "serviceMeta",
                        label: "서비스 상세",
                        getValue: (row) => {
                          const meta = getStageServiceMeta(row);
                          return `${meta.primary} / ${meta.secondary}`;
                        },
                      },
                      { key: "totalAmount", label: "금액", getValue: (row) => formatAmount(row.totalAmount) },
                      { key: "paymentStatus", label: "결제상태" },
                      { key: "serviceStatus", label: "서비스상태" },
                      {
                        key: "participationCertification",
                        label: "참가 인증 상태",
                        getValue: (row) =>
                          row.participationCertification?.completed ? "제출 완료" : "미제출",
                      },
                      {
                        key: "participationCertificationPlatform",
                        label: "참가 인증 SNS",
                        getValue: (row) =>
                          row.participationCertification?.completed
                            ? getParticipationCertificationPlatformLabel(
                                row.participationCertification.sourcePlatform,
                              )
                            : "-",
                      },
                      {
                        key: "participationCertificationUrl",
                        label: "참가 인증 링크",
                        getValue: (row) => row.participationCertification?.postUrl || "-",
                      },
                      {
                        key: "participationCertificationUpdatedAt",
                        label: "참가 인증 수정일시",
                        getValue: (row) =>
                          formatDateTime(row.participationCertification?.updatedAt),
                      },
                      { key: "purchasedAt", label: "구매일시", getValue: (row) => formatDateTime(row.purchasedAt) },
                    ],
                    exportResponse.stageServices || [],
                  );
                }}
                downloadDisabled={!filteredStageServices.length}
              />
              <TableSection
                title="무대 서비스 주문 현황"
                defaultSortKey="purchasedAt"
                columns={[
                  {
                    key: "serviceOrderNumber",
                    label: "서비스 주문번호",
                    className: "site-admin-table__cell--identifier",
                    render: (row) => <IdentifierCell value={row.serviceOrderNumber} />,
                  },
                  {
                    key: "name",
                    label: "신청자",
                    className: "site-admin-table__cell--person",
                    render: (row) => (
                      <MetaCell
                        primary={row.name}
                        secondary={`${maskAdminPhone(row.phone)} · ${maskAdminEmail(row.email)}`}
                      />
                    ),
                  },
                  {
                    key: "linkedApplication",
                    label: "연동 신청",
                    className: "site-admin-table__cell--category",
                    render: (row) => (
                      <MetaCell
                        primary={getLinkedDisciplines(row) || "연동 없음"}
                        secondary={`${getLinkedApplications(row).length}건 연동`}
                      />
                    ),
                  },
                  {
                    key: "serviceType",
                    label: "서비스 내용",
                    className: "site-admin-table__cell--category",
                    render: (row) => {
                      const meta = getStageServiceMeta(row);
                      return <MetaCell primary={meta.primary} secondary={meta.secondary} />;
                    },
                  },
                  {
                    key: "paymentStatus",
                    label: "결제",
                    className: "site-admin-table__cell--status",
                    render: (row) => <PaymentStatusCell amount={row.totalAmount} status={row.paymentStatus} />,
                  },
                  {
                    key: "serviceStatus",
                    label: "서비스 상태",
                    className: "site-admin-table__cell--status",
                    render: (row) => (
                      <StatusBadge meta={getServiceStatusMeta(row.serviceStatus)} />
                    ),
                  },
                  {
                    key: "participationCertification",
                    label: "참가 인증",
                    className: "site-admin-table__cell--status",
                    sortable: false,
                    render: (row) => (
                      <ParticipationCertificationCell
                        certification={row.participationCertification}
                      />
                    ),
                  },
                  {
                    key: "purchasedAt",
                    label: "구매 일시",
                    className: "site-admin-table__cell--date",
                    render: (row) => formatDateTime(row.purchasedAt),
                  },
                  {
                    key: "actions",
                    label: "관리",
                    className: "site-admin-table__cell--actions",
                    sortable: false,
                    render: (row) => (
                      <div className="site-admin-table__actions">
                        <button
                          className="site-admin-action-button"
                          onClick={() => setRecordDetail({ type: "stage-service", record: row })}
                          type="button"
                        >
                          상세
                        </button>
                      </div>
                    ),
                  },
                ]}
                rows={filteredStageServices}
                emptyText="조건에 맞는 무대 서비스 주문이 없습니다."
                pageSize={50}
                pagination={stageServicePagination}
                onPageChange={setStageServicePage}
                controlledSortKey={stageServiceSort.sortKey}
                controlledSortDirection={stageServiceSort.sortDirection}
                onSortChange={(nextSort) => {
                  setStageServiceSort(nextSort);
                  setStageServicePage(1);
                }}
                tableClassName="site-admin-table--records"
              />
            </>
          ) : null}

          {activeSection === "spectators" ? (
            <>
              <div className="site-admin-mini-summary">
                <SummaryCard label="전체 신청" value={spectatorSummary.totalCount} />
                <SummaryCard label="결제 완료" value={spectatorSummary.paidCount} />
                <SummaryCard label="판매 수량" value={spectatorSummary.soldCount} />
                <SummaryCard label="잔여 수량" value={Math.max(0, spectatorSummary.capacity - spectatorSummary.soldCount)} />
              </div>
              <SectionControls
                searchPlaceholder="신청번호, 주문번호, 성함, 연락처, 이메일 검색"
                searchValue={spectatorSearch}
                onSearchChange={(value) => {
                  setSpectatorSearch(value);
                  setSpectatorPage(1);
                }}
                filterValue={spectatorPaymentStatusFilter}
                onFilterChange={(value) => {
                  setSpectatorPaymentStatusFilter(value);
                  setSpectatorPage(1);
                }}
                filterOptions={spectatorPaymentStatusOptions}
                additionalFilters={[
                  {
                    key: "admissionStatus",
                    value: spectatorAdmissionStatusFilter,
                    onChange: (value) => {
                      setSpectatorAdmissionStatusFilter(value);
                      setSpectatorPage(1);
                    },
                    allLabel: "전체 입장 상태",
                    options: spectatorAdmissionStatusOptions,
                  },
                ]}
                onDownload={async () => {
                  const exportResponse = await getAdminSpectators({
                    ...spectatorQuery,
                    page: 1,
                    export: 1,
                  });

                  return downloadWorkbookFile(
                    "admin-spectators.xlsx",
                    "참관객 신청 장부",
                    [
                      { key: "spectatorOrderNumber", label: "참관객 신청번호" },
                      { key: "name", label: "성함" },
                      { key: "phone", label: "연락처" },
                      { key: "email", label: "이메일" },
                      { key: "quantity", label: "수량" },
                      { key: "unitAmount", label: "단가", getValue: (row) => Number(row.unitAmount || 0) },
                      { key: "totalAmount", label: "결제금액", getValue: (row) => Number(row.totalAmount || 0) },
                      { key: "paymentStatus", label: "결제상태" },
                      { key: "admissionStatus", label: "입장상태" },
                      {
                        key: "participationCertification",
                        label: "참가 인증 상태",
                        getValue: (row) =>
                          row.participationCertification?.completed ? "제출 완료" : "미제출",
                      },
                      {
                        key: "participationCertificationPlatform",
                        label: "참가 인증 SNS",
                        getValue: (row) =>
                          row.participationCertification?.completed
                            ? getParticipationCertificationPlatformLabel(
                                row.participationCertification.sourcePlatform,
                              )
                            : "-",
                      },
                      {
                        key: "participationCertificationUrl",
                        label: "참가 인증 링크",
                        getValue: (row) => row.participationCertification?.postUrl || "-",
                      },
                      {
                        key: "participationCertificationUpdatedAt",
                        label: "참가 인증 수정일시",
                        getValue: (row) =>
                          formatDateTime(row.participationCertification?.updatedAt),
                      },
                      { key: "orderId", label: "주문번호" },
                      { key: "paymentKey", label: "결제키" },
                      { key: "privacyConsent", label: "개인정보동의", getValue: (row) => row.consents?.privacy ? "Y" : "N" },
                      { key: "refundConsent", label: "환불규정동의", getValue: (row) => row.consents?.refund ? "Y" : "N" },
                      { key: "marketingConsent", label: "마케팅수신동의", getValue: (row) => row.consents?.marketing ? "Y" : "N" },
                      { key: "photoVideoConsent", label: "사진영상동의", getValue: (row) => row.consents?.photoVideo ? "Y" : "N" },
                      { key: "paymentCompletedAt", label: "결제완료시각", getValue: (row) => formatDateTime(row.paymentCompletedAt) },
                      { key: "purchasedAt", label: "접수시각", getValue: (row) => formatDateTime(row.purchasedAt) },
                    ],
                    exportResponse.spectators || [],
                  );
                }}
                downloadDisabled={!filteredSpectators.length}
              />
              <TableSection
                title="참관객 신청 장부"
                defaultSortKey="purchasedAt"
                columns={[
                  {
                    key: "spectatorOrderNumber",
                    label: "신청번호",
                    className: "site-admin-table__cell--identifier",
                    render: (row) => <IdentifierCell value={row.spectatorOrderNumber} />,
                  },
                  {
                    key: "name",
                    label: "참관객",
                    className: "site-admin-table__cell--person",
                    render: (row) => (
                      <MetaCell primary={row.name} secondary={`${maskAdminPhone(row.phone)} · ${maskAdminEmail(row.email)}`} />
                    ),
                  },
                  {
                    key: "quantity",
                    label: "입장권",
                    className: "site-admin-table__cell--category",
                    render: (row) => <MetaCell primary={`${row.quantity || 1}매`} secondary={row.isTest ? "테스트 결제" : "일반 결제"} />,
                  },
                  {
                    key: "paymentStatus",
                    label: "결제",
                    className: "site-admin-table__cell--status",
                    render: (row) => <PaymentStatusCell amount={row.totalAmount} status={row.paymentStatus} />,
                  },
                  {
                    key: "admissionStatus",
                    label: "입장 상태",
                    className: "site-admin-table__cell--status",
                    render: (row) => <StatusBadge meta={getAdmissionStatusMeta(row.admissionStatus)} />,
                  },
                  {
                    key: "participationCertification",
                    label: "참가 인증",
                    className: "site-admin-table__cell--status",
                    sortable: false,
                    render: (row) => (
                      <ParticipationCertificationCell
                        certification={row.participationCertification}
                      />
                    ),
                  },
                  {
                    key: "purchasedAt",
                    label: "접수 일시",
                    className: "site-admin-table__cell--date",
                    render: (row) => formatDateTime(row.purchasedAt),
                  },
                  {
                    key: "actions",
                    label: "관리",
                    className: "site-admin-table__cell--actions",
                    sortable: false,
                    render: (row) => (
                      <div className="site-admin-table__actions">
                        <button
                          className="site-admin-action-button"
                          onClick={() => setRecordDetail({ type: "spectator", record: row })}
                          type="button"
                        >
                          상세
                        </button>
                      </div>
                    ),
                  },
                ]}
                rows={filteredSpectators}
                emptyText="조건에 맞는 참관객 신청이 없습니다."
                pageSize={50}
                pagination={spectatorPagination}
                onPageChange={setSpectatorPage}
                controlledSortKey={spectatorSort.sortKey}
                controlledSortDirection={spectatorSort.sortDirection}
                onSortChange={(nextSort) => {
                  setSpectatorSort(nextSort);
                  setSpectatorPage(1);
                }}
                tableClassName="site-admin-table--records"
              />
            </>
          ) : null}

          {activeSection === "refunds" ? (
            <>
              <form className="site-admin-reconciliation" onSubmit={handleKcpReconciliation}>
                <label className="site-admin-reconciliation__field" htmlFor="kcp-reconcile-order-id">
                  <span>KCP 거래 후검증</span>
                  <input
                    id="kcp-reconcile-order-id"
                    onChange={(event) => setKcpReconcileOrderId(event.target.value)}
                    placeholder="order_..."
                    spellCheck="false"
                    type="text"
                    value={kcpReconcileOrderId}
                  />
                </label>
                <button
                  className="site-admin-action-button site-admin-reconciliation__button"
                  disabled={isReconcilingKcp}
                  type="submit"
                >
                  {isReconcilingKcp ? "조회 중..." : "조회 및 동기화"}
                </button>
                {kcpReconcileMessage ? (
                  <p className="site-admin-reconciliation__result" role="status">
                    {kcpReconcileMessage}
                  </p>
                ) : null}
              </form>

              <div className="site-admin-mini-summary">
                <SummaryCard label="전체 요청" value={refundRequestSummary.totalCount} />
                <SummaryCard label="처리 중/동기화 필요" value={refundProcessingCount} />
                <SummaryCard label="완료" value={refundCompletedCount} />
                <SummaryCard label="실패" value={refundFailedCount} />
                <SummaryCard label="취소 결제 기록" value={refundPaymentPagination.totalCount} />
              </div>

              <SectionControls
                searchPlaceholder="신청번호, 주문번호, 신청자, 사유, 정책, 오류 검색"
                searchValue={refundRequestSearch}
                onSearchChange={(value) => {
                  setRefundRequestSearch(value);
                  setRefundRequestPage(1);
                }}
                filterValue={refundRequestStatusFilter}
                onFilterChange={(value) => {
                  setRefundRequestStatusFilter(value);
                  setRefundRequestPage(1);
                }}
                filterOptions={refundRequestStatusOptions}
                onDownload={async () => {
                  const exportResponse = await getAdminRefundRequests({
                    ...refundRequestQuery,
                    page: 1,
                    export: 1,
                  });

                  return downloadWorkbookFile(
                    "admin-refund-requests.xlsx",
                    "환불 요청",
                    [
                      { key: "refundTarget", label: "환불 구분" },
                      { key: "applicationNumber", label: "신청번호" },
                      { key: "orderId", label: "주문번호" },
                      { key: "paymentKey", label: "결제키" },
                      { key: "name", label: "신청자" },
                      { key: "phone", label: "연락처" },
                      { key: "email", label: "이메일" },
                      { key: "division", label: "부문" },
                      { key: "discipline", label: "종목" },
                      { key: "requestStatus", label: "요청상태" },
                      { key: "requestReason", label: "요청사유" },
                      { key: "policyRuleLabel", label: "정책규칙" },
                      { key: "refundPercent", label: "환불비율", getValue: (row) => formatPercent(row.refundPercent) },
                      { key: "refundAmount", label: "환불금액", getValue: (row) => formatAmount(row.refundAmount) },
                      { key: "originalAmount", label: "원결제금액", getValue: (row) => formatAmount(row.originalAmount) },
                      { key: "providerStatusCode", label: "결제사상태코드" },
                      { key: "providerErrorCode", label: "결제사오류코드" },
                      { key: "providerErrorMessage", label: "결제사오류메시지" },
                      { key: "createdAt", label: "요청시각", getValue: (row) => formatDateTime(row.createdAt) },
                      { key: "processedAt", label: "처리시각", getValue: (row) => formatDateTime(row.processedAt) },
                    ],
                    exportResponse.refundRequests || [],
                  );
                }}
                downloadDisabled={!filteredRefundRequests.length}
              />
              <TableSection
                title="환불 요청 이력"
                defaultSortKey="createdAt"
                columns={[
                  {
                    key: "applicationNumber",
                    label: "신청 / 주문",
                    render: (row) => (
                      <MetaCell
                        primary={row.applicationNumber || row.serviceOrderNumber || "-"}
                        secondary={`${row.refundTarget === "stage-service" ? "무대 서비스" : row.refundTarget === "spectator" ? "참관객" : "대회 신청"} / ${row.orderId || "-"}`}
                      />
                    ),
                  },
                  {
                    key: "name",
                    label: "신청자",
                    render: (row) => (
                      <MetaCell
                        primary={row.name || row.requestedByName || "-"}
                        secondary={`${row.phone || "-"} / ${row.email || row.requestedByEmail || "-"}`}
                      />
                    ),
                  },
                  {
                    key: "discipline",
                    label: "신청 정보",
                    render: (row) => (
                      <MetaCell
                        primary={`${row.discipline || "-"} / ${row.division || "-"}`}
                        secondary={row.policyRuleLabel || row.policyRuleId || "-"}
                      />
                    ),
                  },
                  {
                    key: "refundQuote",
                    label: "환불 금액",
                    render: (row) => (
                      <MetaCell
                        primary={`${formatPercent(row.refundPercent)} / ${formatAmount(row.refundAmount)}`}
                        secondary={`원결제 ${formatAmount(row.originalAmount)}`}
                      />
                    ),
                  },
                  {
                    key: "requestStatus",
                    label: "요청 상태",
                    render: (row) => (
                      <MetaCell
                        primary={row.requestStatus || "-"}
                        secondary={row.providerErrorMessage || row.paymentStatus || "-"}
                      />
                    ),
                  },
                  {
                    key: "requestReason",
                    label: "요청 사유",
                    render: (row) => (
                      <MetaCell
                        primary={row.requestReason || "-"}
                        secondary={`${row.providerStatusCode || "-"} / ${row.providerErrorCode || "-"}`}
                      />
                    ),
                  },
                  {
                    key: "createdAt",
                    label: "요청 / 처리 시각",
                    render: (row) => (
                      <MetaCell
                        primary={`요청 ${formatDateTime(row.createdAt)}`}
                        secondary={`처리 ${formatDateTime(row.processedAt || row.updatedAt)}`}
                      />
                    ),
                  },
                  {
                    key: "actions",
                    label: "조치",
                    sortable: false,
                    render: (row) =>
                      row.requestStatus === "SYNC_FAILED" ? (
                        <button
                          className="site-admin-action-button"
                          disabled={retryingRefundRequestId === `${row.refundTarget || "application"}:${row.id}`}
                          onClick={() => handleRetryRefundSync(row.id, row.refundTarget)}
                          type="button"
                        >
                          {retryingRefundRequestId === `${row.refundTarget || "application"}:${row.id}` ? "재동기화 중..." : "재동기화"}
                        </button>
                      ) : (
                        <span>-</span>
                      ),
                  },
                ]}
                rows={filteredRefundRequests}
                emptyText="조건에 맞는 환불 요청 이력이 없습니다."
                pageSize={50}
                pagination={refundRequestPagination}
                onPageChange={setRefundRequestPage}
                controlledSortKey={refundRequestSort.sortKey}
                controlledSortDirection={refundRequestSort.sortDirection}
                onSortChange={(nextSort) => {
                  setRefundRequestSort(nextSort);
                  setRefundRequestPage(1);
                }}
              />

              <SectionControls
                searchPlaceholder="주문번호, 신청번호, 신청자, 결제상태 검색"
                searchValue={refundPaymentSearch}
                onSearchChange={(value) => {
                  setRefundPaymentSearch(value);
                  setRefundPaymentPage(1);
                }}
                filterValue={refundPaymentStatusFilter}
                onFilterChange={(value) => {
                  setRefundPaymentStatusFilter(value);
                  setRefundPaymentPage(1);
                }}
                filterOptions={refundPaymentStatusOptions}
                onDownload={async () => {
                  const exportResponse = await getAdminCanceledPayments({
                    ...refundPaymentQuery,
                    page: 1,
                    export: 1,
                  });

                  return downloadWorkbookFile(
                    "admin-refund-payments.xlsx",
                    "환불 결과",
                    [
                      { key: "orderId", label: "주문번호" },
                      { key: "paymentKey", label: "결제키" },
                      { key: "refundTarget", label: "구분" },
                      { key: "applicationNumber", label: "신청번호" },
                      { key: "serviceOrderNumber", label: "서비스 주문번호" },
                      { key: "serviceType", label: "서비스 종류" },
                      { key: "name", label: "신청자" },
                      { key: "phone", label: "연락처" },
                      { key: "email", label: "이메일" },
                      { key: "division", label: "부문" },
                      { key: "discipline", label: "종목" },
                      { key: "paymentStatus", label: "결제상태" },
                      { key: "totalAmount", label: "금액", getValue: (row) => formatAmount(row.totalAmount) },
                      { key: "approvedAt", label: "승인시각", getValue: (row) => formatDateTime(row.approvedAt) },
                      { key: "updatedAt", label: "변경시각", getValue: (row) => formatDateTime(row.updatedAt) },
                    ],
                    exportResponse.refunds || [],
                  );
                }}
                downloadDisabled={!filteredRefundPayments.length}
              />
              <TableSection
                title="결제 취소 / 환불 결과"
                defaultSortKey="updatedAt"
                columns={[
                  {
                    key: "orderId",
                    label: "주문 / 결제",
                    render: (row) => (
                      <MetaCell primary={row.orderId} secondary={row.paymentKey} />
                    ),
                  },
                  {
                    key: "applicationNumber",
                    label: "신청 정보",
                    render: (row) => (
                      <MetaCell
                        primary={row.applicationNumber || row.serviceOrderNumber || "-"}
                        secondary={`${row.division || "-"} / ${row.discipline || "-"}`}
                      />
                    ),
                  },
                  {
                    key: "name",
                    label: "신청자",
                    render: (row) => (
                      <MetaCell
                        primary={row.name}
                        secondary={`${row.phone || "-"} / ${row.email || "-"}`}
                      />
                    ),
                  },
                  { key: "paymentStatus", label: "결제 상태" },
                  {
                    key: "totalAmount",
                    label: "금액",
                    render: (row) => formatAmount(row.totalAmount),
                  },
                  {
                    key: "updatedAt",
                    label: "승인 / 변경 시각",
                    render: (row) => (
                      <MetaCell
                        primary={`승인 ${formatDateTime(row.approvedAt)}`}
                        secondary={`변경 ${formatDateTime(row.updatedAt)}`}
                      />
                    ),
                  },
                ]}
                rows={filteredRefundPayments}
                emptyText="조건에 맞는 환불 또는 취소 상태의 결제 내역이 없습니다."
                pageSize={50}
                pagination={refundPaymentPagination}
                onPageChange={setRefundPaymentPage}
                controlledSortKey={refundPaymentSort.sortKey}
                controlledSortDirection={refundPaymentSort.sortDirection}
                onSortChange={(nextSort) => {
                  setRefundPaymentSort(nextSort);
                  setRefundPaymentPage(1);
                }}
              />
            </>
          ) : null}

          {activeSection === "sms" && adminUser?.role === "superadmin" ? (
            <section className="site-admin-sms">
              <div className="site-admin-section__header">
                <div>
                  <h2>문자 발송</h2>
                  <p>일반 공지와 마케팅 문자를 분리해 발송합니다. 마케팅 문자는 수신 동의자와 수신 거부 제외 대상에게만 발송됩니다.</p>
                </div>
              </div>

              <div className="site-admin-sms__grid">
                <section className="site-admin-sms__card">
                  <div className="site-admin-sms__card-header">
                    <h3>대량 문자 작성</h3>
                    <span>슈퍼관리자 전용</span>
                  </div>
                  <div className="site-admin-sms__fields">
                    <label className="site-admin-form__field">
                      <span>문자 유형</span>
                      <select
                        onChange={(event) => {
                          const messageKind = event.target.value;
                          updateSmsCampaignForm({
                            messageKind,
                            audience: messageKind === "MARKETING" ? "MARKETING_CONSENTED" : "ALL_PAID",
                          });
                        }}
                        value={smsCampaignForm.messageKind}
                      >
                        <option value="NOTICE">일반 공지</option>
                        <option value="MARKETING">마케팅</option>
                      </select>
                    </label>
                    <label className="site-admin-form__field">
                      <span>발송 대상</span>
                      <select
                        disabled={smsCampaignForm.messageKind === "MARKETING"}
                        onChange={(event) => updateSmsCampaignForm({ audience: event.target.value })}
                        value={smsCampaignForm.audience}
                      >
                        {smsCampaignForm.messageKind === "MARKETING" ? (
                          <option value="MARKETING_CONSENTED">마케팅 수신 동의자</option>
                        ) : (
                          <>
                            <option value="ALL_PAID">전체 결제 완료자</option>
                            <option value="APPLICATIONS">대회 신청 완료자</option>
                            <option value="STAGE_SERVICES">무대 서비스 결제자</option>
                            <option value="SPECTATORS">참관객 결제자</option>
                          </>
                        )}
                      </select>
                    </label>
                    <label className="site-admin-form__field site-admin-form__field--wide">
                      <span>문자 내용</span>
                      <textarea
                        maxLength="1000"
                        onChange={(event) => updateSmsCampaignForm({ content: event.target.value })}
                        placeholder="수신자에게 전달할 내용을 입력해 주세요."
                        value={smsCampaignForm.content}
                      />
                    </label>
                  </div>
                  <p className="site-admin-sms__notice">
                    {smsCampaignForm.messageKind === "MARKETING"
                      ? "마케팅 문자는 '(광고)' 표기와 서버에 설정된 무료 수신 거부 안내가 자동으로 추가됩니다."
                      : "일반 공지는 결제 완료 상태의 대상에게만 발송됩니다."}
                  </p>
                  {smsCampaignPreview ? (
                    <div className="site-admin-sms__preview">
                      <strong>발송 예정 {smsCampaignPreview.recipientCount.toLocaleString("ko-KR")}명</strong>
                      <pre>{smsCampaignPreview.messageBody}</pre>
                    </div>
                  ) : null}
                  <div className="site-admin-form__actions">
                    <button
                      className="site-admin-action-button"
                      disabled={isSmsPreviewing || isSendingSmsCampaign}
                      onClick={handlePreviewSmsCampaign}
                      type="button"
                    >
                      {isSmsPreviewing ? "확인 중..." : "대상 미리 보기"}
                    </button>
                    <button
                      className="site-admin-action-button site-admin-action-button--primary"
                      disabled={isSendingSmsCampaign || isSmsPreviewing}
                      onClick={handleSendSmsCampaign}
                      type="button"
                    >
                      {isSendingSmsCampaign ? "발송 준비 중..." : "발송 시작"}
                    </button>
                  </div>
                </section>

                <section className="site-admin-sms__card">
                  <div className="site-admin-sms__card-header">
                    <h3>마케팅 수신 거부</h3>
                    <span>{smsMarketingOptOuts.length}건</span>
                  </div>
                  <form className="site-admin-sms__opt-out-form" onSubmit={handleSaveSmsMarketingOptOut}>
                    <label className="site-admin-form__field">
                      <span>휴대전화</span>
                      <input
                        inputMode="numeric"
                        onChange={(event) => setSmsOptOutForm((current) => ({ ...current, phone: event.target.value }))}
                        placeholder="010-0000-0000"
                        required
                        value={smsOptOutForm.phone}
                      />
                    </label>
                    <label className="site-admin-form__field">
                      <span>사유</span>
                      <input
                        maxLength="500"
                        onChange={(event) => setSmsOptOutForm((current) => ({ ...current, reason: event.target.value }))}
                        placeholder="요청 경로 또는 메모"
                        value={smsOptOutForm.reason}
                      />
                    </label>
                    <button className="site-admin-action-button" disabled={isSavingSmsOptOut} type="submit">
                      {isSavingSmsOptOut ? "저장 중..." : "수신 거부 등록"}
                    </button>
                  </form>
                  <div className="site-admin-sms__opt-out-list">
                    {smsMarketingOptOuts.length ? smsMarketingOptOuts.map((item) => (
                      <article className="site-admin-sms__opt-out-item" key={item.phone}>
                        <div>
                          <strong>{item.phone}</strong>
                          <span>{item.reason || "사유 없음"}</span>
                        </div>
                        <button
                          className="site-admin-action-button site-admin-action-button--danger"
                          onClick={() => handleDeleteSmsMarketingOptOut(item.phone)}
                          type="button"
                        >
                          해제
                        </button>
                      </article>
                    )) : <p className="site-admin-sms__empty">등록된 수신 거부 번호가 없습니다.</p>}
                  </div>
                </section>
              </div>

              <section className="site-admin-sms__card site-admin-sms__card--history">
                <div className="site-admin-sms__card-header">
                  <div>
                    <h3>최근 발송 이력</h3>
                    <p>실패 건은 동일한 수신자에게만 재발송합니다.</p>
                  </div>
                </div>
                <div className="site-admin-table-wrap">
                  <table className="site-admin-table">
                    <thead>
                      <tr>
                        <th>유형 / 대상</th>
                        <th>상태</th>
                        <th>발송 결과</th>
                        <th>작성자</th>
                        <th>생성 일시</th>
                        <th>관리</th>
                      </tr>
                    </thead>
                    <tbody>
                      {smsCampaigns.length ? smsCampaigns.map((campaign) => (
                        <tr key={campaign.id}>
                          <td><MetaCell primary={campaign.messageKind === "MARKETING" ? "마케팅" : "일반 공지"} secondary={campaign.audience} /></td>
                          <td><MetaCell primary={campaign.status} secondary={campaign.failureMessage || "-"} /></td>
                          <td>{`${campaign.sentCount.toLocaleString("ko-KR")} / ${campaign.recipientCount.toLocaleString("ko-KR")}명${campaign.failedCount ? ` (실패 ${campaign.failedCount}명)` : ""}`}</td>
                          <td>{campaign.createdByName || "-"}</td>
                          <td>{formatDateTime(campaign.createdAt)}</td>
                          <td>
                            {campaign.failedCount ? (
                              <button
                                className="site-admin-action-button"
                                disabled={retryingSmsCampaignId === campaign.id}
                                onClick={() => handleRetrySmsCampaign(campaign.id)}
                                type="button"
                              >
                                {retryingSmsCampaignId === campaign.id ? "재시도 중..." : "실패 건 재발송"}
                              </button>
                            ) : "-"}
                          </td>
                        </tr>
                      )) : (
                        <tr><td className="site-admin-table__empty" colSpan="6">문자 발송 이력이 없습니다.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </section>
          ) : null}

          {activeSection === "accounts" && adminUser?.role === "superadmin" ? (
            <>
              <div className="site-admin-account-heading">
                <div className="site-admin-section__header site-admin-section__header--actions">
                  <div>
                    <h2>관리자 계정 관리</h2>
                    <p>계정 생성, 권한 변경, 비활성화, 비밀번호 재설정을 관리합니다.</p>
                  </div>
                  <button className="site-admin-action-button site-admin-action-button--primary" onClick={() => openAdminUserEditor()} type="button">
                    관리자 추가
                  </button>
                </div>
              </div>
              <TableSection
                title="관리자 계정"
                defaultSortKey="lastLoginAt"
                columns={[
                    {
                      key: "displayName",
                      label: "관리자",
                      render: (row) => <MetaCell primary={row.displayName} secondary={row.email} />,
                    },
                    { key: "role", label: "권한" },
                    {
                      key: "isActive",
                      label: "상태",
                      render: (row) => (row.isActive ? "활성" : "비활성"),
                      sortValue: (row) => (row.isActive ? 1 : 0),
                    },
                    {
                      key: "lastLoginAt",
                      label: "최근 로그인",
                      render: (row) => formatDateTime(row.lastLoginAt),
                    },
                    {
                      key: "createdAt",
                      label: "생성 일시",
                      render: (row) => formatDateTime(row.createdAt),
                    },
                    {
                      key: "actions",
                      label: "관리",
                      sortable: false,
                      render: (row) => (
                        <button className="site-admin-action-button" onClick={() => openAdminUserEditor(row)} type="button">
                          수정
                        </button>
                      ),
                    },
                ]}
                rows={adminUsers}
                emptyText="등록된 관리자 계정이 없습니다."
              />
            </>
          ) : null}

          {activeSection === "audit" ? (
            <>
              <SectionControls
                searchPlaceholder="action, 관리자, target, IP 검색"
                searchValue={auditSearch}
                onSearchChange={(value) => {
                  setAuditSearch(value);
                  setAuditPage(1);
                }}
                filterValue={auditActionFilter}
                onFilterChange={(value) => {
                  setAuditActionFilter(value);
                  setAuditPage(1);
                }}
                filterOptions={auditActionOptions}
                onDownload={async () => {
                  const exportResponse = await getAdminAuditLogs({
                    ...auditQuery,
                    page: 1,
                    export: 1,
                  });

                  return downloadWorkbookFile(
                    "admin-audit-logs.xlsx",
                    "감사 로그",
                    [
                      { key: "adminUserDisplayName", label: "관리자명" },
                      { key: "adminUserEmail", label: "관리자이메일" },
                      { key: "adminUserRole", label: "관리자권한" },
                      { key: "action", label: "행동" },
                      { key: "targetType", label: "대상타입" },
                      { key: "targetId", label: "대상ID" },
                      { key: "ipAddress", label: "IP" },
                      { key: "userAgent", label: "User-Agent" },
                      {
                        key: "metadata",
                        label: "메타데이터",
                        getValue: (row) => (row.metadata ? JSON.stringify(row.metadata) : ""),
                      },
                      { key: "createdAt", label: "발생시각", getValue: (row) => formatDateTime(row.createdAt) },
                    ],
                    exportResponse.auditLogs || [],
                  );
                }}
                downloadDisabled={!filteredAuditLogs.length}
              />
              <TableSection
                title="감사 로그"
                defaultSortKey="createdAt"
                columns={[
                  {
                    key: "adminUserDisplayName",
                    label: "관리자",
                    render: (row) => (
                      <MetaCell
                        primary={row.adminUserDisplayName || row.adminUserEmail || "-"}
                        secondary={`${row.adminUserRole || "-"} / ${row.adminUserEmail || "-"}`}
                      />
                    ),
                  },
                  {
                    key: "action",
                    label: "행동 / 대상",
                    render: (row) => (
                      <MetaCell
                        primary={row.action}
                        secondary={`${row.targetType || "-"} / ${row.targetId || "-"}`}
                      />
                    ),
                  },
                  {
                    key: "ipAddress",
                    label: "접속 정보",
                    render: (row) => (
                      <MetaCell primary={row.ipAddress || "-"} secondary={row.userAgent || "-"} />
                    ),
                  },
                  {
                    key: "metadata",
                    label: "메타데이터",
                    render: (row) => (
                      <div className="site-admin-table__json">
                        {row.metadata ? JSON.stringify(row.metadata) : "-"}
                      </div>
                    ),
                  },
                  {
                    key: "createdAt",
                    label: "발생 시각",
                    render: (row) => formatDateTime(row.createdAt),
                  },
                ]}
                rows={filteredAuditLogs}
                emptyText="조건에 맞는 감사 로그가 없습니다."
                pageSize={50}
                pagination={auditPagination}
                onPageChange={setAuditPage}
                controlledSortKey={auditSort.sortKey}
                controlledSortDirection={auditSort.sortDirection}
                onSortChange={(nextSort) => {
                  setAuditSort(nextSort);
                  setAuditPage(1);
                }}
              />
            </>
          ) : null}
        </>
      )}
      {recordDetail ? (
        <AdminRecordDetailDrawer
          adminRole={adminUser?.role}
          detail={recordDetail}
          onClose={() => setRecordDetail(null)}
          onDeleteApplication={handleApplicationDelete}
          onEditApplication={openApplicationEditor}
        />
      ) : null}
      {editingApplication && applicationForm ? (
        <ApplicationEditor
          application={editingApplication}
          form={applicationForm}
          isSubmitting={isSavingApplication}
          onChange={(event) => {
            const { name, value } = event.target;
            setApplicationForm((current) => ({ ...current, [name]: value }));
          }}
          onClose={() => {
            if (!isSavingApplication) {
              setEditingApplication(null);
              setApplicationForm(null);
            }
          }}
          onSubmit={handleApplicationSave}
        />
      ) : null}
      {adminUserForm ? (
        <AdminUserEditor
          adminUser={editingAdminUser}
          form={adminUserForm}
          isCurrentUser={editingAdminUser?.id === adminUser?.id}
          isSubmitting={isSavingAdminUser}
          onChange={(event) => {
            const { name, value } = event.target;
            setAdminUserForm((current) => ({ ...current, [name]: value }));
          }}
          onClose={() => {
            if (!isSavingAdminUser) {
              setEditingAdminUser(null);
              setAdminUserForm(null);
            }
          }}
          onSubmit={handleAdminUserSave}
        />
      ) : null}
      {isIdleWarningOpen ? (
        <div className="site-admin-idle-warning" role="presentation">
          <section aria-labelledby="admin-idle-warning-title" aria-modal="true" className="site-admin-idle-warning__card" role="alertdialog">
            <p className="site-kicker">Session timeout</p>
            <h2 id="admin-idle-warning-title">로그아웃 예정</h2>
            <p>1분 후 자동 로그아웃됩니다. 계속 사용하려면 로그인 연장을 선택해 주세요.</p>
            <strong className="site-admin-idle-warning__timer">{formatCountdown(idleSecondsRemaining)}</strong>
            <div className="site-admin-idle-warning__actions">
              <button
                className="site-admin-action-button"
                disabled={isExtendingAdminSession}
                onClick={forceAdminLogout}
                type="button"
              >
                로그아웃
              </button>
              <button
                className="site-admin-action-button site-admin-action-button--primary"
                disabled={isExtendingAdminSession}
                onClick={handleExtendAdminSession}
                type="button"
              >
                {isExtendingAdminSession ? "연장 중..." : "로그인 연장"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
