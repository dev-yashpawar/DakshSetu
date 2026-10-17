import { NavLink, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Users,
  ClipboardCheck,
  ShieldCheck,
  Settings,
  FileCheck2,
  ChevronDown,
} from "lucide-react";
import { useTranslate } from "../localization";
import { useSession } from "../store/session";
export const adminSections = [
  ["dashboard", "Dashboard"],
  ["users", "User management"],
  ["assessors", "Assessor management"],
  ["qualifications", "Qualification packs"],
  ["assessments", "Assessment monitoring"],
  ["batches", "Batch management"],
  ["passports", "Skill Passports"],
  ["calibration", "Calibration management"],
  ["quality", "Assessor Consistency"],
  ["sync", "Offline and sync"],
  ["analytics", "Analytics and reports"],
  ["audit-log", "Audit log"],
  ["settings", "System settings"],
] as const;
export function AdminNavigation() {
  const tr = useTranslate(),
    { pathname } = useLocation();
  const link = (key: string, label: string) => (
    <NavLink
      key={key}
      to={
        key === "dashboard"
          ? "/admin"
          : key === "help"
            ? "/help"
            : "/admin/" + key
      }
      end
    >
      {tr(label)}
    </NavLink>
  );
  return (
    <nav className="admin-navigation" aria-label={tr("Admin navigation")}>
      {adminSections
        .filter(([key]) =>
          ["dashboard", "assessments", "users", "assessors"].includes(key),
        )
        .map(([key, label]) => link(key, label))}
      {[
        {
          label: "Assessment tools",
          keys: ["batches", "qualifications", "passports"],
          icon: FileCheck2,
        },
        {
          label: "Quality tools",
          keys: ["calibration", "quality"],
          icon: ShieldCheck,
        },
        {
          label: "More tools",
          keys: ["analytics", "sync", "audit-log", "settings"],
          icon: Settings,
        },
      ].map((group) => (
        <details
          className="navigation-group"
          key={group.label}
          open={group.keys.some((k) => pathname === "/admin/" + k)}
        >
          <summary>
            <group.icon size={16} />
            {tr(group.label)}
            <ChevronDown size={14} />
          </summary>
          <div>
            {adminSections
              .filter(([key]) => group.keys.includes(key))
              .map(([key, label]) => link(key, label))}
          </div>
        </details>
      ))}
      {link("help", "Help & support")}
    </nav>
  );
}
export function PortalSidebar({ role }: { role: "admin" | "assessor" }) {
  const { user } = useSession(),
    tr = useTranslate();
  const { pathname } = useLocation(),
    [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setMenuOpen(false), [pathname]);
  return (
    <aside
      className={
        (role === "admin" ? "admin-sidebar" : "workspace-sidebar") +
        (menuOpen ? " navigation-open" : "")
      }
    >
      <button
        className="sidebar-toggle"
        aria-expanded={menuOpen}
        aria-controls={role + "-workspace-links"}
        onClick={() => setMenuOpen((v) => !v)}
      >
        {tr("Workspace navigation")}
        <ChevronDown size={16} />
      </button>
      <div className="portal-identity">
        <span className="portal-avatar">
          {user?.name
            .split(" ")
            .map((n) => n[0])
            .slice(0, 2)
            .join("")}
        </span>
        <div>
          <strong>{user?.name}</strong>
          <small>{tr(role === "admin" ? "Administrator" : "Assessor")}</small>
        </div>
      </div>
      <div
        id={role + "-workspace-links"}
        className="sidebar-links"
        onClick={(e) => {
          if ((e.target as Element).closest("a")) setMenuOpen(false);
        }}
      >
        {role === "admin" ? (
          <AdminNavigation />
        ) : (
          <nav aria-label={tr("Assessor navigation")}>
            {[
              { to: "/assessor", label: "Dashboard", icon: LayoutDashboard },
              { to: "/assessor/candidates", label: "Candidates", icon: Users },
              {
                to: "/assessor/assessments",
                label: "Assessments",
                icon: ClipboardCheck,
              },
              {
                to: "/assessor/reports",
                label: "Completed cases",
                icon: FileCheck2,
              },
              {
                to: "/assessor/calibration",
                label: "Calibration practice",
                icon: ShieldCheck,
              },
            ].map((n) => (
              <NavLink key={n.to} to={n.to} end>
                <n.icon size={17} />
                {tr(n.label)}
              </NavLink>
            ))}
            <NavLink to="/help">{tr("Help")}</NavLink>
          </nav>
        )}
      </div>
    </aside>
  );
}
