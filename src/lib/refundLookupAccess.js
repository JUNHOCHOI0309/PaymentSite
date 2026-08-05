const refundLookupAccessStorageKey = "mmkorea-refund-lookup-access";

function getValidRefundLookupAccess(value) {
  const method = value?.method === "phone" ? "phone" : value?.method === "email" ? "email" : "";
  const name = String(value?.name || "").trim();
  const email = method === "email" ? String(value?.email || "").trim() : "";
  const phone = method === "phone" ? String(value?.phone || "").trim() : "";
  const verificationToken = String(value?.verificationToken || "").trim();
  const expiresAt = new Date(value?.expiresAt || "");

  if (
    !method ||
    !name ||
    !(email || phone) ||
    !verificationToken ||
    Number.isNaN(expiresAt.getTime()) ||
    expiresAt.getTime() <= Date.now()
  ) {
    return null;
  }

  return { method, name, email, phone, verificationToken, expiresAt: value.expiresAt };
}

export function storeRefundLookupAccess({ method, session }) {
  if (typeof window === "undefined") {
    return false;
  }

  const access = getValidRefundLookupAccess({ method, ...session });

  if (!access) {
    return false;
  }

  window.sessionStorage.setItem(refundLookupAccessStorageKey, JSON.stringify(access));
  return true;
}

export function getStoredRefundLookupAccess() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawAccess = window.sessionStorage.getItem(refundLookupAccessStorageKey);
    const access = getValidRefundLookupAccess(rawAccess ? JSON.parse(rawAccess) : null);

    if (!access) {
      window.sessionStorage.removeItem(refundLookupAccessStorageKey);
    }

    return access;
  } catch {
    window.sessionStorage.removeItem(refundLookupAccessStorageKey);
    return null;
  }
}

export function clearStoredRefundLookupAccess() {
  if (typeof window !== "undefined") {
    window.sessionStorage.removeItem(refundLookupAccessStorageKey);
  }
}
