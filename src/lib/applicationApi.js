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

export async function apiFetch(path, options) {
  return fetch(buildApiUrl(path), options);
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

export async function getApplicationByNumber(applicationNumber) {
  const response = await apiFetch(`/api/applications/${applicationNumber}`);
  return readJson(response);
}

export async function getApplicationByOrder(orderId) {
  const response = await apiFetch(`/api/applications/by-order/${orderId}`);
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

export async function getAdminApplications() {
  const response = await adminApiFetch("/api/admin/applications");
  return readJson(response);
}

export async function getAdminRefunds() {
  const response = await adminApiFetch("/api/admin/refunds");
  return readJson(response);
}

export async function getAdminRegisterAssets() {
  const response = await adminApiFetch("/api/admin/assets/register");
  return readJson(response);
}

export async function getAdminAuditLogs() {
  const response = await adminApiFetch("/api/admin/audit-logs");
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
