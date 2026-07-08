import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import excelDownloadIcon from "../../assets/excel-download-icon.png";
import { Button } from "../../components/common/Button";
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
  getAdminApplications,
  getAdminAuditLogs,
  getAdminMe,
  getAdminRefunds,
  getAdminRegisterAssets,
  getAdminStageServices,
  retryAdminRefundSync,
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

function DownloadLinkCell({ applicationNumber, fileKind, filename, emptyLabel = "-" }) {
  if (!filename) {
    return <span>{emptyLabel}</span>;
  }

  const href = buildApiUrl(
    `/api/admin/applications/${encodeURIComponent(applicationNumber)}/files/${fileKind}/download`,
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

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
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
      wch: Math.min(Math.max(width + 2, 12), 48),
    };
  });
}

async function downloadWorkbookFile(filename, sheetName, columns, rows) {
  if (!rows.length) {
    return;
  }

  const xlsxModule = await import("xlsx");
  const xlsx = xlsxModule?.utils ? xlsxModule : xlsxModule.default;

  if (!xlsx?.utils || typeof xlsx.writeFile !== "function") {
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
  const worksheet = xlsx.utils.aoa_to_sheet(worksheetRows);
  worksheet["!cols"] = getWorksheetColumns(worksheetRows);

  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, sanitizeSheetName(sheetName));
  xlsx.writeFile(workbook, filename, {
    compression: true,
  });
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
  const defaultSortKey = sortableColumns[0]?.key || "";
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
                <tr key={row.id || row.orderId || row.applicationNumber || index}>
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

export function AdminDashboardPage() {
  const navigate = useNavigate();
  const [adminUser, setAdminUser] = useState(null);
  const [sessionExpiresAt, setSessionExpiresAt] = useState(null);
  const [applications, setApplications] = useState([]);
  const [stageServices, setStageServices] = useState([]);
  const [refundRequests, setRefundRequests] = useState([]);
  const [refunds, setRefunds] = useState([]);
  const [assets, setAssets] = useState([]);
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
  const [assetSearch, setAssetSearch] = useState("");
  const [auditSearch, setAuditSearch] = useState("");
  const [auditActionFilter, setAuditActionFilter] = useState("all");
  const [retryingRefundRequestId, setRetryingRefundRequestId] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const loadAdminData = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setIsLoading(true);
    }
    setErrorMessage("");

    try {
      const [
        meResponse,
        applicationsResponse,
        stageServicesResponse,
        refundsResponse,
        assetsResponse,
        auditLogsResponse,
      ] = await Promise.all([
        getAdminMe(),
        getAdminApplications(),
        getAdminStageServices(),
        getAdminRefunds(),
        getAdminRegisterAssets(),
        getAdminAuditLogs(),
      ]);

      setAdminUser(meResponse.adminUser);
      setSessionExpiresAt(meResponse.session?.expiresAt || null);
      setApplications(applicationsResponse.applications || []);
      setStageServices(stageServicesResponse.stageServices || []);
      setRefundRequests(refundsResponse.refundRequests || []);
      setRefunds(refundsResponse.refunds || []);
      setAssets(assetsResponse.assets || []);
      setAuditLogs(auditLogsResponse.auditLogs || []);
    } catch (error) {
      if (error.code === "ADMIN_AUTH_REQUIRED" || error.code === "ADMIN_SESSION_EXPIRED") {
        navigate("/admin/login", { replace: true });
        return;
      }

      setErrorMessage(error.message || "관리자 데이터를 불러오지 못했습니다.");
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  }, [navigate]);

  useEffect(() => {
    loadAdminData();
  }, [loadAdminData]);

  const paidApplicationCount = useMemo(
    () => applications.filter((item) => item.paymentStatus === "DONE").length,
    [applications],
  );
  const latestApplications = useMemo(() => applications.slice(0, 5), [applications]);
  const latestStageServices = useMemo(() => stageServices.slice(0, 5), [stageServices]);
  const latestRefunds = useMemo(() => refundRequests.slice(0, 5), [refundRequests]);
  const latestAssets = useMemo(() => assets.slice(0, 4), [assets]);
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
          row.audioOriginalFilename,
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
  const filteredAssets = useMemo(
    () => assets.filter((row) => matchesSearch(assetSearch, row.filename, row.key, row.sizeLabel)),
    [assetSearch, assets],
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
    { id: "applications", label: "대회 신청" },
    { id: "stageServices", label: "무대 서비스" },
    { id: "refunds", label: "환불 현황" },
    { id: "assets", label: "R2 자산" },
    { id: "audit", label: "감사 로그" },
  ];

  async function handleLogout() {
    try {
      await adminLogout();
    } finally {
      navigate("/admin/login", { replace: true });
    }
  }

  async function handleRetryRefundSync(refundRequestId) {
    setRetryingRefundRequestId(refundRequestId);
    setErrorMessage("");

    try {
      await retryAdminRefundSync(refundRequestId);
      await loadAdminData({ silent: true });
    } catch (error) {
      setErrorMessage(error.message || "환불 재동기화에 실패했습니다.");
    } finally {
      setRetryingRefundRequestId(null);
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
        <SummaryCard label="R2 등록 이미지" value={assets.length} />
        <SummaryCard label="최근 감사 로그" value={auditLogs.length} />
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
                    <p className="site-kicker">R2 Assets</p>
                    <h2>register/ 최근 이미지</h2>
                  </div>
                  <button
                    className="site-admin-overview-card__action"
                    onClick={() => setActiveSection("assets")}
                    type="button"
                  >
                    전체 보기
                  </button>
                </div>
                {latestAssets.length ? (
                  <div className="site-admin-overview-assets">
                    {latestAssets.map((asset) => (
                      <article className="site-admin-overview-assets__item" key={asset.key}>
                        <img
                          alt={asset.key}
                          src={buildApiUrl(`/api/home/gallery-image?key=${encodeURIComponent(asset.key)}`)}
                        />
                        <span>{asset.filename}</span>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="site-admin-loading">register/ 경로에 등록된 이미지가 없습니다.</div>
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
                      { key: "applicationNumber", label: "신청번호" },
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
                      { key: "audioOriginalFilename", label: "MP3 파일" },
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
                      <DownloadLinkCell
                        applicationNumber={row.applicationNumber}
                        fileKind="document"
                        filename={row.documentOriginalFilename}
                      />
                    ),
                  },
                  {
                    key: "audioFile",
                    label: "MP3",
                    render: (row) => (
                      <DownloadLinkCell
                        applicationNumber={row.applicationNumber}
                        fileKind="audio"
                        filename={row.audioOriginalFilename}
                      />
                    ),
                  },
                  { key: "paymentStatus", label: "결제 상태" },
                  {
                    key: "submittedAt",
                    label: "접수 일시",
                    render: (row) => formatDateTime(row.submittedAt),
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
                columns={[
                  {
                    key: "applicationNumber",
                    label: "신청 / 주문",
                    render: (row) => (
                      <MetaCell
                        primary={row.applicationNumber || "-"}
                        secondary={`${row.orderId || "-"} / ${row.paymentKey || "-"}`}
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
                    key: "timestamps",
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
                          disabled={retryingRefundRequestId === row.id}
                          onClick={() => handleRetryRefundSync(row.id)}
                          type="button"
                        >
                          {retryingRefundRequestId === row.id ? "재동기화 중..." : "재동기화"}
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
                      { key: "applicationNumber", label: "신청번호" },
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
                        primary={row.applicationNumber || "-"}
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

          {activeSection === "assets" ? (
            <section className="site-admin-section">
              <div className="site-admin-section__header">
                <h2>R2 등록 이미지</h2>
              </div>
              <SectionControls
                searchPlaceholder="파일명, object key, 크기 검색"
                searchValue={assetSearch}
                onSearchChange={setAssetSearch}
                onDownload={() =>
                  downloadWorkbookFile(
                    "admin-r2-assets.xlsx",
                    "R2 자산",
                    [
                      { key: "filename", label: "파일명" },
                      { key: "key", label: "Object Key" },
                      { key: "sizeLabel", label: "크기" },
                      { key: "lastModified", label: "수정시각", getValue: (row) => formatDateTime(row.lastModified) },
                    ],
                    filteredAssets,
                  )
                }
                downloadDisabled={!filteredAssets.length}
              />
              {filteredAssets.length ? (
                <div className="site-admin-assets-grid">
                  {filteredAssets.map((asset) => (
                    <article className="site-admin-asset-card" key={asset.key}>
                      <img
                        alt={asset.key}
                        src={buildApiUrl(`/api/home/gallery-image?key=${encodeURIComponent(asset.key)}`)}
                      />
                      <div className="site-admin-asset-card__meta">
                        <strong>{asset.filename}</strong>
                        <span>{asset.key}</span>
                        <span>{asset.sizeLabel}</span>
                        <span>{formatDateTime(asset.lastModified)}</span>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="site-admin-loading">조건에 맞는 register/ 이미지가 없습니다.</div>
              )}
            </section>
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
    </section>
  );
}
