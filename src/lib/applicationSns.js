const snsPlatforms = [
  {
    value: "none",
    labels: {
      ko: "없음",
      en: "None",
    },
  },
  {
    value: "instagram",
    labels: {
      ko: "인스타그램",
      en: "Instagram",
    },
  },
  {
    value: "tiktok",
    labels: {
      ko: "틱톡",
      en: "TikTok",
    },
  },
  {
    value: "facebook",
    labels: {
      ko: "페이스북",
      en: "Facebook",
    },
  },
  {
    value: "x",
    labels: {
      ko: "X/트위터",
      en: "X/Twitter",
    },
  },
  {
    value: "threads",
    labels: {
      ko: "스레드",
      en: "Threads",
    },
  },
  {
    value: "other",
    labels: {
      ko: "기타",
      en: "Other",
    },
  },
];

const serializedSeparator = "::";
const defaultSnsPlatform = "";
const fallbackSnsPlatform = "instagram";

function normalizeLocale(locale) {
  return locale === "en" ? "en" : "ko";
}

function decodeStoredValue(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function findSnsPlatform(value) {
  return snsPlatforms.find((item) => item.value === value)
    || snsPlatforms.find((item) => item.value === fallbackSnsPlatform)
    || snsPlatforms[0];
}

export function getDefaultSnsPlatform() {
  return defaultSnsPlatform;
}

export function getSnsPlatformOptions(locale = "ko") {
  const normalizedLocale = normalizeLocale(locale);

  return snsPlatforms.map((item) => ({
    value: item.value,
    label: item.labels[normalizedLocale],
  }));
}

export function getSnsPlatformLabel(value, locale = "ko") {
  const normalizedLocale = normalizeLocale(locale);
  return findSnsPlatform(value).labels[normalizedLocale];
}

export function serializeSnsIdentity({ platform, id }) {
  if (!platform || platform === "none") {
    return "없음";
  }

  const normalizedId = String(id || "").trim();

  if (!normalizedId) {
    return "없음";
  }

  return `${findSnsPlatform(platform).value}${serializedSeparator}${encodeURIComponent(normalizedId)}`;
}

export function serializeDetailedSnsIdentity({ platform, customPlatform, id }) {
  if (!platform || platform === "none") {
    return "없음";
  }

  const normalizedId = String(id || "").trim();

  if (!normalizedId) {
    return "없음";
  }

  if (platform === "other") {
    const normalizedCustomPlatform = String(customPlatform || "").trim();

    if (!normalizedCustomPlatform) {
      return "없음";
    }

    return [
      "other",
      encodeURIComponent(normalizedCustomPlatform),
      encodeURIComponent(normalizedId),
    ].join(serializedSeparator);
  }

  return serializeSnsIdentity({ platform, id: normalizedId });
}

export function parseStoredSnsIdentity(value) {
  const normalizedValue = String(value || "").trim();

  if (
    !normalizedValue ||
    normalizedValue === "없음" ||
    normalizedValue.toLowerCase() === "none"
  ) {
    return {
      platform: "none",
      customPlatform: "",
      id: "",
    };
  }

  if (normalizedValue.includes(serializedSeparator)) {
    const [platform, ...rest] = normalizedValue.split(serializedSeparator);

    if (platform === "other" && rest.length >= 2) {
      return {
        platform: "other",
        customPlatform: decodeStoredValue(rest[0] || ""),
        id: decodeStoredValue(rest.slice(1).join(serializedSeparator).trim()),
      };
    }

    return {
      platform: findSnsPlatform(platform).value,
      customPlatform: "",
      id: decodeStoredValue(rest.join(serializedSeparator).trim()),
    };
  }

  const slashMatch = normalizedValue.match(/^(.+?)\s*\/\s*(.+)$/);

  if (slashMatch) {
    const [, possibleLabel, id] = slashMatch;
    const matchedPlatform = snsPlatforms.find((item) =>
      Object.values(item.labels).includes(possibleLabel.trim()),
    );

    if (matchedPlatform) {
      return {
        platform: matchedPlatform.value,
        customPlatform: "",
        id: id.trim(),
      };
    }
  }

  return {
    platform: fallbackSnsPlatform,
    customPlatform: "",
    id: normalizedValue,
  };
}

export function formatStoredSnsIdentity(value, locale = "ko", emptyLabel = "") {
  const parsed = parseStoredSnsIdentity(value);

  if (!parsed.id) {
    return emptyLabel;
  }

  if (parsed.platform === "other" && parsed.customPlatform) {
    return `${getSnsPlatformLabel(parsed.platform, locale)}(${parsed.customPlatform}) / ${parsed.id}`;
  }

  return `${getSnsPlatformLabel(parsed.platform, locale)} / ${parsed.id}`;
}
