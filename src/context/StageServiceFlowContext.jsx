import { createContext, useContext, useEffect, useMemo, useReducer, useState } from "react";
import { stageServiceFlowSteps } from "../lib/stageServiceFlowAccess";

const STORAGE_KEY = "stage-service-flow-state";
const stageServicePaymentMethod = "payment";

const initialState = {
  draftId: null,
  orderId: null,
  flowStep: null,
  paymentMethod: stageServicePaymentMethod,
  serviceKey: "",
  applicantInfo: {
    name: "",
    phone: "",
    email: "",
  },
  formData: {
    photoHasAdditionalDiscipline: "X",
    photoAdditionalDiscipline: "",
    videoType: "",
    videoAdditionalDiscipline: "",
    hairParticipantDiscipline: "",
    hairOption: "",
    hairAdditionalDiscipline: "",
    hairOptionalOption: "",
  },
  linkedApplication: {
    applicationNumber: "",
    discipline: "",
  },
  totalAmount: 0,
};

function deriveFlowStep(nextState) {
  if (nextState?.flowStep) {
    return nextState.flowStep;
  }

  if (nextState?.orderId) {
    return stageServiceFlowSteps.CHECKOUT;
  }

  if (nextState?.draftId) {
    return stageServiceFlowSteps.REVIEW;
  }

  return null;
}

function normalizeStageServicePaymentMethod() {
  return stageServicePaymentMethod;
}

function stageServiceFlowReducer(state, action) {
  switch (action.type) {
    case "SET_SERVICE_KEY":
      return {
        ...state,
        serviceKey: action.value,
      };
    case "SET_APPLICANT_FIELD":
      return {
        ...state,
        applicantInfo: {
          ...state.applicantInfo,
          [action.field]: action.value,
        },
      };
    case "SET_FORM_FIELD":
      return {
        ...state,
        formData: {
          ...state.formData,
          [action.field]: action.value,
        },
      };
    case "SET_LINKED_APPLICATION":
      return {
        ...state,
        linkedApplication: action.value,
      };
    case "SET_TOTAL_AMOUNT":
      return {
        ...state,
        totalAmount: action.value,
      };
    case "SET_PAYMENT_METHOD":
      return {
        ...state,
        paymentMethod: normalizeStageServicePaymentMethod(action.value),
      };
    case "SET_DRAFT_ID":
      return {
        ...state,
        draftId: action.value,
      };
    case "SET_ORDER":
      return {
        ...state,
        orderId: action.payload.orderId,
      };
    case "SET_FLOW_STEP":
      return {
        ...state,
        flowStep: action.value,
      };
    case "HYDRATE_STAGE_SERVICE_FLOW": {
      const nextState = {
        ...state,
        ...action.payload,
        paymentMethod: normalizeStageServicePaymentMethod(action.payload?.paymentMethod),
        applicantInfo: {
          ...initialState.applicantInfo,
          ...(action.payload?.applicantInfo || {}),
        },
        formData: {
          ...initialState.formData,
          ...(action.payload?.formData || {}),
        },
        linkedApplication: {
          ...initialState.linkedApplication,
          ...(action.payload?.linkedApplication || {}),
        },
      };

      return {
        ...nextState,
        flowStep: deriveFlowStep(nextState),
      };
    }
    case "RESET_STAGE_SERVICE_FLOW":
      return initialState;
    default:
      return state;
  }
}

const StageServiceFlowContext = createContext(null);

export function StageServiceFlowProvider({ children }) {
  const [state, dispatch] = useReducer(stageServiceFlowReducer, initialState);
  const [isHydrated, setIsHydrated] = useState(false);
  const value = useMemo(() => ({ state, dispatch, isHydrated }), [state, isHydrated]);

  useEffect(() => {
    try {
      const savedState = window.sessionStorage.getItem(STORAGE_KEY);

      if (!savedState) {
        setIsHydrated(true);
        return;
      }

      dispatch({
        type: "HYDRATE_STAGE_SERVICE_FLOW",
        payload: JSON.parse(savedState),
      });
    } catch (error) {
      console.error("Failed to hydrate stage service flow state:", error);
    } finally {
      setIsHydrated(true);
    }
  }, []);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error("Failed to persist stage service flow state:", error);
    }
  }, [state]);

  return (
    <StageServiceFlowContext.Provider value={value}>
      {children}
    </StageServiceFlowContext.Provider>
  );
}

export function useStageServiceFlow() {
  const context = useContext(StageServiceFlowContext);

  if (!context) {
    throw new Error("useStageServiceFlow must be used within StageServiceFlowProvider");
  }

  return context;
}
