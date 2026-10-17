import { useTranslate } from "./localization";
import { useEffect, lazy, Suspense, type ReactNode } from "react";
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { SessionProvider, useSession, useCopy } from "./store/session";
import { Header, Footer, ErrorNotice, Loading } from "./components/common";
import { Landing } from "./pages/Landing";
import { RouteBoundary } from "./components/RouteBoundary";
import { PortalNavigation } from "./components/PortalNavigation";
import { SuccessFeedback } from "./components/SuccessFeedback";
const OfflineStatus = lazy(() =>
  import("./components/OfflineStatus").then((m) => ({ default: m.OfflineStatus })),
);
const WorkerPortal = lazy(() =>
  import("./pages/WorkerPortal").then((m) => ({ default: m.WorkerPortal })),
);
const Auth = lazy(() =>
  import("./pages/Auth").then((m) => ({ default: m.Auth })),
);
const Worker = lazy(() =>
  import("./pages/Worker").then((m) => ({ default: m.Worker })),
);
const Start = lazy(() =>
  import("./pages/Worker").then((m) => ({ default: m.Start })),
);
const Info = lazy(() =>
  import("./pages/Info").then((m) => ({ default: m.Info })),
);
const Passport = lazy(() =>
  import("./pages/Passport").then((m) => ({ default: m.Passport })),
);
const Verify = lazy(() =>
  import("./pages/Verify").then((m) => ({ default: m.Verify })),
);
const Quality = lazy(() =>
  import("./pages/Quality").then((m) => ({ default: m.Quality })),
);
const Calibration = lazy(() =>
  import("./pages/Quality").then((m) => ({ default: m.Calibration })),
);
const Admin = lazy(() =>
  import("./pages/Admin").then((m) => ({ default: m.Admin })),
);
const AssessorDashboard = lazy(() =>
  import("./pages/Assessor").then((m) => ({ default: m.AssessorDashboard })),
);
const AssessorList = lazy(() =>
  import("./pages/Assessor").then((m) => ({ default: m.AssessorList })),
);
const CandidateDetail = lazy(() =>
  import("./pages/Assessor").then((m) => ({ default: m.CandidateDetail })),
);
function Protected({ children }: { children: ReactNode }) {
  const tr = useTranslate();

  const { ready, user, sessionError, retry } = useSession(),
    t = useCopy();
  if (!ready) return <Loading />;
  if (sessionError)
    return (
      <main className="container worker-main narrow">
        <ErrorNotice message={tr(sessionError)} />
        <button className="button" onClick={retry}>
          {t.retry}
        </button>
      </main>
    );
  if (!user) return <Navigate to="/login/worker" replace />;
  if (user.role !== "worker")
    return (
      <Navigate
        to={user.role === "assessor" ? "/assessor" : "/admin"}
        replace
      />
    );
  return children;
}
function AssessorOnly({
  children,
  role = "assessor",
}: {
  children: ReactNode;
  role?: "assessor" | "admin" | "any";
}) {
  const tr = useTranslate();

  const { user, ready, sessionError, retry } = useSession();
  if (!ready) return <Loading />;
  if (sessionError)
    return (
      <main className="container worker-main">
        <ErrorNotice message={tr(sessionError)} />
        <button className="button" onClick={retry}>
          {tr("Try again")}
        </button>
      </main>
    );
  if (!user)
    return (
      <Navigate to={role === "any" ? "/login" : `/login/${role}`} replace />
    );
  if (role !== "any" && user.role !== role)
    return (
      <Navigate
        to={
          user.role === "worker"
            ? "/worker"
            : user.role === "assessor"
              ? "/assessor"
              : "/admin"
        }
        replace
      />
    );
  return <Suspense fallback={<Loading />}>{tr(children)}</Suspense>;
}
function Account() {
  const tr = useTranslate();

  const { user } = useSession(),
    t = useCopy();
  return (
    <main className="container worker-main narrow">
      <h1>{user?.name ?? tr("Account")}</h1>
      <p>{tr("Your account is ready.")}</p>
      <Link className="button" to="/">
        {t.returnHome}
      </Link>
    </main>
  );
}
function Scroll() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash)
      requestAnimationFrame(() =>
        document.querySelector(hash)?.scrollIntoView({ behavior: "smooth" }),
      );
    else window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}
