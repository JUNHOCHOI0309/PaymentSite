import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import excelDownloadIcon from "../../assets/excel-download-icon.png";
import { Button } from "../../components/common/Button";
import applicationDisciplineCatalog from "../../data/applicationDisciplineCatalog.json";
import {
  getHairOptionChoices,
  getHairOptionalChoices,
  getStageServiceTitle,
  getStageVideoAdditionalDisciplineMeta,
  getVideoTypeOptions,
} from "../../data/stageServiceConfig";
import { formatStoredSnsIdentity } from "../../lib/applicationSns";
import {
  adminLogout,
  buildApiUrl,
  createAdminUser,
  deleteAdminApplication,
  getAdminApplications,
  getAdminAuditLogs,
  getAdminMe,
  getAdminRefunds,
  getAdminStageServices,
  getAdminUsers,
  keepAliveAdminSession,
  reconcileAdminKcpPayment,
  retryAdminRefundSync,
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
const ADMIN_ACTIVITY_HEARTBEAT_MS = 60 * 1000;

function formatBirthDate(value) {
  if (!value) {
    return "-";
  }

  const normalized = String(value).trim();
  return normalized || "-";
}

function getStageServiceMeta(row) {
  const title = getStageServiceTitle(row.serviceType) || row.serviceType || "-";

  if (row.serviceType === "stage-photo") {
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
    const hairOptionalLabel =
      getHairOptionalChoices({
        hairOptionValue: row.hairOption,
        hasAdditionalDiscipline: Boolean(row.hairAdditionalDiscipline),
      }).find((option) => option.value === row.hairOptionalOption)?.label
      || row.hairOptionalOption
      || "추가 옵션 없음";
    const extraDiscipline = row.hairAdditionalDiscipline
      ? ` / 추가 종목 ${row.hairAdditionalDiscipline}`
      : "";

    return {
      primary: `${title} / ${hairOptionLabel}`,
      secondary: `참가 종목 ${row.hairParticipantDiscipline || "-"}${extraDiscipline} / ${hairOptionalLabel}`,
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

function SummaryCard({ label, value }) {
  return (
    <article className="site-admin-summary-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
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
  pageSize = 20,
  defaultSortKey: preferredDefaultSortKey = "",
  defaultSortDirection = "desc",
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
  const [sortKey, setSortKey] = useState(defaultSortKey);
  const [sortDirection, setSortDirection] = useState(defaultSortDirection);
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!sortableColumns.some((column) => column.key === sortKey)) {
      setSortKey(defaultSortKey);
    }
  }, [defaultSortKey, sortKey, sortableColumns]);

  useEffect(() => {
    setPage(1);
  }, [rows]);

  const sortedRows = useMemo(() => {
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
  }, [columns, rows, sortDirection, sortKey]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedRows = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return sortedRows.slice(startIndex, startIndex + pageSize);
  }, [currentPage, pageSize, sortedRows]);

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
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(column.key);
    setSortDirection("asc");
  }

  return (
    <section className="site-admin-section">
      <div className="site-admin-section__header">
        <h2>{title}</h2>
      </div>
      <div className="site-admin-table-wrap">
        <table className="site-admin-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key}>
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
                    <td key={`${column.key}-${index}`}>
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
            총 {rows.length}건 / {currentPage} / {totalPages} 페이지
          </span>
          <div className="site-admin-pagination__actions">
            <button
              className="site-admin-pagination__button"
              disabled={currentPage <= 1}
              onClick={() => setPage(1)}
              type="button"
            >
              처음
            </button>
            <button
              className="site-admin-pagination__button"
              disabled={currentPage <= 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              type="button"
            >
              이전
            </button>
            <button
              className="site-admin-pagination__button"
              disabled={currentPage >= totalPages}
              onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
              type="button"
            >
              다음
            </button>
            <button
              className="site-admin-pagination__button"
              disabled={currentPage >= totalPages}
              onClick={() => setPage(totalPages)}
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
  const [sessionExpiresAt, setSessionExpiresAt] = useState(null);
  const [applications, setApplications] = useState([]);
  const [stageServices, setStageServices] = useState([]);
  const [refundRequests, setRefundRequests] = useState([]);
  const [refunds, setRefunds] = useState([]);
  const [adminUsers, setAdminUsers] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [activeSection, setActiveSection] = useState("overview");
  const [applicationSearch, setApplicationSearch] = useState("");
  const [applicationPaymentStatusFilter, setApplicationPaymentStatusFilter] = useState("all");
  const [stageServiceSearch, setStageServiceSearch] = useState("");
  const [stageServiceTypeFilter, setStageServiceTypeFilter] = useState("all");
  const [refundRequestSearch, setRefundRequestSearch] = useState("");
  const [refundRequestStatusFilter, setRefundRequestStatusFilter] = useState("all");
  const [refundPaymentSearch, setRefundPaymentSearch] = useState("");
  const [refundPaymentStatusFilter, setRefundPaymentStatusFilter] = useState("all");
  const [auditSearch, setAuditSearch] = useState("");
  const [auditActionFilter, setAuditActionFilter] = useState("all");
  const [retryingRefundRequestId, setRetryingRefundRequestId] = useState(null);
  const [kcpReconcileOrderId, setKcpReconcileOrderId] = useState("");
  const [isReconcilingKcp, setIsReconcilingKcp] = useState(false);
  const [kcpReconcileMessage, setKcpReconcileMessage] = useState("");
  const [editingApplication, setEditingApplication] = useState(null);
  const [applicationForm, setApplicationForm] = useState(null);
  const [editingAdminUser, setEditingAdminUser] = useState(null);
  const [adminUserForm, setAdminUserForm] = useState(null);
  const [isSavingApplication, setIsSavingApplication] = useState(false);
  const [isSavingAdminUser, setIsSavingAdminUser] = useState(false);
  const [isIdleWarningOpen, setIsIdleWarningOpen] = useState(false);
  const [idleSecondsRemaining, setIdleSecondsRemaining] = useState(60);
  const [isExtendingAdminSession, setIsExtendingAdminSession] = useState(false);
  const lastAdminActivityAtRef = useRef(Date.now());
  const lastAdminHeartbeatAtRef = useRef(Date.now());
  const lastAdminMouseMoveAtRef = useRef(0);
  const isIdleWarningOpenRef = useRef(false);
  const isAutoLogoutRunningRef = useRef(false);
  const resetIdleTimersRef = useRef(null);

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

  const loadAdminData = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setIsLoading(true);
    }
    setErrorMessage("");

    try {
      const meResponse = await getAdminMe();
      const [
        applicationsResponse,
        stageServicesResponse,
        refundsResponse,
        auditLogsResponse,
        adminUsersResponse,
      ] = await Promise.all([
        getAdminApplications(),
        getAdminStageServices(),
        getAdminRefunds(),
        getAdminAuditLogs(),
        meResponse.adminUser?.role === "superadmin"
          ? getAdminUsers()
          : Promise.resolve({ adminUsers: [] }),
      ]);

      setAdminUser(meResponse.adminUser);
      setSessionExpiresAt(meResponse.session?.expiresAt || null);
      setApplications(applicationsResponse.applications || []);
      setStageServices(stageServicesResponse.stageServices || []);
      setRefundRequests(refundsResponse.refundRequests || []);
      setRefunds(refundsResponse.refunds || []);
      setAuditLogs(auditLogsResponse.auditLogs || []);
      setAdminUsers(adminUsersResponse.adminUsers || []);
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
      }
    }
  }, [forceAdminLogout]);

  useEffect(() => {
    loadAdminData();
  }, [loadAdminData]);

  useEffect(() => {
    let warningTimerId = null;
    let logoutTimerId = null;
    let warningCountdownIntervalId = null;

    const clearIdleTimers = () => {
      if (warningTimerId) {
        window.clearTimeout(warningTimerId);
        warningTimerId = null;
      }

      if (logoutTimerId) {
        window.clearTimeout(logoutTimerId);
        logoutTimerId = null;
      }

      if (warningCountdownIntervalId) {
        window.clearInterval(warningCountdownIntervalId);
        warningCountdownIntervalId = null;
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

      if (!warningCountdownIntervalId) {
        warningCountdownIntervalId = window.setInterval(updateWarningCountdown, 250);
      }
    };

    const scheduleIdleTimers = () => {
      clearIdleTimers();

      const elapsedMs = Date.now() - lastAdminActivityAtRef.current;
      const remainingMs = ADMIN_IDLE_TIMEOUT_MS - elapsedMs;

      if (remainingMs <= 0) {
        runAutoLogout();
        return;
      }

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

    const sendActivityHeartbeat = async () => {
      if (Date.now() - lastAdminHeartbeatAtRef.current < ADMIN_ACTIVITY_HEARTBEAT_MS) {
        return;
      }

      lastAdminHeartbeatAtRef.current = Date.now();

      try {
        await keepAliveAdminSession();
      } catch (_error) {
        runAutoLogout();
      }
    };

    const recordActivity = () => {
      if (isIdleWarningOpenRef.current || isAutoLogoutRunningRef.current) {
        return;
      }

      lastAdminActivityAtRef.current = Date.now();
      scheduleIdleTimers();
      sendActivityHeartbeat();
    };

    const recordMouseActivity = () => {
      const now = Date.now();

      if (now - lastAdminMouseMoveAtRef.current < 5000) {
        return;
      }

      lastAdminMouseMoveAtRef.current = now;
      recordActivity();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      if (isIdleWarningOpenRef.current) {
        updateWarningCountdown();
        return;
      }

      const elapsedMs = Date.now() - lastAdminActivityAtRef.current;

      if (elapsedMs >= ADMIN_IDLE_TIMEOUT_MS) {
        runAutoLogout();
      } else if (elapsedMs >= ADMIN_IDLE_TIMEOUT_MS - ADMIN_IDLE_WARNING_MS) {
        openIdleWarning();
      } else {
        scheduleIdleTimers();
      }
    };

    resetIdleTimersRef.current = () => {
      isIdleWarningOpenRef.current = false;
      setIsIdleWarningOpen(false);
      lastAdminActivityAtRef.current = Date.now();
      lastAdminHeartbeatAtRef.current = Date.now();
      scheduleIdleTimers();
    };

    ["pointerdown", "keydown", "touchstart", "scroll"].forEach((eventName) => {
      window.addEventListener(eventName, recordActivity, { passive: true });
    });
    window.addEventListener("mousemove", recordMouseActivity, { passive: true });
    document.addEventListener("visibilitychange", handleVisibilityChange);
    scheduleIdleTimers();

    return () => {
      clearIdleTimers();
      resetIdleTimersRef.current = null;
      ["pointerdown", "keydown", "touchstart", "scroll"].forEach((eventName) => {
        window.removeEventListener(eventName, recordActivity);
      });
      window.removeEventListener("mousemove", recordMouseActivity);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [forceAdminLogout]);

  const paidApplicationCount = useMemo(
    () => applications.filter((item) => item.paymentStatus === "DONE").length,
    [applications],
  );
  const latestApplications = useMemo(() => applications.slice(0, 5), [applications]);
  const latestStageServices = useMemo(() => stageServices.slice(0, 5), [stageServices]);
  const latestRefunds = useMemo(() => refundRequests.slice(0, 5), [refundRequests]);
  const latestAuditLogs = useMemo(() => auditLogs.slice(0, 5), [auditLogs]);
  const refundProcessingCount = useMemo(
    () =>
      refundRequests.filter((item) =>
        ["REQUESTED", "PROCESSING", "SYNC_FAILED"].includes(item.requestStatus),
      ).length,
    [refundRequests],
  );
  const refundCompletedCount = useMemo(
    () => refundRequests.filter((item) => item.requestStatus === "COMPLETED").length,
    [refundRequests],
  );
  const refundFailedCount = useMemo(
    () => refundRequests.filter((item) => item.requestStatus === "FAILED").length,
    [refundRequests],
  );
  const applicationPaymentStatusOptions = useMemo(
    () =>
      Array.from(new Set(applications.map((item) => item.paymentStatus).filter(Boolean))).map(
        (value) => ({
          value,
          label: value,
        }),
      ),
    [applications],
  );
  const stageServiceTypeOptions = useMemo(
    () =>
      Array.from(new Set(stageServices.map((item) => item.serviceType).filter(Boolean))).map(
        (value) => ({
          value,
          label: getStageServiceTitle(value) || value,
        }),
      ),
    [stageServices],
  );
  const refundRequestStatusOptions = useMemo(
    () =>
      Array.from(new Set(refundRequests.map((item) => item.requestStatus).filter(Boolean))).map(
        (value) => ({
          value,
          label: value,
        }),
      ),
    [refundRequests],
  );
  const refundPaymentStatusOptions = useMemo(
    () =>
      Array.from(new Set(refunds.map((item) => item.paymentStatus).filter(Boolean))).map((value) => ({
        value,
        label: value,
      })),
    [refunds],
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
    () =>
      applications.filter((row) => {
        if (
          applicationPaymentStatusFilter !== "all"
          && row.paymentStatus !== applicationPaymentStatusFilter
        ) {
          return false;
        }

        return matchesSearch(
          applicationSearch,
          row.applicationNumber,
          row.orderId,
          row.name,
          row.phone,
          row.email,
          row.birthDate,
          row.organization,
          row.division,
          row.discipline,
          row.weightClass,
          row.paymentStatus,
          row.introduction,
          formatStoredSnsIdentity(row.snsIdentity || row.instagramId, "ko", "-"),
          row.documentOriginalFilename,
        );
      }),
    [applicationPaymentStatusFilter, applicationSearch, applications],
  );
  const filteredStageServices = useMemo(
    () =>
      stageServices.filter((row) => {
        if (stageServiceTypeFilter !== "all" && row.serviceType !== stageServiceTypeFilter) {
          return false;
        }

        const meta = getStageServiceMeta(row);

        return matchesSearch(
          stageServiceSearch,
          row.serviceOrderNumber,
          row.orderId,
          row.paymentKey,
          row.name,
          row.phone,
          row.email,
          row.linkedApplicationNumber,
          row.linkedDiscipline,
          row.serviceType,
          meta.primary,
          meta.secondary,
          row.paymentStatus,
          row.serviceStatus,
        );
      }),
    [stageServiceSearch, stageServiceTypeFilter, stageServices],
  );
  const filteredRefundRequests = useMemo(
    () =>
      refundRequests.filter((row) => {
        if (refundRequestStatusFilter !== "all" && row.requestStatus !== refundRequestStatusFilter) {
          return false;
        }

        return matchesSearch(
          refundRequestSearch,
          row.applicationNumber,
          row.serviceOrderNumber,
          row.serviceType,
          row.orderId,
          row.paymentKey,
          row.name,
          row.phone,
          row.email,
          row.requestReason,
          row.requestStatus,
          row.policyRuleLabel,
          row.policyRuleId,
          row.providerStatusCode,
          row.providerErrorCode,
          row.providerErrorMessage,
          row.requestedByName,
          row.requestedByEmail,
        );
      }),
    [refundRequestSearch, refundRequestStatusFilter, refundRequests],
  );
  const filteredRefundPayments = useMemo(
    () =>
      refunds.filter((row) => {
        if (refundPaymentStatusFilter !== "all" && row.paymentStatus !== refundPaymentStatusFilter) {
          return false;
        }

        return matchesSearch(
          refundPaymentSearch,
          row.orderId,
          row.paymentKey,
          row.applicationNumber,
          row.serviceOrderNumber,
          row.serviceType,
          row.name,
          row.phone,
          row.email,
          row.division,
          row.discipline,
          row.paymentStatus,
          row.orderStatus,
        );
      }),
    [refundPaymentSearch, refundPaymentStatusFilter, refunds],
  );
  const filteredAuditLogs = useMemo(
    () =>
      auditLogs.filter((row) => {
        if (auditActionFilter !== "all" && row.action !== auditActionFilter) {
          return false;
        }

        return matchesSearch(
          auditSearch,
          row.action,
          row.targetType,
          row.targetId,
          row.ipAddress,
          row.userAgent,
          row.adminUserDisplayName,
          row.adminUserEmail,
          row.adminUserRole,
          row.createdAt,
          row.metadata ? JSON.stringify(row.metadata) : "",
        );
      }),
    [auditActionFilter, auditLogs, auditSearch],
  );

  const dashboardSections = [
    { id: "overview", label: "개요" },
    { id: "applications", label: "등록 현황" },
    { id: "stageServices", label: "무대 서비스 관리" },
    { id: "refunds", label: "환불 / 취소 현황" },
    { id: "audit", label: "감사 로그" },
    ...(adminUser?.role === "superadmin" ? [{ id: "accounts", label: "관리자 계정" }] : []),
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
      await keepAliveAdminSession();
      resetIdleTimersRef.current?.();
    } catch (_error) {
      await forceAdminLogout();
    } finally {
      setIsExtendingAdminSession(false);
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
          {sessionExpiresAt ? (
            <p>세션 만료 예정: {formatDateTime(sessionExpiresAt)}</p>
          ) : null}
        </div>
        <Button variant="ghost" onClick={handleLogout}>
          로그아웃
        </Button>
      </div>

      {errorMessage ? <p className="site-error-message">{errorMessage}</p> : null}

      <div className="site-admin-summary">
        <SummaryCard label="전체 등록 건수" value={applications.length} />
        <SummaryCard label="결제 완료" value={paidApplicationCount} />
        <SummaryCard label="무대 서비스 주문" value={stageServices.length} />
        <SummaryCard label="환불 요청" value={refundRequests.length} />
        <SummaryCard label="최근 감사 로그" value={auditLogs.length} />
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
            onClick={() => setActiveSection(section.id)}
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
                    onClick={() => setActiveSection("applications")}
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
                    onClick={() => setActiveSection("stageServices")}
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
                    onClick={() => setActiveSection("refunds")}
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
                    onClick={() => setActiveSection("audit")}
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

          {activeSection === "applications" ? (
            <>
              <SectionControls
                searchPlaceholder="신청번호, 이름, 이메일, 종목, SNS, 파일명 검색"
                searchValue={applicationSearch}
                onSearchChange={setApplicationSearch}
                filterValue={applicationPaymentStatusFilter}
                onFilterChange={setApplicationPaymentStatusFilter}
                filterOptions={applicationPaymentStatusOptions}
                onDownload={() =>
                  downloadWorkbookFile(
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
                      { key: "weightClass", label: "체급" },
                      { key: "paymentStatus", label: "결제상태" },
                      { key: "documentOriginalFilename", label: "문서 파일" },
                      {
                        key: "submittedAt",
                        label: "접수일시",
                        getValue: (row) => formatDateTime(row.submittedAt),
                      },
                    ],
                    filteredApplications,
                  )
                }
                downloadDisabled={!filteredApplications.length}
              />
              <TableSection
                title="등록 현황"
                defaultSortKey="submittedAt"
                columns={[
                  {
                    key: "applicationNumber",
                    label: "신청 / 주문",
                    render: (row) => (
                      <MetaCell primary={row.applicationNumber} secondary={row.orderId} />
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
                  {
                    key: "profile",
                    label: "기본 정보",
                    render: (row) => (
                      <MetaCell
                        primary={`생년월일 ${formatBirthDate(row.birthDate)}`}
                        secondary={`소속 ${row.organization || "-"}`}
                      />
                    ),
                  },
                  {
                    key: "identity",
                    label: "SNS / 소개",
                    render: (row) => (
                      <MetaCell
                        primary={formatStoredSnsIdentity(row.snsIdentity || row.instagramId, "ko", "-")}
                        secondary={row.introduction || "-"}
                      />
                    ),
                  },
                  {
                    key: "discipline",
                    label: "부문 / 종목",
                    render: (row) => (
                      <MetaCell
                        primary={row.discipline}
                        secondary={`${row.division || "-"} / 체급 ${row.weightClass || "-"}`}
                      />
                    ),
                  },
                  {
                    key: "documentFile",
                    label: "제출 문서",
                    render: (row) => (
                      <DocumentDownloadLinks
                        applicationNumber={row.applicationNumber}
                        files={row.documentFiles}
                      />
                    ),
                  },
                  { key: "paymentStatus", label: "결제 상태" },
                  {
                    key: "submittedAt",
                    label: "접수 일시",
                    render: (row) => formatDateTime(row.submittedAt),
                  },
                  {
                    key: "actions",
                    label: "관리",
                    sortable: false,
                    render: (row) => (
                      <div className="site-admin-table__actions">
                        <button
                          className="site-admin-action-button"
                          onClick={() => openApplicationEditor(row)}
                          type="button"
                        >
                          수정
                        </button>
                        {adminUser?.role === "superadmin" ? (
                          <button
                            className="site-admin-action-button site-admin-action-button--danger"
                            disabled={row.paymentStatus === "DONE"}
                            onClick={() => handleApplicationDelete(row)}
                            title={row.paymentStatus === "DONE" ? "결제 완료 건은 환불 절차를 사용해야 합니다." : undefined}
                            type="button"
                          >
                            삭제
                          </button>
                        ) : null}
                      </div>
                    ),
                  },
                ]}
                rows={filteredApplications}
                emptyText="조건에 맞는 신청 내역이 없습니다."
              />
            </>
          ) : null}

          {activeSection === "stageServices" ? (
            <>
              <SectionControls
                searchPlaceholder="주문번호, 신청자, 연동 신청번호, 서비스 내용 검색"
                searchValue={stageServiceSearch}
                onSearchChange={setStageServiceSearch}
                filterValue={stageServiceTypeFilter}
                onFilterChange={setStageServiceTypeFilter}
                filterOptions={stageServiceTypeOptions}
                onDownload={() =>
                  downloadWorkbookFile(
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
                      { key: "linkedApplicationNumber", label: "연동 신청번호" },
                      { key: "linkedDiscipline", label: "연동 종목" },
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
                      { key: "purchasedAt", label: "구매일시", getValue: (row) => formatDateTime(row.purchasedAt) },
                    ],
                    filteredStageServices,
                  )
                }
                downloadDisabled={!filteredStageServices.length}
              />
              <TableSection
                title="무대 서비스 주문 현황"
                defaultSortKey="purchasedAt"
                columns={[
                  {
                    key: "serviceOrderNumber",
                    label: "주문 / 결제",
                    render: (row) => (
                      <MetaCell
                        primary={row.serviceOrderNumber}
                        secondary={`${row.orderId || "-"} / ${row.paymentKey || "-"}`}
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
                  {
                    key: "linkedApplication",
                    label: "연동 신청",
                    render: (row) => (
                      <MetaCell
                        primary={row.linkedApplicationNumber || "-"}
                        secondary={row.linkedDiscipline || "-"}
                      />
                    ),
                  },
                  {
                    key: "serviceType",
                    label: "서비스 내용",
                    render: (row) => {
                      const meta = getStageServiceMeta(row);
                      return <MetaCell primary={meta.primary} secondary={meta.secondary} />;
                    },
                  },
                  {
                    key: "totalAmount",
                    label: "금액",
                    render: (row) => formatAmount(row.totalAmount),
                  },
                  {
                    key: "status",
                    label: "상태",
                    render: (row) => (
                      <MetaCell
                        primary={`결제 ${row.paymentStatus || "-"}`}
                        secondary={`서비스 ${row.serviceStatus || "-"}`}
                      />
                    ),
                  },
                  {
                    key: "purchasedAt",
                    label: "구매 일시",
                    render: (row) => formatDateTime(row.purchasedAt),
                  },
                ]}
                rows={filteredStageServices}
                emptyText="조건에 맞는 무대 서비스 주문이 없습니다."
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
                <SummaryCard label="전체 요청" value={refundRequests.length} />
                <SummaryCard label="처리 중/동기화 필요" value={refundProcessingCount} />
                <SummaryCard label="완료" value={refundCompletedCount} />
                <SummaryCard label="실패" value={refundFailedCount} />
                <SummaryCard label="취소 결제 기록" value={refunds.length} />
              </div>

              <SectionControls
                searchPlaceholder="신청번호, 주문번호, 신청자, 사유, 정책, 오류 검색"
                searchValue={refundRequestSearch}
                onSearchChange={setRefundRequestSearch}
                filterValue={refundRequestStatusFilter}
                onFilterChange={setRefundRequestStatusFilter}
                filterOptions={refundRequestStatusOptions}
                onDownload={() =>
                  downloadWorkbookFile(
                    "admin-refund-requests.xlsx",
                    "환불 요청",
                    [
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
                    filteredRefundRequests,
                  )
                }
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
                        secondary={`${row.refundTarget === "stage-service" ? "무대 서비스" : "대회 신청"} / ${row.orderId || "-"}`}
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
              />

              <SectionControls
                searchPlaceholder="주문번호, 신청번호, 신청자, 결제상태 검색"
                searchValue={refundPaymentSearch}
                onSearchChange={setRefundPaymentSearch}
                filterValue={refundPaymentStatusFilter}
                onFilterChange={setRefundPaymentStatusFilter}
                filterOptions={refundPaymentStatusOptions}
                onDownload={() =>
                  downloadWorkbookFile(
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
                    filteredRefundPayments,
                  )
                }
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
              />
            </>
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
                onSearchChange={setAuditSearch}
                filterValue={auditActionFilter}
                onFilterChange={setAuditActionFilter}
                filterOptions={auditActionOptions}
                onDownload={() =>
                  downloadWorkbookFile(
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
                    filteredAuditLogs,
                  )
                }
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
              />
            </>
          ) : null}
        </>
      )}
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
            <p>1분 동안 동작이 없어 자동 로그아웃됩니다. 계속 관리자 페이지를 사용하시겠습니까?</p>
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
