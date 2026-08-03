const apiBaseUrl = normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL);

function normalizeApiBaseUrl(value) {
  if (!value) {
    return "";
  }

  return value.replace(/\/+$/, "");
}

export function buildApiUrl(path) {
  if (!apiBaseUrl) {
    return path;
  }

  const resolvedPath = path.replace(/^\/api(?=\/)/, "");
  return `${apiBaseUrl}${resolvedPath}`;
}

export async function apiFetch(path, options = {}) {
  return fetch(buildApiUrl(path), {
    credentials: "include",
    ...options,
  });
}

export async function adminApiFetch(path, options = {}) {
  const nextOptions = {
    credentials: "include",
    ...options,
  };

  return fetch(buildApiUrl(path), nextOptions);
}

async function readJson(response) {
  const json = await response.json();

  if (!response.ok || json.ok === false) {
    const error = new Error(json.message || "Request failed");
    error.code = json.code;
    throw error;
  }

  return json;
}

export async function createDraft(payload) {
  const response = await apiFetch("/api/applications/draft", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return readJson(response);
}

export async function updateDraft(draftId, payload) {
  const response = await apiFetch(`/api/applications/draft/${draftId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return readJson(response);
}

export async function getDraft(draftId) {
  const response = await apiFetch(`/api/applications/draft/${draftId}`);
  return readJson(response);
}

export async function uploadFile(payload) {
  const formData = new FormData();
  formData.append("draftId", payload.draftId);
  formData.append("file", payload.file);

  const response = await apiFetch("/api/files/upload", {
    method: "POST",
    body: formData,
  });

  return readJson(response);
}

export async function createOrder(payload) {
  const response = await apiFetch("/api/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return readJson(response);
}

export async function createKcpTestOrder(payload) {
  const response = await apiFetch("/api/kcp/test/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return readJson(response);
}

export async function cancelKcpTestOrder(orderId, payload) {
  const response = await apiFetch(`/api/kcp/test/orders/${encodeURIComponent(orderId)}/cancel`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return readJson(response);
}

export async function cancelPendingApplicationOrder(orderId, payload) {
  const response = await apiFetch(`/api/orders/${encodeURIComponent(orderId)}/cancel`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return readJson(response);
}

export async function createKcpTestStageServiceDraft(payload) {
  const response = await apiFetch("/api/kcp/test/stage-services/draft", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return readJson(response);
}

export async function createKcpTestStageServiceOrder(payload) {
  const response = await apiFetch("/api/kcp/test/stage-services/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return readJson(response);
}

export async function cancelKcpTestStageServiceOrder(orderId, payload) {
  const response = await apiFetch(
    `/api/kcp/test/stage-services/orders/${encodeURIComponent(orderId)}/cancel`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  return readJson(response);
}

export async function createKcpTestSpectatorDraft(payload) {
  const response = await apiFetch("/api/kcp/test/spectators/draft", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return readJson(response);
}

export async function createKcpTestSpectatorOrder(payload) {
  const response = await apiFetch("/api/kcp/test/spectators/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return readJson(response);
}

export async function cancelKcpTestSpectatorOrder(orderId, payload) {
  const response = await apiFetch(
    `/api/kcp/test/spectators/orders/${encodeURIComponent(orderId)}/cancel`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  return readJson(response);
}

export async function prepareKcpPayment(payload) {
  const response = await apiFetch("/api/kcp/trade/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return readJson(response);
}

export async function completeApplication(payload) {
  const response = await apiFetch("/api/applications/complete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return readJson(response);
}

export async function lookupApplication(payload) {
  const response = await apiFetch("/api/applications/lookup", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return readJson(response);
}

export async function sendLookupVerificationCode(payload) {
  const response = await apiFetch("/api/applications/lookup-verification/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return readJson(response);
}

export async function verifyLookupVerificationCode(payload) {
  const response = await apiFetch("/api/applications/lookup-verification/verify", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return readJson(response);
}

export async function sendApplicationEmailVerificationCode(payload) {
  const response = await apiFetch("/api/applications/email-verification/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return readJson(response);
}

export async function verifyApplicationEmailVerificationCode(payload) {
  const response = await apiFetch("/api/applications/email-verification/verify", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return readJson(response);
}

export async function getApplicationEmailVerificationStatus({ name, email }) {
  const query = new URLSearchParams({ name, email });
  const response = await apiFetch(`/api/applications/email-verification/status?${query.toString()}`);
  return readJson(response);
}

export async function getApplicationRefundQuote(payload) {
  const response = await apiFetch("/api/applications/refund/quote", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return readJson(response);
}

export async function requestApplicationRefund(payload) {
  const response = await apiFetch("/api/applications/refund/request", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return readJson(response);
}

export async function getApplicationByNumber(applicationNumber) {
  const response = await apiFetch(`/api/applications/${applicationNumber}`);
  return readJson(response);
}

export async function getApplicationByOrder(orderId) {
  const response = await apiFetch(`/api/applications/by-order/${orderId}`);
  return readJson(response);
}

export async function createStageServiceDraft(payload) {
  const response = await apiFetch("/api/stage-services/draft", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return readJson(response);
}

export async function updateStageServiceDraft(draftId, payload) {
  const response = await apiFetch(`/api/stage-services/draft/${draftId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return readJson(response);
}

export async function getStageServiceDraft(draftId) {
  const response = await apiFetch(`/api/stage-services/draft/${draftId}`);
  return readJson(response);
}

export async function createStageServiceOrder(payload) {
  const response = await apiFetch("/api/stage-services/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return readJson(response);
}

export async function completeStageService(payload) {
  const response = await apiFetch("/api/stage-services/complete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return readJson(response);
}

export async function getStageServiceOrderByNumber(serviceOrderNumber) {
  const response = await apiFetch(`/api/stage-services/${serviceOrderNumber}`);
  return readJson(response);
}

export async function getStageServiceOrderByOrder(orderId) {
  const response = await apiFetch(`/api/stage-services/by-order/${orderId}`);
  return readJson(response);
}

export async function getStageServiceSummary(payload) {
  const response = await apiFetch("/api/stage-services/summary", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return readJson(response);
}

export async function cancelPendingStageServiceOrder(orderId, payload) {
  const response = await apiFetch(
    `/api/stage-services/orders/${encodeURIComponent(orderId)}/cancel`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  return readJson(response);
}

export async function getEligibleStageServiceApplications(payload) {
  const response = await apiFetch("/api/stage-services/eligible-applications", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return readJson(response);
}

export async function getStageServiceRefundQuote(payload) {
  const response = await apiFetch("/api/stage-services/refund/quote", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return readJson(response);
}

export async function requestStageServiceRefund(payload) {
  const response = await apiFetch("/api/stage-services/refund/request", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return readJson(response);
}

export async function createSpectatorDraft(payload) {
  const response = await apiFetch("/api/spectators/draft", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return readJson(response);
}

export async function updateSpectatorConsents(draftId, payload) {
  const response = await apiFetch(`/api/spectators/draft/${encodeURIComponent(draftId)}/consents`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return readJson(response);
}

export async function getSpectatorDraft(draftId) {
  const response = await apiFetch(`/api/spectators/draft/${encodeURIComponent(draftId)}`);
  return readJson(response);
}

export async function createSpectatorOrder(payload) {
  const response = await apiFetch("/api/spectators/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return readJson(response);
}

export async function completeSpectatorOrder(payload) {
  const response = await apiFetch("/api/spectators/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return readJson(response);
}

export async function getSpectatorOrderByNumber(spectatorOrderNumber) {
  const response = await apiFetch(`/api/spectators/${encodeURIComponent(spectatorOrderNumber)}`);
  return readJson(response);
}

export async function cancelPendingSpectatorOrder(orderId, payload) {
  const response = await apiFetch(`/api/spectators/orders/${encodeURIComponent(orderId)}/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return readJson(response);
}

export async function getSpectatorRefundQuote(payload) {
  const response = await apiFetch("/api/spectators/refund/quote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return readJson(response);
}

export async function requestSpectatorRefund(payload) {
  const response = await apiFetch("/api/spectators/refund/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return readJson(response);
}

export async function adminLogin(payload) {
  const response = await adminApiFetch("/api/admin/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return readJson(response);
}

export async function adminLogout() {
  const response = await adminApiFetch("/api/admin/logout", {
    method: "POST",
  });

  return readJson(response);
}

export async function getAdminMe() {
  const response = await adminApiFetch("/api/admin/me");
  return readJson(response);
}

export async function keepAliveAdminSession() {
  const response = await adminApiFetch("/api/admin/keep-alive", {
    method: "POST",
  });

  return readJson(response);
}

export async function getAdminApplications(params = {}) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value != null && value !== "" && value !== "all") {
      query.set(key, String(value));
    }
  });

  const response = await adminApiFetch(
    `/api/admin/applications${query.size ? `?${query.toString()}` : ""}`,
  );
  return readJson(response);
}

export async function updateAdminApplication(applicationNumber, payload) {
  const response = await adminApiFetch(
    `/api/admin/applications/${encodeURIComponent(applicationNumber)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  return readJson(response);
}

export async function deleteAdminApplication(applicationNumber) {
  const response = await adminApiFetch(
    `/api/admin/applications/${encodeURIComponent(applicationNumber)}`,
    {
      method: "DELETE",
    },
  );

  return readJson(response);
}

export async function getAdminUsers() {
  const response = await adminApiFetch("/api/admin/users");
  return readJson(response);
}

export async function createAdminUser(payload) {
  const response = await adminApiFetch("/api/admin/users", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return readJson(response);
}

export async function updateAdminUser(adminUserId, payload) {
  const response = await adminApiFetch(
    `/api/admin/users/${encodeURIComponent(adminUserId)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  return readJson(response);
}

export async function getAdminStageServices(params = {}) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value != null && value !== "" && value !== "all") {
      query.set(key, String(value));
    }
  });

  const response = await adminApiFetch(
    `/api/admin/stage-services${query.size ? `?${query.toString()}` : ""}`,
  );
  return readJson(response);
}

export async function getAdminRefunds() {
  const response = await adminApiFetch("/api/admin/refunds");
  return readJson(response);
}

export async function getAdminSpectators(params = {}) {
  const response = await adminApiFetch(`/api/admin/spectators${buildAdminQuery(params)}`);
  return readJson(response);
}

function buildAdminQuery(params = {}) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value != null && value !== "" && value !== "all") {
      query.set(key, String(value));
    }
  });

  return query.size ? `?${query.toString()}` : "";
}

export async function getAdminRefundRequests(params = {}) {
  const response = await adminApiFetch(`/api/admin/refund-requests${buildAdminQuery(params)}`);
  return readJson(response);
}

export async function getAdminCanceledPayments(params = {}) {
  const response = await adminApiFetch(`/api/admin/canceled-payments${buildAdminQuery(params)}`);
  return readJson(response);
}

export async function retryAdminRefundSync(refundRequestId, refundTarget = "application") {
  const endpoint = refundTarget === "stage-service"
    ? `/api/admin/stage-service-refunds/${encodeURIComponent(refundRequestId)}/retry-sync`
    : refundTarget === "spectator"
      ? `/api/admin/spectator-refunds/${encodeURIComponent(refundRequestId)}/retry-sync`
      : `/api/admin/refunds/${encodeURIComponent(refundRequestId)}/retry-sync`;
  const response = await adminApiFetch(
    endpoint,
    {
      method: "POST",
    },
  );

  return readJson(response);
}

export async function reconcileAdminKcpPayment(orderId) {
  const response = await adminApiFetch(
    `/api/admin/kcp/payments/${encodeURIComponent(orderId)}/reconcile`,
    {
      method: "POST",
    },
  );

  return readJson(response);
}

export async function getAdminAuditLogs(params = {}) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value != null && value !== "" && value !== "all") {
      query.set(key, String(value));
    }
  });

  const response = await adminApiFetch(
    `/api/admin/audit-logs${query.size ? `?${query.toString()}` : ""}`,
  );
  return readJson(response);
}

export async function getHomeGalleryImages() {
  const response = await apiFetch("/api/home/gallery-images");
  const json = await readJson(response);

  return {
    ...json,
    images: (json.images || []).map((image) => ({
      ...image,
      src: image.key
        ? buildApiUrl(`/api/home/gallery-image?key=${encodeURIComponent(image.key)}`)
        : image.src,
    })),
  };
}
