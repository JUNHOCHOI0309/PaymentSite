const paymentMaintenance = require("../src/data/paymentMaintenance.json");

function parseTimeToMinutes(value) {
  const [hour, minute] = String(value || "").split(":").map(Number);

  if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
    throw new Error(`Invalid payment maintenance time: ${value}`);
  }

  return hour * 60 + minute;
}

function getZonedMinutes(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);

  return hour * 60 + minute;
}

function isPaymentMaintenanceWindow(date = new Date()) {
  const currentMinutes = getZonedMinutes(date, paymentMaintenance.timeZone);
  const startMinutes = parseTimeToMinutes(paymentMaintenance.start);
  const endMinutes = parseTimeToMinutes(paymentMaintenance.end);

  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  }

  return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
}

function getPaymentMaintenanceMessage() {
  return `매일 ${paymentMaintenance.start}~${paymentMaintenance.end}에는 카드사 점검으로 결제를 이용할 수 없습니다. ${paymentMaintenance.resume} 이후 다시 시도해 주세요.`;
}

module.exports = {
  getPaymentMaintenanceMessage,
  isPaymentMaintenanceWindow,
  paymentMaintenance,
};
