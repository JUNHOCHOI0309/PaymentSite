const test = require("node:test");
const assert = require("node:assert/strict");
const { isPaymentMaintenanceWindow } = require("../server/paymentMaintenance");

test("blocks new payments during the daily KST maintenance window", () => {
  assert.equal(isPaymentMaintenanceWindow(new Date("2026-08-06T14:49:00.000Z")), false);
  assert.equal(isPaymentMaintenanceWindow(new Date("2026-08-06T14:50:00.000Z")), true);
  assert.equal(isPaymentMaintenanceWindow(new Date("2026-08-06T15:00:00.000Z")), true);
  assert.equal(isPaymentMaintenanceWindow(new Date("2026-08-06T15:30:00.000Z")), true);
  assert.equal(isPaymentMaintenanceWindow(new Date("2026-08-06T15:31:00.000Z")), false);
});
