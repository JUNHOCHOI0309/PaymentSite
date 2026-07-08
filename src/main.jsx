import ReactDOM from "react-dom/client";
import { Navigate, createBrowserRouter, Outlet, RouterProvider, useLocation } from "react-router-dom";
import "./App.css";
import { SiteFavicon } from "./components/layout/SiteFavicon";
import { ScrollToTop } from "./components/layout/ScrollToTop";
import { ApplicationFlowRouteGuard } from "./components/routing/ApplicationFlowRouteGuard";
import { StageServiceFlowRouteGuard } from "./components/routing/StageServiceFlowRouteGuard";
import { ApplicationFlowProvider } from "./context/ApplicationFlowContext";
import { LanguageProvider } from "./context/LanguageContext";
import { StageServiceFlowProvider } from "./context/StageServiceFlowContext";
import { applicationFlowSteps } from "./lib/applicationFlowAccess";
import { stageServiceFlowSteps } from "./lib/stageServiceFlowAccess";
import { ApplyCompletePage } from "./pages/ApplyCompletePage";
import { ApplyConsentPage } from "./pages/ApplyConsentPage";
import { ApplyGuidePage } from "./pages/ApplyGuidePage";
import { ApplyPage } from "./pages/ApplyPage";
import { ApplyReviewPage } from "./pages/ApplyReviewPage";
import { ApplySelectPage } from "./pages/ApplySelectPage";
import { StageServiceSelectPage } from "./pages/StageServiceSelectPage";
import { AdminDashboardPage } from "./pages/admin/AdminDashboardPage";
import { AdminLoginPage } from "./pages/admin/AdminLoginPage";
import { BrandpayCheckoutPage } from "./pages/brandpay/BrandpayCheckout";
import { CompetitionIntroPage, MmkIntroPage } from "./pages/CompetitionIntroPage";
import { FailPage } from "./pages/Fail";
import { HomePage } from "./pages/HomePage";
import {
  HallOfFamePage,
  OrganizationCommitteePage,
  OrganizationPage,
  SponsorsPage,
} from "./pages/InfoPages";
import { LookupPage } from "./pages/LookupPage";
import { StageServiceCompletePage } from "./pages/StageServiceCompletePage";
import { StageServiceDetailPage } from "./pages/StageServiceDetailPage";
import { StageServiceReviewPage } from "./pages/StageServiceReviewPage";
import { PaymentBillingPage } from "./pages/payment/PaymentBilling";
import { PaymentCheckoutPage } from "./pages/payment/PaymentCheckout";
import { PaymentSuccessPage } from "./pages/payment/PaymentSuccess";
import { BrandpaySuccessPage } from "./pages/brandpay/BrandpaySuccess";
import { PrivacyPage } from "./pages/PrivacyPage";
import { TermsPage } from "./pages/TermsPage";
import { StageServiceBrandpayCheckoutPage } from "./pages/stageService/StageServiceBrandpayCheckout";
import { StageServiceBrandpaySuccessPage } from "./pages/stageService/StageServiceBrandpaySuccess";
import { StageServicePaymentCheckoutPage } from "./pages/stageService/StageServicePaymentCheckout";
import { StageServicePaymentSuccessPage } from "./pages/stageService/StageServicePaymentSuccess";
import { StageServiceWidgetCheckoutPage } from "./pages/stageService/StageServiceWidgetCheckout";
import { StageServiceWidgetSuccessPage } from "./pages/stageService/StageServiceWidgetSuccess";
import { WidgetCheckoutPage } from "./pages/widget/WidgetCheckout";
import { WidgetSuccessPage } from "./pages/widget/WidgetSuccess";

const adminHosts = new Set(["admin.mmkorea.com", "mmkorea-admin.pages.dev"]);

