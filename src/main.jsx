import ReactDOM from "react-dom/client";
import { createBrowserRouter, Outlet, RouterProvider } from "react-router-dom";
import "./App.css";
import { SiteFavicon } from "./components/layout/SiteFavicon";
import { ScrollToTop } from "./components/layout/ScrollToTop";
import { ApplicationFlowProvider } from "./context/ApplicationFlowContext";
import { ApplyCompletePage } from "./pages/ApplyCompletePage";
import { ApplyPage } from "./pages/ApplyPage";
import { ApplyReviewPage } from "./pages/ApplyReviewPage";
import { ApplySelectPage } from "./pages/ApplySelectPage";
import { BrandpayCheckoutPage } from "./pages/brandpay/BrandpayCheckout";
import { CompetitionIntroPage, MmaIntroPage } from "./pages/CompetitionIntroPage";
import { FailPage } from "./pages/Fail";
import { HomePage } from "./pages/HomePage";
import { LookupPage } from "./pages/LookupPage";
import { PaymentBillingPage } from "./pages/payment/PaymentBilling";
import { PaymentCheckoutPage } from "./pages/payment/PaymentCheckout";
import { PaymentSuccessPage } from "./pages/payment/PaymentSuccess";
import { BrandpaySuccessPage } from "./pages/brandpay/BrandpaySuccess";
import { PrivacyPage } from "./pages/PrivacyPage";
import { TermsPage } from "./pages/TermsPage";
import { WidgetCheckoutPage } from "./pages/widget/WidgetCheckout";
import { WidgetSuccessPage } from "./pages/widget/WidgetSuccess";

function RootLayout() {
  return (
    <>
      <SiteFavicon />
      <ScrollToTop />
      <Outlet />
    </>
  );
}

const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    children: [
      {
        index: true,
        element: <HomePage />,
      },
      {
        path: "apply",
        element: <ApplySelectPage />,
      },
      {
        path: "apply/detail",
        element: <ApplyPage />,
      },
      {
        path: "apply/review",
        element: <ApplyReviewPage />,
      },
      {
        path: "apply/complete",
        element: <ApplyCompletePage />,
      },
      {
        path: "competition-intro",
        element: <CompetitionIntroPage />,
      },
      {
        path: "mma-intro",
        element: <MmaIntroPage />,
      },
      {
        path: "lookup",
        element: <LookupPage />,
      },
      {
        path: "privacy",
        element: <PrivacyPage />,
      },
      {
        path: "terms",
        element: <TermsPage />,
      },
      {
        path: "widget",
        children: [
          {
            path: "checkout",
            element: <WidgetCheckoutPage />,
          },
          {
            path: "success",
            element: <WidgetSuccessPage />,
          },
        ],
      },
      {
        path: "checkout",
        element: <WidgetCheckoutPage />,
      },
      {
        path: "brandpay",
        children: [
          {
            path: "checkout",
            element: <BrandpayCheckoutPage />,
          },
          {
            path: "success",
            element: <BrandpaySuccessPage />,
          },
        ],
      },
      {
        path: "payment",
        children: [
          {
            path: "checkout",
            element: <PaymentCheckoutPage />,
          },
          {
            path: "billing",
            element: <PaymentBillingPage />,
          },
          {
            path: "success",
            element: <PaymentSuccessPage />,
          },
        ],
      },
      {
        path: "fail",
        element: <FailPage />,
      },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root")).render(
  <ApplicationFlowProvider>
    <RouterProvider router={router} />
  </ApplicationFlowProvider>,
);
