function normalizeStatus(value) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function getRefundStatusBlock({ applicationStatus, serviceStatus, spectatorStatus }) {
  const normalizedApplicationStatus = normalizeStatus(applicationStatus);
  const normalizedServiceStatus = normalizeStatus(serviceStatus);
  const normalizedSpectatorStatus = normalizeStatus(spectatorStatus);

  if (normalizedServiceStatus && normalizedServiceStatus !== "PURCHASED") {
    return {
      reasonCode: "STAGE_SERVICE_STATUS_NOT_REFUNDABLE",
      message: "현재 무대 서비스 상태에서는 자동 환불을 처리할 수 없습니다.",
    };
  }

  if (normalizedSpectatorStatus && normalizedSpectatorStatus !== "READY") {
    return {
      reasonCode: "SPECTATOR_STATUS_NOT_REFUNDABLE",
      message: "현재 참관객 신청 상태에서는 자동 환불을 처리할 수 없습니다.",
    };
  }

  if (
    !normalizedServiceStatus &&
    !normalizedSpectatorStatus &&
    normalizedApplicationStatus &&
    normalizedApplicationStatus !== "SUBMITTED"
  ) {
    return {
      reasonCode: "APPLICATION_STATUS_NOT_REFUNDABLE",
      message: "현재 신청 상태에서는 자동 환불을 처리할 수 없습니다.",
    };
  }

  return null;
}

module.exports = { getRefundStatusBlock };
