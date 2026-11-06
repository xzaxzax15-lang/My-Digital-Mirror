import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Spinner } from "./components/ui";
import { HomePage } from "./pages/Home";
import { AssistantPage } from "./pages/Assistant";
import { AcademyPage, LessonPage } from "./pages/Academy";
import { ToolsHubPage } from "./pages/Tools";
import { AssessmentPage } from "./pages/Assessment";
import { ResourcesPage } from "./pages/Resources";
import { PrivacyPage } from "./pages/Privacy";
import { ReportPage } from "./pages/Report";
import { CaseFollowupPage } from "./pages/CaseFollowup";
import { CountriesPage, CountryPage } from "./pages/Countries";
import { TrustPage } from "./pages/Trust";
import { AiChatPage } from "./pages/AiChat";
// خط عربي احترافي مُستضاف محلياً — بلا طلبات خارجية
import "@fontsource/ibm-plex-sans-arabic/400.css";
import "@fontsource/ibm-plex-sans-arabic/500.css";
import "@fontsource/ibm-plex-sans-arabic/700.css";
import "./styles/design.css";

// الأدوات الثقيلة (قواميس zxcvbn) تُحمَّل عند الطلب فقط — كل أداة في حزمة مستقلة
const PasswordCheckerPage = lazy(() =>
  import("./pages/tools/PasswordChecker").then((m) => ({ default: m.PasswordCheckerPage }))
);
const BreachCheckPage = lazy(() =>
  import("./pages/tools/BreachCheck").then((m) => ({ default: m.BreachCheckPage }))
);
const LinkAnalyzerPage = lazy(() =>
  import("./pages/tools/LinkAnalyzer").then((m) => ({ default: m.LinkAnalyzerPage }))
);
const AdminPage = lazy(() => import("./pages/Admin").then((m) => ({ default: m.AdminPage })));

const loading = <div className="container page"><Spinner label="جارٍ التحميل…" /></div>;

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: <HomePage /> },
      { path: "/assistant", element: <AssistantPage /> },
      { path: "/ai", element: <AiChatPage /> },
      { path: "/academy", element: <AcademyPage /> },
      { path: "/academy/:lessonId", element: <LessonPage /> },
      { path: "/tools", element: <ToolsHubPage /> },
      { path: "/tools/password", element: <Suspense fallback={loading}><PasswordCheckerPage /></Suspense> },
      { path: "/tools/breach", element: <Suspense fallback={loading}><BreachCheckPage /></Suspense> },
      { path: "/tools/link-check", element: <Suspense fallback={loading}><LinkAnalyzerPage /></Suspense> },
      { path: "/assessment", element: <AssessmentPage /> },
      { path: "/resources", element: <ResourcesPage /> },
      { path: "/privacy", element: <PrivacyPage /> },
      { path: "/report", element: <ReportPage /> },
      { path: "/case", element: <CaseFollowupPage /> },
      { path: "/countries", element: <CountriesPage /> },
      { path: "/countries/:code", element: <CountryPage /> },
      { path: "/trust", element: <TrustPage /> },
      { path: "/admin", element: <Suspense fallback={loading}><AdminPage /></Suspense> },
      { path: "*", element: <HomePage /> },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);
