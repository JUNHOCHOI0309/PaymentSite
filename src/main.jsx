import ReactDOM from "react-dom/client";
import { Navigate, createBrowserRouter, Outlet, RouterProvider, useLocation } from "react-router-dom";
import "./App.css";
import { SiteFavicon } from "./components/layout/SiteFavicon";
import { ScrollToTop } from "./components/layout/ScrollToTop";
import { ApplicationFlowRouteGuard } from "./components/routing/ApplicationFlowRouteGuard";
import { StageServiceFlowRouteGuard } from "./components/routing/StageServiceFlowRouteGuard";
import { SpectatorFlowRouteGuard } from "./components/routing/SpectatorFlowRouteGuard";
import { ApplicationFlowProvider } from "./context/ApplicationFlowContext";
import { LanguageProvider } from "./context/LanguageContext";
import { StageServiceFlowProvider } from "./context/StageServiceFlowContext";
import { SpectatorFlowProvider, spectatorFlowSteps } from "./context/SpectatorFlowContext";
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
import { CompetitionIntroPage, MmkIntroPage } from "./pages/CompetitionIntroPage";
import { FailPage } from "./pages/Fail";
import { HomePage } from "./pages/HomePage";
import {
  KcpTestPaymentFailPage,
  KcpTestPaymentPage,
  KcpTestPaymentSuccessPage,
} from "./pages/KcpTestPaymentPage";
import {
  KcpTestStageServiceFailPage,
  KcpTestStageServicePage,
  KcpTestStageServiceSuccessPage,
} from "./pages/KcpTestStageServicePage";
import {
  KcpTestSpectatorFailPage,
  KcpTestSpectatorPage,
  KcpTestSpectatorSuccessPage,
} from "./pages/KcpTestSpectatorPage";
import {
  HallOfFamePage,
  OrganizationCommitteePage,
  OrganizationPage,
} from "./pages/InfoPages";
import { LookupPage } from "./pages/LookupPage";
import { StageServiceCompletePage } from "./pages/StageServiceCompletePage";
import { StageServiceDetailPage } from "./pages/StageServiceDetailPage";
import { StageServiceReviewPage } from "./pages/StageServiceReviewPage";
import { PaymentCheckoutPage } from "./pages/payment/PaymentCheckout";
import { PaymentSuccessPage } from "./pages/payment/PaymentSuccess";
import { PrivacyPage } from "./pages/PrivacyPage";
import { RefundCompletePage } from "./pages/RefundCompletePage";
import { RefundRequestPage } from "./pages/RefundRequestPage";
import { TermsPage } from "./pages/TermsPage";
import { StageServicePaymentCheckoutPage } from "./pages/stageService/StageServicePaymentCheckout";
import { StageServicePaymentSuccessPage } from "./pages/stageService/StageServicePaymentSuccess";
import { SpectatorApplyPage } from "./pages/SpectatorApplyPage";
import { SpectatorCompletePage } from "./pages/SpectatorCompletePage";
import { SpectatorConsentPage } from "./pages/SpectatorConsentPage";
import { SpectatorReviewPage } from "./pages/SpectatorReviewPage";
import { SpectatorPaymentCheckoutPage } from "./pages/spectator/SpectatorPaymentCheckout";
import { SpectatorPaymentSuccessPage } from "./pages/spectator/SpectatorPaymentSuccess";

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
        path: "apply/spectator",
        element: <SpectatorApplyPage />,
      },
      {
        path: "apply/spectator/consent",
        element: <SpectatorFlowRouteGuard minStep={spectatorFlowSteps.CONSENT} requireDraftId><SpectatorConsentPage /></SpectatorFlowRouteGuard>,
      },
      {
        path: "apply/spectator/review",
        element: <SpectatorFlowRouteGuard minStep={spectatorFlowSteps.REVIEW} requireDraftId><SpectatorReviewPage /></SpectatorFlowRouteGuard>,
      },
      {
        path: "apply/spectator/complete",
        element: <SpectatorFlowRouteGuard minStep={spectatorFlowSteps.COMPLETE} requireDraftId requireOrderId><SpectatorCompletePage /></SpectatorFlowRouteGuard>,
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
        path: "refund/request",
        element: <RefundRequestPage />,
      },
      {
        path: "refund/complete",
        element: <RefundCompletePage />,
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
        path: "kcp-test",
        element: <KcpTestPaymentPage />,
      },
      {
        path: "kcp-test/success",
        element: <KcpTestPaymentSuccessPage />,
      },
      {
        path: "kcp-test/fail",
        element: <KcpTestPaymentFailPage />,
      },
      {
        path: "kcp-test/stage-services",
        element: <KcpTestStageServicePage />,
      },
      {
        path: "kcp-test/stage-services/success",
        element: <KcpTestStageServiceSuccessPage />,
      },
      {
        path: "kcp-test/stage-services/fail",
        element: <KcpTestStageServiceFailPage />,
      },
      {
        path: "kcp-test/spectators",
        element: <KcpTestSpectatorPage />,
      },
      {
        path: "kcp-test/spectators/success",
        element: <KcpTestSpectatorSuccessPage />,
      },
      {
        path: "kcp-test/spectators/fail",
        element: <KcpTestSpectatorFailPage />,
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
        path: "spectators/payment/checkout",
        element: <SpectatorFlowRouteGuard minStep={spectatorFlowSteps.CHECKOUT} requireDraftId requireOrderId><SpectatorPaymentCheckoutPage /></SpectatorFlowRouteGuard>,
      },
      {
        path: "spectators/payment/success",
        element: <SpectatorFlowRouteGuard minStep={spectatorFlowSteps.CHECKOUT} requireDraftId requireOrderId requireSearchParams={["orderId", "amount", "paymentKey"]}><SpectatorPaymentSuccessPage /></SpectatorFlowRouteGuard>,
      },
      {
        path: "spectators/fail",
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
        <SpectatorFlowProvider>
          <RouterProvider router={router} />
        </SpectatorFlowProvider>
      </StageServiceFlowProvider>
    </ApplicationFlowProvider>
  </LanguageProvider>,
);
