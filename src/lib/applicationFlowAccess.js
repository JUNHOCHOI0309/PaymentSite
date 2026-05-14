export const applicationFlowSteps = {
  CONSENT: "consent",
  REVIEW: "review",
  CHECKOUT: "checkout",
  COMPLETE: "complete",
};

const flowStepRank = {
  [applicationFlowSteps.CONSENT]: 1,
  [applicationFlowSteps.REVIEW]: 2,
  [applicationFlowSteps.CHECKOUT]: 3,
  [applicationFlowSteps.COMPLETE]: 4,
};

export function hasApplicationSelection(selection) {
  return Boolean(selection?.division && selection?.discipline && selection?.imageKey);
}

export function hasReachedFlowStep(currentStep, minimumStep) {
  return (flowStepRank[currentStep] || 0) >= (flowStepRank[minimumStep] || 0);
}
