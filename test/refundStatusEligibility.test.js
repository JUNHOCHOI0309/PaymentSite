const test = require("node:test");
const assert = require("node:assert/strict");
const { getRefundStatusBlock } = require("../server/refundStatusEligibility");

test("allows a paid spectator ticket in READY admission status", () => {
  assert.equal(getRefundStatusBlock({ spectatorStatus: "READY" }), null);
});

test("blocks spectator tickets that are no longer ready for admission", () => {
  assert.deepEqual(getRefundStatusBlock({ spectatorStatus: "REFUNDED" }), {
    reasonCode: "SPECTATOR_STATUS_NOT_REFUNDABLE",
    message: "현재 참관객 신청 상태에서는 자동 환불을 처리할 수 없습니다.",
  });
});

test("preserves application and stage-service refund status rules", () => {
  assert.equal(getRefundStatusBlock({ applicationStatus: "SUBMITTED" }), null);
  assert.equal(getRefundStatusBlock({ serviceStatus: "PURCHASED" }), null);
  assert.equal(
    getRefundStatusBlock({ applicationStatus: "CANCELED" }).reasonCode,
    "APPLICATION_STATUS_NOT_REFUNDABLE"
  );
  assert.equal(
    getRefundStatusBlock({ serviceStatus: "REFUNDED" }).reasonCode,
    "STAGE_SERVICE_STATUS_NOT_REFUNDABLE"
  );
});
