import config from "./applicationEntryFeeConfig.json";

const defaultAmount = Number(config.defaultAmount || 0);
const entryFeeItems = Array.isArray(config.items) ? config.items : [];
const entryFeeMap = new Map(
  entryFeeItems.map((item) => [item.imageKey, Number(item.amount || defaultAmount)]),
);

export function getApplicationEntryFee(imageKey) {
  if (!imageKey) {
    return defaultAmount;
  }

  return entryFeeMap.get(imageKey) ?? defaultAmount;
}

export function formatApplicationEntryFee(value, locale = "ko") {
  return new Intl.NumberFormat(locale === "ko" ? "ko-KR" : "en-US", {
    style: "currency",
    currency: "KRW",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

export function getApplicationEntryFeeItems() {
  return entryFeeItems;
}
