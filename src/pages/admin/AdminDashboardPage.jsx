import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/common/Button";
import {
  adminLogout,
  buildApiUrl,
  getAdminApplications,
  getAdminMe,
  getAdminRefunds,
  getAdminRegisterAssets,
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

function TableSection({ title, columns, rows, emptyText }) {
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
                <th key={column.key}>{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row, index) => (
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
    </section>
  );
}

export function AdminDashboardPage() {
  const navigate = useNavigate();
  const [adminUser, setAdminUser] = useState(null);
  const [applications, setApplications] = useState([]);
  const [refunds, setRefunds] = useState([]);
  const [assets, setAssets] = useState([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadAdminData() {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const [meResponse, applicationsResponse, refundsResponse, assetsResponse] =
          await Promise.all([
            getAdminMe(),
            getAdminApplications(),
            getAdminRefunds(),
            getAdminRegisterAssets(),
          ]);

        if (cancelled) {
          return;
        }

        setAdminUser(meResponse.adminUser);
        setApplications(applicationsResponse.applications || []);
        setRefunds(refundsResponse.refunds || []);
        setAssets(assetsResponse.assets || []);
      } catch (error) {
        if (cancelled) {
          return;
        }

        if (error.code === "ADMIN_AUTH_REQUIRED") {
          navigate("/admin/login", { replace: true });
          return;
        }

        setErrorMessage(error.message || "관리자 데이터를 불러오지 못했습니다.");
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadAdminData();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const paidApplicationCount = useMemo(
    () => applications.filter((item) => item.paymentStatus === "DONE").length,
    [applications],
  );

  async function handleLogout() {
    try {
      await adminLogout();
    } finally {
      navigate("/admin/login", { replace: true });
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
        <Button variant="ghost" onClick={handleLogout}>
          로그아웃
        </Button>
      </div>

      {errorMessage ? <p className="site-error-message">{errorMessage}</p> : null}

      <div className="site-admin-summary">
        <SummaryCard label="전체 등록 건수" value={applications.length} />
        <SummaryCard label="결제 완료" value={paidApplicationCount} />
        <SummaryCard label="환불/취소 상태" value={refunds.length} />
        <SummaryCard label="R2 등록 이미지" value={assets.length} />
      </div>

      {isLoading ? (
        <div className="site-admin-loading">관리자 데이터를 불러오는 중입니다.</div>
      ) : (
        <>
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
                  <MetaCell primary={row.name} secondary={`${row.phone || "-"} / ${row.email || "-"}`} />
                ),
              },
              {
                key: "discipline",
                label: "부문 / 종목",
                render: (row) => (
                  <MetaCell primary={row.discipline} secondary={`${row.division || "-"} / ${row.organization || "-"}`} />
                ),
              },
              { key: "paymentStatus", label: "결제 상태" },
              {
                key: "submittedAt",
                label: "접수 일시",
                render: (row) => formatDateTime(row.submittedAt),
              },
            ]}
            rows={applications}
            emptyText="등록된 신청 내역이 없습니다."
          />

          <TableSection
            title="환불 / 취소 현황"
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
                  <MetaCell primary={row.applicationNumber || "-"} secondary={`${row.division || "-"} / ${row.discipline || "-"}`} />
                ),
              },
              {
                key: "name",
                label: "신청자",
                render: (row) => (
                  <MetaCell primary={row.name} secondary={`${row.phone || "-"} / ${row.email || "-"}`} />
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
            rows={refunds}
            emptyText="환불 또는 취소 상태의 결제 내역이 없습니다."
          />

          <section className="site-admin-section">
            <div className="site-admin-section__header">
              <h2>R2 등록 이미지</h2>
            </div>
            {assets.length ? (
              <div className="site-admin-assets-grid">
                {assets.map((asset) => (
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
              <div className="site-admin-loading">register/ 경로에 등록된 이미지가 없습니다.</div>
            )}
          </section>
        </>
      )}
    </section>
  );
}
