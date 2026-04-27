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
  const response = await fetch("/api/applications/draft", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return readJson(response);
}

export async function updateDraft(draftId, payload) {
  const response = await fetch(`/api/applications/draft/${draftId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return readJson(response);
}

export async function getDraft(draftId) {
  const response = await fetch(`/api/applications/draft/${draftId}`);
  return readJson(response);
}

export async function uploadFile(payload) {
  const formData = new FormData();
  formData.append("draftId", payload.draftId);
  formData.append("file", payload.file);

  const response = await fetch("/api/files/upload", {
    method: "POST",
    body: formData,
  });

  return readJson(response);
}

export async function createOrder(payload) {
  const response = await fetch("/api/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return readJson(response);
}

export async function completeApplication(payload) {
  const response = await fetch("/api/applications/complete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return readJson(response);
}

export async function lookupApplication(payload) {
  const response = await fetch("/api/applications/lookup", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return readJson(response);
}

export async function getApplicationByNumber(applicationNumber) {
  const response = await fetch(`/api/applications/${applicationNumber}`);
  return readJson(response);
}

export async function getApplicationByOrder(orderId) {
  const response = await fetch(`/api/applications/by-order/${orderId}`);
  return readJson(response);
}
