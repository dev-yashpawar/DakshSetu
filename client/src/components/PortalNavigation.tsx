import { NavLink, useLocation } from "react-router-dom";
import { useSession } from "../store/session";
import { useTranslate } from "../localization";
export function PortalNavigation() {
  const { user } = useSession(),
    tr = useTranslate(),
    { pathname } = useLocation();
  if (!user) return null;
  const item = (to: string, label: string) => (
    <NavLink
      key={to}
      to={to}
      end
      className={({ isActive }) =>
        (
          to === "/worker"
            ? pathname === "/worker" ||
              /^\/worker\/(trade|years|describe|skills|match|quiz|result)$/.test(
                pathname,
              )
            : isActive
        )
          ? "active"
          : ""
      }
    >
      {tr(label)}
    </NavLink>
  );
  if (user.role !== "worker") {
    if (pathname.startsWith("/admin") || pathname.startsWith("/assessor"))
      return null;
    return (
      <nav
        className="container portal-navigation"
        aria-label={tr("Portal navigation")}
      >
        {item(user.role === "admin" ? "/admin" : "/assessor", "Dashboard")}
        {item("/help", "Help")}
      </nav>
    );
  }
  const more = [
    ["/worker/profile", "My profile"],
    ["/worker/myskills", "My skills"],
    ["/worker/reassessment", "Reassessment"],
  ];
  return (
    <nav
      className="container portal-navigation"
      aria-label={tr("Portal navigation")}
    >
      {item("/worker/dashboard", "Dashboard")}
      {item("/worker", "My assessment")}
      {item("/worker/evidence", "My practical assessment")}
      {item("/worker/passport", "Skill Passport")}
      <details
        className="worker-more"
        open={more.some(([to]) => to === pathname)}
      >
        <summary>{tr("More")}</summary>
        <div>
          {more.map(([to, label]) => item(to, label))}
          {item("/help", "Help")}
        </div>
      </details>
    </nav>
  );
}
