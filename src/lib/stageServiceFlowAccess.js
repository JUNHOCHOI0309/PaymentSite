export const stageServiceFlowSteps = {
  REVIEW: "review",
  CHECKOUT: "checkout",
  COMPLETE: "complete",
};

const flowStepRank = {
  [stageServiceFlowSteps.REVIEW]: 1,
  [stageServiceFlowSteps.CHECKOUT]: 2,
  [stageServiceFlowSteps.COMPLETE]: 3,
};

export function hasStageServiceSelection(serviceKey) {
  return Boolean(serviceKey);
}

export function hasReachedStageServiceFlowStep(currentStep, minimumStep) {
  return (flowStepRank[currentStep] || 0) >= (flowStepRank[minimumStep] || 0);
}
