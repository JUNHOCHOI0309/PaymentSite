import { createContext, useContext, useEffect, useMemo, useReducer } from "react";

const STORAGE_KEY = "application-flow-state";

const initialState = {
  draftId: null,
  orderId: null,
  paymentMethod: "payment",
  applicantInfo: {
    name: "",
    phone: "",
    email: "",
    birthDate: "",
    organization: "",
  },
  uploadedFileMeta: {
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
  },
};

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
    case "TOGGLE_CONSENT":
      return {
        ...state,
        consents: {
          ...state.consents,
          [action.field]: action.value,
        },
      };
    case "SET_PAYMENT_METHOD":
      return {
        ...state,
        paymentMethod: action.value,
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
    case "HYDRATE_APPLICATION_FLOW":
      return {
        ...state,
        ...action.payload,
      };
    case "RESET_APPLICATION_FLOW":
      return initialState;
    default:
      return state;
  }
}

const ApplicationFlowContext = createContext(null);

export function ApplicationFlowProvider({ children }) {
  const [state, dispatch] = useReducer(applicationFlowReducer, initialState);
  const value = useMemo(() => ({ state, dispatch }), [state]);

  useEffect(() => {
    try {
      const savedState = window.sessionStorage.getItem(STORAGE_KEY);

      if (!savedState) {
        return;
      }

      dispatch({
        type: "HYDRATE_APPLICATION_FLOW",
        payload: JSON.parse(savedState),
      });
    } catch (error) {
      console.error("Failed to hydrate application flow state:", error);
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
