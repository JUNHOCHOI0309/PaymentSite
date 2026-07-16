import config from "./applicationEntryFeeConfig.json";

const defaultAmount = Number(config.defaultAmount || 0);
const listAmount = Number(config.listAmount || defaultAmount);
const additionalDisciplineAmount = Number(config.additionalDisciplineAmount || 0);
const entryFeeItems = Array.isArray(config.items) ? config.items : [];
const entryFeeSchedule = Array.isArray(config.schedule) ? config.schedule : [];
const entryFeeMap = new Map(
  entryFeeItems.map((item) => [item.imageKey, Number(item.amount || defaultAmount)]),
);

function getKoreaDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return `${values.year}-${values.month}-${values.day}`;
}

function getScheduleForDate(date) {
  const dateKey = getKoreaDateKey(date);

  return (
    entryFeeSchedule.find(
      (item) => dateKey >= item.startDate && dateKey <= item.endDate,
    ) || null
  );
}

export function getApplicationEntryFeePricing(imageKey, date = new Date()) {
  const itemAmount = entryFeeMap.get(imageKey) ?? defaultAmount;
  const schedule = getScheduleForDate(date);
  const scheduledAmount = Number(
    schedule?.disciplineAmounts?.[imageKey] ?? schedule?.amount ?? itemAmount,
  );
  const amount = Number.isFinite(scheduledAmount) && scheduledAmount > 0
    ? scheduledAmount
    : itemAmount;
  const originalAmount = Number(schedule?.displayOriginalAmount || 0);

  return {
    amount,
    originalAmount,
    isDiscounted: originalAmount > amount,
    periodId: schedule?.id || "standard",
    periodLabel: schedule?.label || "상시",
    periodLabelEn: schedule?.labelEn || "Standard",
  };
}

export function getApplicationEntryFee(imageKey) {
  return getApplicationEntryFeePricing(imageKey).amount;
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

export function getApplicationAdditionalDisciplineFee() {
  return additionalDisciplineAmount;
}

export function getApplicationEntryFeeSchedule() {
  return entryFeeSchedule;
}

export function getApplicationEntryFeeListAmount() {
  return listAmount;
}
