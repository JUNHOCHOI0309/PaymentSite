export const presetEmailDomains = ["naver.com", "gmail.com", "daum.net", "nate.com"];
export const directEmailDomainValue = "direct";

export function parseEmailAddress(value) {
  const normalizedValue = String(value || "").trim();
  const atIndex = normalizedValue.lastIndexOf("@");

  if (atIndex < 0) {
    return {
      localPart: normalizedValue,
      domainSelection: "",
      customDomain: "",
    };
  }

  const localPart = normalizedValue.slice(0, atIndex);
  const domain = normalizedValue.slice(atIndex + 1).toLowerCase();
  const isPresetDomain = presetEmailDomains.includes(domain);

  return {
    localPart,
    domainSelection: isPresetDomain ? domain : directEmailDomainValue,
    customDomain: isPresetDomain ? "" : domain,
  };
}

export function createEmailAddress({ localPart, domainSelection, customDomain }) {
  const normalizedLocalPart = String(localPart || "").replace(/[\s@]/g, "");
  const normalizedDomain =
    domainSelection === directEmailDomainValue
      ? String(customDomain || "").trim().replace(/[\s@]/g, "").toLowerCase()
      : String(domainSelection || "").trim().toLowerCase();

  if (!normalizedLocalPart) {
    return "";
  }

  return normalizedDomain ? `${normalizedLocalPart}@${normalizedDomain}` : normalizedLocalPart;
}
