import { createContext, useContext, useEffect, useMemo, useReducer, useState } from "react";

const STORAGE_KEY = "mmkorea-spectator-flow";

export const spectatorFlowSteps = {
  CONSENT: "consent",
  REVIEW: "review",
  CHECKOUT: "checkout",
  COMPLETE: "complete",
};

const stepRank = {
  [spectatorFlowSteps.CONSENT]: 1,
  [spectatorFlowSteps.REVIEW]: 2,
  [spectatorFlowSteps.CHECKOUT]: 3,
  [spectatorFlowSteps.COMPLETE]: 4,
};

const initialState = {
  applicant: { name: "", phone: "", email: "" },
  consents: { privacy: false, refund: false, marketing: false, photoVideo: false },
  draftId: "",
  orderId: "",
  flowStep: "",
  amount: 15000,
};

function spectatorFlowReducer(state, action) {
  switch (action.type) {
    case "HYDRATE":
      return {
        ...initialState,
        ...action.payload,
        applicant: { ...initialState.applicant, ...(action.payload?.applicant || {}) },
        consents: { ...initialState.consents, ...(action.payload?.consents || {}) },
      };
    case "SET_APPLICANT":
      return { ...state, applicant: { ...state.applicant, ...action.payload } };
    case "SET_CONSENTS":
      return { ...state, consents: { ...state.consents, ...action.payload } };
    case "SET_DRAFT":
      return { ...state, draftId: action.payload.draftId, amount: action.payload.amount || 15000 };
    case "SET_ORDER":
      return { ...state, orderId: action.payload.orderId };
    case "SET_FLOW_STEP":
      return { ...state, flowStep: action.value };
    case "RESET":
      return initialState;
    default:
      return state;
  }
}

const SpectatorFlowContext = createContext(null);

export function hasReachedSpectatorFlowStep(currentStep, minimumStep) {
  return (stepRank[currentStep] || 0) >= (stepRank[minimumStep] || 0);
}

export function SpectatorFlowProvider({ children }) {
  const [state, dispatch] = useReducer(spectatorFlowReducer, initialState);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    try {
      const savedState = window.sessionStorage.getItem(STORAGE_KEY);
      if (savedState) {
        dispatch({ type: "HYDRATE", payload: JSON.parse(savedState) });
      }
    } catch (error) {
      console.error("Failed to hydrate spectator flow state:", error);
    } finally {
      setIsHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [isHydrated, state]);

  const value = useMemo(() => ({ state, dispatch, isHydrated }), [state, isHydrated]);

  return <SpectatorFlowContext.Provider value={value}>{children}</SpectatorFlowContext.Provider>;
}

export function useSpectatorFlow() {
  const context = useContext(SpectatorFlowContext);
  if (!context) throw new Error("useSpectatorFlow must be used within SpectatorFlowProvider");
  return context;
}