function RootLayout() {
  const location = useLocation();
  const currentHost = window.location.hostname;
  const isAdminHost = adminHosts.has(currentHost);
  const isAdminPath = location.pathname === "/admin" || location.pathname.startsWith("/admin/");

  if (isAdminHost && !isAdminPath) {
    return <Navigate to="/admin/login" replace />;
  }

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
        path: "apply/stage-services",
        element: <StageServiceSelectPage />,
      },
      {
        path: "apply/stage-services/detail",
        element: <StageServiceDetailPage />,
      },
      {
        path: "apply/stage-services/review",
        element: (
          <StageServiceFlowRouteGuard
            minStep={stageServiceFlowSteps.REVIEW}
            requireDraftId
          >
            <StageServiceReviewPage />
          </StageServiceFlowRouteGuard>
        ),
      },
      {
        path: "apply/stage-services/complete",
        element: (
          <StageServiceFlowRouteGuard
            minStep={stageServiceFlowSteps.COMPLETE}
            requireDraftId
            requireOrderId
          >
            <StageServiceCompletePage />
          </StageServiceFlowRouteGuard>
        ),
      },
      {
        path: "apply/detail",
        element: <ApplyPage />,
      },
      {
        path: "apply/consent",
        element: (
          <ApplicationFlowRouteGuard
            minStep={applicationFlowSteps.CONSENT}
            requireDraftId
          >
            <ApplyConsentPage />
          </ApplicationFlowRouteGuard>
        ),
      },
      {
        path: "apply/guide",
        element: <ApplyGuidePage />,
      },
      {
        path: "apply/review",
        element: (
          <ApplicationFlowRouteGuard
            minStep={applicationFlowSteps.REVIEW}
            requireDraftId
          >
            <ApplyReviewPage />
          </ApplicationFlowRouteGuard>
        ),
      },
      {
        path: "apply/complete",
        element: (
          <ApplicationFlowRouteGuard
            minStep={applicationFlowSteps.COMPLETE}
            requireDraftId
            requireOrderId
          >
            <ApplyCompletePage />
          </ApplicationFlowRouteGuard>
        ),
      },
      {
        path: "competition-intro",
        element: <CompetitionIntroPage />,
      },
      {
        path: "organization",
        element: <OrganizationPage />,
      },
      {
        path: "organization-committee",
        element: <OrganizationCommitteePage />,
      },
      {
        path: "hall-of-fame",
        element: <HallOfFamePage />,
      },
      {
        path: "sponsors",
        element: <SponsorsPage />,
      },
      {
        path: "admin/login",
        element: <AdminLoginPage />,
      },
      {
        path: "admin",
        element: <AdminDashboardPage />,
      },
      {
        path: "mmk-intro",
        element: <MmkIntroPage />,
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
            element: (
              <ApplicationFlowRouteGuard
                minStep={applicationFlowSteps.CHECKOUT}
                requireDraftId
                requireOrderId
                requirePaymentMethod="widget"
              >
                <WidgetCheckoutPage />
              </ApplicationFlowRouteGuard>
            ),
          },
          {
            path: "success",
            element: (
              <ApplicationFlowRouteGuard
                minStep={applicationFlowSteps.CHECKOUT}
                requireDraftId
                requireOrderId
                requirePaymentMethod="widget"
                requireSearchParams={["orderId", "amount", "paymentKey"]}
              >
                <WidgetSuccessPage />
              </ApplicationFlowRouteGuard>
            ),
          },
        ],
      },
      {
        path: "stage-services/widget",
        children: [
          {
            path: "checkout",
            element: (
              <StageServiceFlowRouteGuard
                minStep={stageServiceFlowSteps.CHECKOUT}
                requireDraftId
                requireOrderId
                requirePaymentMethod="widget"
              >
                <StageServiceWidgetCheckoutPage />
              </StageServiceFlowRouteGuard>
            ),
          },
          {
            path: "success",
            element: (
              <StageServiceFlowRouteGuard
                minStep={stageServiceFlowSteps.CHECKOUT}
                requireDraftId
                requireOrderId
                requirePaymentMethod="widget"
                requireSearchParams={["orderId", "amount", "paymentKey"]}
              >
                <StageServiceWidgetSuccessPage />
              </StageServiceFlowRouteGuard>
            ),
          },
        ],
      },
      {
        path: "checkout",
        element: (
          <ApplicationFlowRouteGuard
            minStep={applicationFlowSteps.CHECKOUT}
            requireDraftId
            requireOrderId
            requirePaymentMethod="widget"
          >
            <WidgetCheckoutPage />
          </ApplicationFlowRouteGuard>
        ),
      },
      {
        path: "brandpay",
        children: [
          {
            path: "checkout",
            element: (
              <ApplicationFlowRouteGuard
                minStep={applicationFlowSteps.CHECKOUT}
                requireDraftId
                requireOrderId
                requirePaymentMethod="brandpay"
              >
                <BrandpayCheckoutPage />
              </ApplicationFlowRouteGuard>
            ),
          },
          {
            path: "success",
            element: (
              <ApplicationFlowRouteGuard
                minStep={applicationFlowSteps.CHECKOUT}
                requireDraftId
                requireOrderId
                requirePaymentMethod="brandpay"
                requireSearchParams={["orderId", "amount", "paymentKey", "customerKey"]}
              >
                <BrandpaySuccessPage />
              </ApplicationFlowRouteGuard>
            ),
          },
        ],
      },
      {
        path: "stage-services/brandpay",
        children: [
          {
            path: "checkout",
            element: (
              <StageServiceFlowRouteGuard
                minStep={stageServiceFlowSteps.CHECKOUT}
                requireDraftId
                requireOrderId
                requirePaymentMethod="brandpay"
              >
                <StageServiceBrandpayCheckoutPage />
              </StageServiceFlowRouteGuard>
            ),
          },
          {
            path: "success",
            element: (
              <StageServiceFlowRouteGuard
                minStep={stageServiceFlowSteps.CHECKOUT}
                requireDraftId
                requireOrderId
                requirePaymentMethod="brandpay"
                requireSearchParams={["orderId", "amount", "paymentKey", "customerKey"]}
              >
                <StageServiceBrandpaySuccessPage />
              </StageServiceFlowRouteGuard>
            ),
          },
        ],
      },
      {
        path: "payment",
        children: [
          {
            path: "checkout",
            element: (
              <ApplicationFlowRouteGuard
                minStep={applicationFlowSteps.CHECKOUT}
                requireDraftId
                requireOrderId
                requirePaymentMethod="payment"
              >
                <PaymentCheckoutPage />
              </ApplicationFlowRouteGuard>
            ),
          },
          {
            path: "billing",
            element: <PaymentBillingPage />,
          },
          {
            path: "success",
            element: (
              <ApplicationFlowRouteGuard
                minStep={applicationFlowSteps.CHECKOUT}
                requireDraftId
                requireOrderId
                requirePaymentMethod="payment"
                requireSearchParams={["orderId", "amount", "paymentKey"]}
              >
                <PaymentSuccessPage />
              </ApplicationFlowRouteGuard>
            ),
          },
        ],
      },
      {
        path: "stage-services/payment",
        children: [
          {
            path: "checkout",
            element: (
              <StageServiceFlowRouteGuard
                minStep={stageServiceFlowSteps.CHECKOUT}
                requireDraftId
                requireOrderId
                requirePaymentMethod="payment"
              >
                <StageServicePaymentCheckoutPage />
              </StageServiceFlowRouteGuard>
            ),
          },
          {
            path: "success",
            element: (
              <StageServiceFlowRouteGuard
                minStep={stageServiceFlowSteps.CHECKOUT}
                requireDraftId
                requireOrderId
                requirePaymentMethod="payment"
                requireSearchParams={["orderId", "amount", "paymentKey"]}
              >
                <StageServicePaymentSuccessPage />
              </StageServiceFlowRouteGuard>
            ),
          },
        ],
      },
      {
        path: "stage-services/fail",
        element: <FailPage />,
      },
      {
        path: "fail",
        element: (
          <ApplicationFlowRouteGuard
            minStep={applicationFlowSteps.CHECKOUT}
            requireDraftId
            requireOrderId
          >
            <FailPage />
          </ApplicationFlowRouteGuard>
        ),
      },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root")).render(
  <LanguageProvider>
    <ApplicationFlowProvider>
      <StageServiceFlowProvider>
        <RouterProvider router={router} />
      </StageServiceFlowProvider>
    </ApplicationFlowProvider>
  </LanguageProvider>,
);
