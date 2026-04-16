import { createContext, useContext, useMemo, useReducer } from "react";

const initialState = {
  draftId: null,
  orderId: null,
  paymentMethod: "widget",
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
