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
    hairBodyMakeup: false,
    hairPiece: false,
    hairRetouchCount: "0",
    hairOptionalOption: "",
  },
  linkedApplication: {
    applicationNumber: "",
    discipline: "",
  },
  linkedApplications: [],
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

function getLegacyHairAddOnFields(formData = {}) {
  if (
    Object.hasOwn(formData, "hairBodyMakeup")
    || Object.hasOwn(formData, "hairPiece")
    || Object.hasOwn(formData, "hairRetouchCount")
  ) {
    return {};
  }

  return {
    hairBodyMakeup: formData.hairOptionalOption === "BODY_MAKEUP",
    hairPiece: formData.hairOptionalOption === "HAIR_PIECE",
    hairRetouchCount:
      formData.hairOptionalOption === "MALE_RETOUCH" || formData.hairOptionalOption === "FEMALE_RETOUCH"
        ? "1"
        : "0",
  };
}

function normalizeLinkedApplications(applications, fallbackApplication = null) {
  const normalizedApplications = Array.isArray(applications)
    ? applications
      .map((application) => ({
        applicationNumber: String(application?.applicationNumber || "").trim(),
        discipline: String(application?.discipline || "").trim(),
      }))
      .filter((application) => application.applicationNumber)
    : [];

  if (normalizedApplications.length) {
    return normalizedApplications.slice(0, 3);
  }

  const fallbackApplicationNumber = String(fallbackApplication?.applicationNumber || "").trim();

  return fallbackApplicationNumber
    ? [{ applicationNumber: fallbackApplicationNumber, discipline: String(fallbackApplication?.discipline || "").trim() }]
    : [];
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
      {
        const linkedApplication = {
          applicationNumber: String(action.value?.applicationNumber || "").trim(),
          discipline: String(action.value?.discipline || "").trim(),
        };

        return {
          ...state,
          linkedApplication,
          linkedApplications: linkedApplication.applicationNumber ? [linkedApplication] : [],
        };
      }
    case "SET_LINKED_APPLICATIONS": {
      const linkedApplications = normalizeLinkedApplications(action.value);

      return {
        ...state,
        linkedApplications,
        linkedApplication: linkedApplications[0] || initialState.linkedApplication,
      };
    }
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
      const persistedFormData = action.payload?.formData || {};
      const persistedLinkedApplication = {
        ...initialState.linkedApplication,
        ...(action.payload?.linkedApplication || {}),
      };
      const persistedLinkedApplications = normalizeLinkedApplications(
        action.payload?.linkedApplications,
        persistedLinkedApplication,
      );
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
          ...persistedFormData,
          ...getLegacyHairAddOnFields(persistedFormData),
        },
        linkedApplications: persistedLinkedApplications,
        linkedApplication: persistedLinkedApplications[0] || initialState.linkedApplication,
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
