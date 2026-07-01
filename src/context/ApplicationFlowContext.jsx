import { createContext, useContext, useEffect, useMemo, useReducer, useState } from "react";
import { applicationFlowSteps } from "../lib/applicationFlowAccess";

const STORAGE_KEY = "application-flow-state";
const requiredConsentKeys = ["privacy", "terms", "refund"];

const initialState = {
  draftId: null,
  orderId: null,
  flowStep: null,
  paymentMethod: "payment",
  selection: {
    division: "",
    discipline: "",
    imageKey: "",
  },
  applicantInfo: {
    name: "",
    phone: "",
    email: "",
    birthDate: "",
    organization: "",
    instagramId: "",
    introduction: "",
    weightClass: "",
  },
  uploadedFileMeta: {
    originalFilename: "",
    storedFilename: "",
    mimeType: "",
    fileSize: 0,
  },
  uploadedAudioFileMeta: {
    originalFilename: "",
    storedFilename: "",
    mimeType: "",
    fileSize: 0,
  },
  consents: {
    privacy: false,
    terms: false,
    refund: false,
    marketing: false,
    photoVideo: false,
  },
};

function deriveFlowStep(nextState) {
  if (nextState?.flowStep) {
    return nextState.flowStep;
  }

  if (nextState?.orderId) {
    return applicationFlowSteps.CHECKOUT;
  }

  if (!nextState?.draftId) {
    return null;
  }

  const hasRequiredConsents = requiredConsentKeys.every(
    (key) => nextState?.consents?.[key],
  );

  return hasRequiredConsents
    ? applicationFlowSteps.REVIEW
    : applicationFlowSteps.CONSENT;
}

function applicationFlowReducer(state, action) {
  switch (action.type) {
    case "SET_APPLICANT_FIELD":
      return {
        ...state,
        applicantInfo: {
          ...state.applicantInfo,
          [action.field]: action.value,
        },
      };
    case "SET_FILE_META":
      return {
        ...state,
        uploadedFileMeta: action.payload,
      };
    case "SET_AUDIO_FILE_META":
      return {
        ...state,
        uploadedAudioFileMeta: action.payload,
      };
    case "TOGGLE_CONSENT":
      return {
        ...state,
        consents: {
          ...state.consents,
          [action.field]: action.value,
        },
      };
    case "SET_ALL_CONSENTS":
      return {
        ...state,
        consents: {
          ...state.consents,
          ...action.payload,
        },
      };
    case "SET_PAYMENT_METHOD":
      return {
        ...state,
        paymentMethod: action.value,
      };
    case "SET_SELECTION":
      return {
        ...state,
        selection: action.value,
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
    case "HYDRATE_APPLICATION_FLOW": {
      const nextState = {
        ...state,
        ...action.payload,
        applicantInfo: {
          ...initialState.applicantInfo,
          ...(action.payload?.applicantInfo || {}),
        },
        uploadedFileMeta: {
          ...initialState.uploadedFileMeta,
          ...(action.payload?.uploadedFileMeta || {}),
        },
        uploadedAudioFileMeta: {
          ...initialState.uploadedAudioFileMeta,
          ...(action.payload?.uploadedAudioFileMeta || {}),
        },
        selection: {
          ...initialState.selection,
          ...(action.payload?.selection || {}),
        },
        consents: {
          ...initialState.consents,
          ...(action.payload?.consents || {}),
        },
      };
      return {
        ...nextState,
        flowStep: deriveFlowStep(nextState),
      };
    }
    case "RESET_APPLICATION_FLOW":
      return initialState;
    default:
      return state;
  }
}

const ApplicationFlowContext = createContext(null);

export function ApplicationFlowProvider({ children }) {
  const [state, dispatch] = useReducer(applicationFlowReducer, initialState);
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
        type: "HYDRATE_APPLICATION_FLOW",
        payload: JSON.parse(savedState),
      });
    } catch (error) {
      console.error("Failed to hydrate application flow state:", error);
    } finally {
      setIsHydrated(true);
    }
  }, []);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error("Failed to persist application flow state:", error);
    }
  }, [state]);

  return (
    <ApplicationFlowContext.Provider value={value}>
      {children}
    </ApplicationFlowContext.Provider>
  );
}

export function useApplicationFlow() {
  const context = useContext(ApplicationFlowContext);

  if (!context) {
    throw new Error("useApplicationFlow must be used within ApplicationFlowProvider");
  }

  return context;
}