function Shell() {
  const tr = useTranslate();
  const { user } = useSession();
  useEffect(() => {
    document.title = tr(
      "DakshSetu — A bridge from practical competence to formal recognition.",
    );
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute("content", document.title);
  }, [tr]);

  return (
    <div className={user ? "app-portal" : "app-public"}>
      <a className="skip-link" href="#main-content">
        {tr("Skip to content")}
      </a>
      <Header />
      <PortalNavigation />
      <Suspense fallback={null}><OfflineStatus /></Suspense>
      <div id="main-content">
        <RouteBoundary>
          <Suspense fallback={<Loading />}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/start" element={<Start />} />
              <Route path="/login" element={<Auth />} />
              <Route
                path="/login/worker"
                element={<Auth key="worker-login" role="worker" />}
              />
              <Route
                path="/login/assessor"
                element={<Auth key="assessor-login" role="assessor" />}
              />
              <Route
                path="/login/admin"
                element={<Auth key="admin-login" role="admin" />}
              />
              <Route path="/register" element={<Auth register />} />
              <Route path="/about" element={<Info />} />
              <Route path="/help" element={<Info help />} />
              <Route
                path="/verify/:credentialId"
                element={
                  <Suspense fallback={<Loading />}>
                    <Verify />
                  </Suspense>
                }
              />
              <Route
                path="/admin/quality"
                element={
                  <AssessorOnly role="admin">
                    <Quality />
                  </AssessorOnly>
                }
              />
              <Route
                path="/assessor/calibration"
                element={
                  <AssessorOnly>
                    <Calibration />
                  </AssessorOnly>
                }
              />
              <Route path="/account" element={<Account />} />
              <Route
                path="/passports/:assessmentId"
                element={
                  <AssessorOnly role="any">
                    <Passport />
                  </AssessorOnly>
                }
              />
              <Route
                path="/admin/:section?"
                element={
                  <AssessorOnly role="admin">
                    <Admin />
                  </AssessorOnly>
                }
              />
              <Route
                path="/assessor"
                element={
                  <AssessorOnly>
                    <AssessorDashboard />
                  </AssessorOnly>
                }
              />
              <Route
                path="/assessor/candidates"
                element={
                  <AssessorOnly>
                    <AssessorList mode="candidates" />
                  </AssessorOnly>
                }
              />
              <Route
                path="/assessor/assessments"
                element={
                  <AssessorOnly>
                    <AssessorList mode="assessments" />
                  </AssessorOnly>
                }
              />
              <Route
                path="/assessor/reports"
                element={
                  <AssessorOnly>
                    <AssessorList mode="reports" />
                  </AssessorOnly>
                }
              />
              <Route
                path="/assessor/candidates/:id"
                element={
                  <AssessorOnly>
                    <CandidateDetail />
                  </AssessorOnly>
                }
              />
              <Route
                path="/worker"
                element={
                  <Protected>
                    <Worker />
                  </Protected>
                }
              />
              {[
                "dashboard",
                "profile",
                "myskills",
                "passport",
                "reassessment",
                "evidence",
              ].map((view) => (
                <Route
                  key={view}
                  path={"/worker/" + view}
                  element={
                    <Protected>
                      <WorkerPortal view={view} />
                    </Protected>
                  }
                />
              ))}
              <Route
                path="/worker/:step"
                element={
                  <Protected>
                    <Worker />
                  </Protected>
                }
              />
              <Route
                path="*"
                element={
                  <main className="container worker-main narrow">
                    <h1>{tr("Page not found")}</h1>
                    <Link to="/" className="button">
                      {tr("Return home")}
                    </Link>
                  </main>
                }
              />
            </Routes>
          </Suspense>
        </RouteBoundary>
      </div>
      <Footer />
      <SuccessFeedback />
      <Scroll />
    </div>
  );
}
export default function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <Shell />
      </SessionProvider>
    </BrowserRouter>
  );
}
