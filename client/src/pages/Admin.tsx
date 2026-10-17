import { adminSections, PortalSidebar } from "../components/PortalSidebar";
import "../locales/register-practical";
import { CalibrationCreator } from "./Quality";
import { useEffect, useState, type ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api, errorMessage } from "../services/api";
import { useTranslate } from "../localization";
import { ErrorNotice, Loading } from "../components/common";
import { useSession } from "../store/session";
import { rubric, practicalTask, recommendations } from "../../../shared/assessment";
import { practicalStageLabels } from "../../../shared/practical";
type Row = Record<string, any>;
export function Admin() {
  const { section = "dashboard" } = useParams();
  return <AdminSection key={section} section={section} />;
}
function AdminSection({ section }: { section: string }) {
  const tr = useTranslate(),
    { user } = useSession(),
    [query] = useSearchParams();
  const [data, setData] = useState<Row | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [page, setPage] = useState(1),
    [filter, setFilter] = useState(query.get("status") ?? ""),
    [search, setSearch] = useState(query.get("batch") ?? ""),
    [refresh, setRefresh] = useState(0),
    [workflowFilter, setWorkflowFilter] = useState(""),
    [practicalFilters, setPracticalFilters] = useState({ trade: "", assessorId: "", result: "", from: "", to: "", credentialStatus: "" }),
    [selected, setSelected] = useState<Row | null>(null),
    [form, setForm] = useState<Row | null>(null),
    [detail, setDetail] = useState<Row | null>(null);
  useEffect(() => {
    if (section === "assessments") {
      setSearch(query.get("batch") ?? "");
      setFilter(query.get("status") ?? "");
      setPage(1);
    }
  }, [section, query.get("batch"), query.get("status")]);
  useEffect(() => {
    if (form) {
      const editor = document.querySelector(".admin-editor");
      editor?.scrollIntoView?.({ behavior: "smooth", block: "start" });
      (
        editor?.querySelector("input,select,textarea") as HTMLElement | null
      )?.focus();
    }
  }, [form?.kind, selected?.id]);
  const endpoint = ["dashboard", "analytics"].includes(section)
    ? "analytics"
    : section;
  useEffect(() => {
    let live = true;
    setData(null);
    setError("");
    api
      .get(
        section === "audit-log" ? "/admin/audit-log" : "/manage/" + endpoint,
        {
          params: {
            page,
            ...(section === "users"
              ? { role: filter || undefined, search: search || undefined }
              : section === "assessments"
                ? { status: filter || undefined, batch: search || undefined, workflow: workflowFilter || undefined, ...Object.fromEntries(Object.entries(practicalFilters).filter(([,v]) => v)), ...(practicalFilters.from ? { from: new Date(practicalFilters.from + "T00:00:00").toISOString() } : {}), ...(practicalFilters.to ? { to: new Date(practicalFilters.to + "T23:59:59.999").toISOString() } : {}) }
                : {}),
          },
        },
      )
      .then((r) => {
        if (live) setData(Array.isArray(r.data) ? { items: r.data } : r.data);
      })
      .catch((e) => {
        if (live) setError(errorMessage(e));
      });
    return () => {
      live = false;
    };
  }, [endpoint, page, filter, search, refresh, workflowFilter, practicalFilters]);
  const mutate = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      setNotice(tr("Changes saved."));
      if (form?.kind === "settings")
        window.dispatchEvent(new window.Event("dakshsetu:settings-changed"));
      setForm(null);
      setSelected(null);
      setRefresh((v) => v + 1);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const action = (label: string, fn: () => void) => (
    <button
      type="button"
      className="button small secondary"
      disabled={busy}
      onClick={fn}
    >
      {tr(label)}
    </button>
  );
  const table = (
    cols: [string, string][],
    items: Row[],
    extra?: (r: Row) => ReactNode,
  ) => (
    <div className="table-scroll">
      <table className="candidate-table">
        <thead>
          <tr>
            {cols.map(([k, l]) => (
              <th key={k}>{tr(l)}</th>
            ))}
            {extra && <th>{tr("Action")}</th>}
          </tr>
        </thead>
        <tbody>
          {items.map((r, i) => (
            <tr key={r.id ?? r.credentialId ?? i}>
              {cols.map(([k]) => (
                <td key={k}>
                  {r[k] == null ? (
                    "—"
                  ) : typeof r[k] === "object" ? (
                    <details className="cell-details">
                      <summary>{tr("View details")}</summary>
                      <pre>{JSON.stringify(r[k], null, 2)}</pre>
                    </details>
                  ) : typeof r[k] === "boolean" ? (
                    tr(r[k] ? "Yes" : "No")
                  ) : (
                    tr(String(r[k]))
                  )}
                </td>
              ))}
              {extra && (
                <td>
                  <div className="admin-row-actions">{extra(r)}</div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {!items.length && <p className="empty-state">{tr("No records yet.")}</p>}
    </div>
  );
  const field = (label: string, key: string, type = "text") => (
    <label className="field" key={key}>
      {tr(label)}
      <input
        type={type}
        value={form?.[key] ?? ""}
        required={!["batch", "scheduledAt", "sourceUrl"].includes(key)}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
      />
    </label>
  );
  const select = (label: string, key: string, options: [string, string][]) => (
    <label className="field" key={key}>
      {tr(label)}
      <select
        value={form?.[key] ?? ""}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
      >
        {options.map(([value, label]) => (
          <option key={value} value={value}>
            {tr(label)}
          </option>
        ))}
      </select>
    </label>
  );
  const textarea = (label: string, key: string) => (
    <label className="field" key={key}>
      {tr(label)}
      <textarea
        rows={3}
        value={form?.[key] ?? ""}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
      />
    </label>
  );
  const open = (kind: string, row: Row | null, values: Row) => {
    setSelected(row);
    setForm({ kind, ...values });
  };
  const inspect = (url: string) =>
    void api
      .get(url)
      .then((r) => setDetail(r.data))
      .catch((e) => setError(errorMessage(e)));
  const submit = () =>
    void mutate(async () => {
      if (!form) return;
      if (form.kind === "user") {
        if (selected)
          await api.patch("/manage/users/" + selected.id, {
            baseVersion: selected.managementVersion ?? 0,
            role: form.role,
            accountStatus: form.accountStatus,
            reason: form.reason,
          });
        else
          await api.post("/manage/users", {
            name: form.name,
            email: form.email,
            phone: form.phone,
            password: form.password,
            role: form.role,
            preferredLanguage: form.preferredLanguage,
          });
      } else if (form.kind === "assignment")
        await api.post("/manage/assessments/" + selected!.id + "/assign", {
          baseVersion: selected!.version,
          assessorId: form.assessorId,
          batch: form.batch,
          scheduledAt: form.scheduledAt
            ? new Date(form.scheduledAt).toISOString()
            : "",
          reason: form.reason,
        });
      else if (form.kind === "qualification") {
        const body = {
          title: form.title,
          code: form.code,
          nsqfLevel: Number(form.nsqfLevel),
          sector: form.sector,
          skills: form.skills.split("\n").filter(Boolean),
          tasks: form.tasks.split("\n").filter(Boolean),
          nos: form.nos.split("\n").filter(Boolean),
          isDemo: true,
          trade: "Electrician",
          active: !!form.active,
          sourceUrl: form.sourceUrl,
        };
        if (selected)
          await api.put("/manage/qualifications/" + selected.id, {
            ...body,
            baseVersion: selected.revision ?? 0,
          });
        else await api.post("/manage/qualifications", body);
      } else if (form.kind === "rubric")
        await api.post("/manage/qualifications/" + selected!.id + "/rubrics", {
          taskTitle: form.taskTitle,
          criteria: form.criteria.map((c: Row) => ({
            ...c,
            weight: Number(c.weight),
          })),
        });
      else if (form.kind === "calibrationAssign")
        await api.put("/manage/calibration/" + selected!.id + "/assign", {
          assessorIds: form.assessorIds,
        });
      else if (form.kind === "revoke")
        await api.post(
          "/admin/credentials/" + selected!.credentialId + "/revoke",
          { revision: selected!.revision, reason: form.reason },
        );
      else if (form.kind === "settings")
        await api.put("/manage/settings", {
          baseVersion: data!.version,
          languages: form.languages,
          demoEnabled: form.demoEnabled,
          activeQualificationId: form.activeQualificationId,
          policy: {
            selfWeight: Number(form.selfWeight) / 100,
            practicalWeight: 1 - Number(form.selfWeight) / 100,
            competent: Number(form.competent),
            minorGap: Number(form.minorGap),
            furtherAssessment: Number(form.furtherAssessment),
          },
          reason: form.reason,
        });
    });
  const exportReport = () =>
    void mutate(async () => {
      const r = await api.get("/manage/reports.csv", { responseType: "blob" }),
        url = URL.createObjectURL(r.data),
        a = document.createElement("a");
      a.href = url;
      a.download = "dakshsetu-assessments.csv";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  return (
    <main className="container admin-portal">
      <PortalSidebar role="admin" />
      <section className="admin-content">
        <div className="admin-title">
          <div>
            <h1>
              {tr(
                adminSections.find(([s]) => s === section)?.[1] ??
                  "Page not found",
              )}
            </h1>
          </div>
          {action("Refresh", () => setRefresh((v) => v + 1))}
        </div>
        <ErrorNotice message={error} />
        {notice && (
          <p className="notice success" role="status">
            {notice}
          </p>
        )}
        {section === "users" && (
          <div className="admin-toolbar">
            <label>
              {tr("Role")}
              <select
                aria-label={tr("Filter by role")}
                value={filter}
                onChange={(e) => {
                  setFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">{tr("All roles")}</option>
                {[
                  ["worker", "Worker"],
                  ["assessor", "Assessor"],
                  ["admin", "Administrator"],
                ].map(([v, l]) => (
                  <option key={v} value={v}>
                    {tr(l)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {tr("Search")}
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </label>
            {action("Create user", () =>
              open("user", null, {
                name: "",
                email: "",
                phone: "",
                password: "",
                preferredLanguage: "en",
                role: "worker",
              }),
            )}
          </div>
        )}
        {section === "assessments" && (
          <div className="admin-toolbar">
            <label>{tr("Workflow status")}<select value={workflowFilter} onChange={e => { setWorkflowFilter(e.target.value); setPage(1); }}><option value="">{tr("All assessments")}</option>{Object.entries(practicalStageLabels).map(([key,label]) => <option key={key} value={key}>{tr(label)}</option>)}</select></label>
            <details className="help-disclosure"><summary>{tr("More filters")}</summary><div className="practical-task-form">
              <label>{tr("Trade")}<input value={practicalFilters.trade} onChange={e => {setPracticalFilters(f => ({...f,trade:e.target.value})); setPage(1);}} /></label>
              <label>{tr("Assessor")}<select value={practicalFilters.assessorId} onChange={e => {setPracticalFilters(f => ({...f,assessorId:e.target.value}));setPage(1);}}><option value="">{tr("All assessors")}</option>{(data?.people ?? []).filter((p:Row) => p.role === "assessor").map((p:Row) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
              <label>{tr("Result")}<select value={practicalFilters.result} onChange={e => {setPracticalFilters(f => ({...f,result:e.target.value}));setPage(1);}}><option value="">{tr("All results")}</option>{recommendations.map(r => <option value={r} key={r}>{tr(r)}</option>)}</select></label>
              <label>{tr("From date")}<input type="date" value={practicalFilters.from} onChange={e => {setPracticalFilters(f => ({...f,from:e.target.value}));setPage(1);}} /></label>
              <label>{tr("To date")}<input type="date" value={practicalFilters.to} onChange={e => {setPracticalFilters(f => ({...f,to:e.target.value}));setPage(1);}} /></label>
              <label>{tr("Credential status")}<select value={practicalFilters.credentialStatus} onChange={e => {setPracticalFilters(f => ({...f,credentialStatus:e.target.value}));setPage(1);}}><option value="">{tr("All credentials")}</option>{["ACTIVE","UPDATED","REVOKED"].map(s => <option key={s} value={s}>{tr(s)}</option>)}</select></label>
            </div></details>
            <label>
              {tr("Status")}
              <select
                aria-label={tr("Assessment status")}
                value={filter}
                onChange={(e) => {
                  setFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">{tr("All assessments")}</option>
                {[
                  ["SELF_ASSESSED", "Awaiting practical"],
                  ["IN_ASSESSMENT", "In assessment"],
                  ["SIGNED_OFF", "Assessor verified"],
                ].map(([v, l]) => (
                  <option key={v} value={v}>
                    {tr(l)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {tr("Batch")}
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </label>
          </div>
        )}
        {section === "qualifications" &&
          action("Add qualification pack", () =>
            open("qualification", null, {
              title: "",
              code: "",
              nsqfLevel: 4,
              sector: "Power",
              skills: "",
              tasks: "",
              nos: "",
              sourceUrl: "",
              active: true,
            }),
          )}
        {!data && !error && <Loading />}
        {data && (
          <>
            {["dashboard", "analytics"].includes(section) && (
              <>
                <div className="stats-grid">
                  {[
                    ["workers", "Total workers"],
                    ["assessors", "Assessors"],
                    ["total", "Total assessments"],
                    ["pending", "Pending assessments"],
                    ["inProgress", "In progress"],
                    ["completed", "Completed assessments"],
                    ["competentRate", "Competent rate"],
                    ["aiOverrideRate", "AI override rate"],
                  ]
                    .filter(
                      ([key]) =>
                        section === "analytics" ||
                        [
                          "workers",
                          "pending",
                          "inProgress",
                          "completed",
                        ].includes(key),
                    )
                    .map(([k, l]) => (
                      <article key={k} className="stat-card plain">
                        <strong>
                          {data[k] ?? "—"}
                          {k.endsWith("Rate") && data[k] != null ? "%" : ""}
                        </strong>
                        <h2>{tr(l)}</h2>
                      </article>
                    ))}
                </div>
                <div className="admin-quick-actions">
                  <Link
                    className="button"
                    to="/admin/assessments?status=SELF_ASSESSED"
                  >
                    {tr("Assign assessments")}
                  </Link>
                  <Link className="button outline" to="/admin/users">
                    {tr("User management")}
                  </Link>
                  <Link className="text-button" to="/admin/analytics">
                    {tr("Analytics and reports")}
                  </Link>
                  {section === "analytics" &&
                    action("Export report", exportReport)}
                </div>
                {section === "dashboard" && (
                  <section className="workspace-panel dashboard-next">
                    <div>
                      <span className="section-label">{tr("NEXT ACTION")}</span>
                      <h2>
                        {tr(
                          data.pending
                            ? "Candidates awaiting an assessor"
                            : "Assessment overview",
                        )}
                      </h2>
                      <p>
                        {tr(
                          data.pending
                            ? "Assign pending candidates to keep assessments moving."
                            : "Open assessments to review progress and completed cases.",
                        )}
                      </p>
                    </div>
                    <Link
                      className="text-button"
                      to={
                        "/admin/assessments" +
                        (data.pending ? "?status=SELF_ASSESSED" : "")
                      }
                    >
                      {tr("View assessments")}
                    </Link>
                  </section>
                )}
                {section === "analytics" && (
                  <>
                    <div className="admin-grid">
                      {[
                        ["trades", "Trade-wise assessments"],
                        ["districts", "District-wise assessments"],
                        ["gaps", "Skill-gap trends"],
                      ].map(([key, label]) => (
                        <section className="workspace-panel" key={key}>
                          <h2>{tr(label)}</h2>
                          {table(
                            [
                              ["name", "Category"],
                              ["count", "Count"],
                            ],
                            data[key],
                          )}
                        </section>
                      ))}
                    </div>
                    <p>
                      {tr(
                        "Rates use signed-off records only. Different case mixes do not establish assessor bias.",
                      )}
                    </p>
                  </>
                )}
              </>
            )}
            {section === "users" &&
              table(
                [
                  ["name", "Full name"],
                  ["email", "Email address"],
                  ["role", "Role"],
                  ["accountStatus", "Account status"],
                ],
                data.items,
                (r) =>
                  action("Manage access", () =>
                    open("user", r, {
                      role: r.role,
                      accountStatus: r.accountStatus ?? "ACTIVE",
                      reason: "",
                    }),
                  ),
              )}
            {section === "assessors" &&
              table(
                [
                  ["name", "Full name"],
                  ["pending", "Pending assessments"],
                  ["inProgress", "In progress"],
                  ["completed", "Completed assessments"],
                  ["average", "Average score"],
                  ["requiresCalibration", "Calibration review"],
                ],
                data.items,
                (r) => (
                  <>
                    {action("Calibration results", () =>
                      setDetail({ calibration: r.calibration }),
                    )}
                    <Link to="/admin/assessments">
                      {tr("Assign assessments")}
                    </Link>
                  </>
                ),
              )}
            {section === "assessments" &&
              table(
                [
                  ["workerName", "Candidate"],
                  ["status", "Status"],
                  ["workflowStatus", "Workflow status"],
                  ["practicalTaskTitle", "Task title"],
                  ["aiReviewStatus", "AI review status"],
                  ["assessorName", "Assessor"],
                  ["batch", "Batch"],
                  ["scheduledAt", "Scheduled date"],
                  ["finalScore", "Overall score"],
                ],
                data.items,
                (r) => (
                  <>
                    {action("Review record", () =>
                      inspect("/manage/assessments/" + r.id),
                    )}
                    {r.status !== "SIGNED_OFF" ? (
                      action(r.assessorId ? "Reassign" : "Assign", () =>
                        open("assignment", r, {
                          assessorId:
                            r.assessorId ??
                            data.people.find(
                              (p: Row) =>
                                p.role === "assessor" &&
                                p.accountStatus !== "INACTIVE",
                            )?.id ??
                            "",
                          batch: r.batch ?? "",
                          scheduledAt: r.scheduledAt?.slice(0, 16) ?? "",
                          reason: "",
                        }),
                      )
                    ) : (
                      <Link to={"/passports/" + r.id}>
                        {tr("View Skill Passport")}
                      </Link>
                    )}
                  </>
                ),
              )}
            {section === "batches" &&
              table(
                [
                  ["batch", "Batch"],
                  ["total", "Total assessments"],
                  ["pending", "Pending assessments"],
                  ["inProgress", "In progress"],
                  ["completed", "Completed assessments"],
                ],
                data.items,
                (r) => (
                  <Link
                    to={
                      "/admin/assessments?batch=" + encodeURIComponent(r.batch)
                    }
                  >
                    {tr("View batch")}
                  </Link>
                ),
              )}
            {section === "qualifications" &&
              table(
                [
                  ["title", "Qualification"],
                  ["code", "Qualification code"],
                  ["nsqfLevel", "NSQF level (demo)"],
                  ["revision", "Revision"],
                  ["active", "Active"],
                ],
                data.items,
                (r) => (
                  <>
                    {action("Edit details", () =>
                      open("qualification", r, {
                        ...r,
                        skills: r.skills.join("\n"),
                        tasks: r.tasks.join("\n"),
                        nos: r.nos.join("\n"),
                        sourceUrl: r.sourceUrl ?? "",
                        active: r.active !== false,
                      }),
                    )}
                    {action(
                      "Configure rubric",
                      () =>
                        void api
                          .get("/manage/qualifications/" + r.id + "/rubrics")
                          .then((v) => {
                            open("rubric", r, {
                              taskTitle: v.data[0]?.taskTitle ?? practicalTask,
                              criteria:
                                v.data[0]?.criteria.map(
                                  ({ _id, ...c }: Row) => c,
                                ) ?? rubric.map((c) => ({ ...c })),
                            });
                            setDetail({ rubricVersions: v.data });
                          })
                          .catch((e) => setError(errorMessage(e))),
                    )}
                  </>
                ),
              )}
            {section === "calibration" && (
              <>
                <CalibrationCreator />
                {table(
                  [
                    ["title", "Case"],
                    ["description", "Description"],
                    ["assignedAssessorIds", "Assigned assessors"],
                  ],
                  data.cases,
                  (r) =>
                    action("Assign practice case", () =>
                      open("calibrationAssign", r, {
                        assessorIds: r.assignedAssessorIds ?? [],
                      }),
                    ),
                )}
                <h2>{tr("Calibration results")}</h2>
                {table(
                  [
                    ["caseTitle", "Case"],
                    ["assessorName", "Assessor"],
                    ["score", "Score"],
                    ["reference", "Reference score"],
                    ["deviation", "Deviation"],
                    ["createdAt", "Date"],
                  ],
                  data.scores,
                )}
              </>
            )}
            {section === "passports" &&
              table(
                [
                  ["workerName", "Candidate"],
                  ["credentialId", "Credential ID"],
                  ["status", "Credential status"],
                  ["revision", "Revision"],
                  ["issuedAt", "Date"],
                ],
                data.items,
                (r) => (
                  <>
                    <Link to={"/passports/" + r.assessmentId}>
                      {tr("View Skill Passport")}
                    </Link>
                    <Link to={"/verify/" + r.credentialId}>
                      {tr("Verify credential")}
                    </Link>
                    {action(
                      "Verification history",
                      () =>
                        void api
                          .get(
                            "/manage/passports/" + r.credentialId + "/history",
                          )
                          .then((v) => setDetail({ events: v.data }))
                          .catch((e) => setError(errorMessage(e))),
                    )}
                    {r.status !== "REVOKED" &&
                      action("Revoke credential", () =>
                        open("revoke", r, { reason: "" }),
                      )}
                  </>
                ),
              )}
            {section === "sync" && (
              <>
                <p className="notice">
                  {tr(
                    "Device reports update after reconnecting. Unsent browser data cannot be inspected remotely. Retry requests run when the owner next opens this device online.",
                  )}
                </p>
                {table(
                  [
                    ["actorId", "User ID"],
                    ["pending", "Pending changes"],
                    ["failed", "Failed attempts"],
                    ["conflicts", "Conflicts"],
                    ["drafts", "Device drafts"],
                    ["lastSeenAt", "Last report"],
                  ],
                  data.devices,
                  (r) =>
                    action(
                      "Request retry",
                      () =>
                        void mutate(() =>
                          api.post(
                            "/manage/sync/" +
                              encodeURIComponent(r.id) +
                              "/retry",
                          ),
                        ),
                    ),
                )}
                <h2>{tr("Pending media metadata")}</h2>
                {table(
                  [
                    ["assessmentId", "Assessment ID"],
                    ["filename", "File name"],
                    ["status", "Status"],
                    ["createdAt", "Date"],
                  ],
                  data.media,
                )}
              </>
            )}
            {section === "audit-log" &&
              table(
                [
                  ["createdAt", "Date"],
                  ["actorId", "Actor ID"],
                  ["actorRole", "Role"],
                  ["action", "Action"],
                  ["assessmentId", "Assessment ID"],
                  ["oldValue", "Before"],
                  ["newValue", "After"],
                  ["metadata", "Details"],
                ],
                data.items,
              )}
            {section === "settings" && (
              <section className="workspace-panel">
                <p>
                  {tr(
                    "Scoring and rubric changes apply to new assessments only. Existing results retain their saved rules. Production environment restrictions still apply.",
                  )}
                </p>
                <dl className="admin-summary">
                  <dt>{tr("Supported languages")}</dt>
                  <dd>{data.languages.join(", ")}</dd>
                  <dt>{tr("Self-assessment weight")}</dt>
                  <dd>{Math.round(data.policy.selfWeight * 100)}%</dd>
                  <dt>{tr("Competent threshold")}</dt>
                  <dd>{data.policy.competent}%</dd>
                  <dt>{tr("Active qualification")}</dt>
                  <dd>{data.activeQualificationId}</dd>
                </dl>
                {action("Edit settings", () => {
                  open("settings", null, {
                    ...data,
                    selfWeight: data.policy.selfWeight * 100,
                    competent: data.policy.competent,
                    minorGap: data.policy.minorGap,
                    furtherAssessment: data.policy.furtherAssessment,
                    reason: "",
                  });
                  void api
                    .get("/manage/qualifications")
                    .then((r) => setSelected({ qualifications: r.data }))
                    .catch((e) => setError(errorMessage(e)));
                })}
              </section>
            )}
            {typeof data.total === "number" &&
              ["users", "assessments", "passports", "audit-log"].includes(
                section,
              ) && (
                <div className="admin-toolbar">
                  <button
                    className="button small secondary"
                    disabled={page === 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    {tr("Previous")}
                  </button>
                  <span>
                    {page} /{" "}
                    {Math.max(
                      1,
                      Math.ceil(
                        data.total / (section === "audit-log" ? 50 : 25),
                      ),
                    )}
                  </span>
                  <button
                    className="button small secondary"
                    disabled={
                      page * (section === "audit-log" ? 50 : 25) >= data.total
                    }
                    onClick={() => setPage((p) => p + 1)}
                  >
                    {tr("Next")}
                  </button>
                </div>
              )}
          </>
        )}
        {form && (
          <section
            className="workspace-panel admin-editor"
            aria-label={tr("Edit record")}
          >
            <h2>{tr("Edit record")}</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <div className="admin-form-grid">
                {form.kind === "user" && (
                  <>
                    {!selected && (
                      <>
                        {field("Full name", "name")}
                        {field("Email address", "email", "email")}
                        {field("Mobile number", "phone")}
                        {field(
                          "Password (12+ characters)",
                          "password",
                          "password",
                        )}
                        {select("Preferred language", "preferredLanguage", [
                          ["en", "English"],
                          ["hi", "Hindi"],
                          ["mr", "Marathi"],
                        ])}
                      </>
                    )}
                    {select("Role", "role", [
                      ["worker", "Worker"],
                      ["assessor", "Assessor"],
                      ["admin", "Administrator"],
                    ])}
                    {selected && (
                      <>
                        {select("Account status", "accountStatus", [
                          ["ACTIVE", "Active"],
                          ["INACTIVE", "Inactive"],
                        ])}
                        {textarea("Reason for change", "reason")}
                      </>
                    )}
                  </>
                )}
                {form.kind === "assignment" && (
                  <>
                    {select(
                      "Assessor",
                      "assessorId",
                      (data?.people ?? [])
                        .filter(
                          (p: Row) =>
                            p.role === "assessor" &&
                            p.accountStatus !== "INACTIVE",
                        )
                        .map((p: Row) => [p.id, p.name]),
                    )}
                    {field("Batch", "batch")}
                    {field("Scheduled date", "scheduledAt", "datetime-local")}
                    {textarea("Reason for change", "reason")}
                  </>
                )}
                {form.kind === "qualification" && (
                  <>
                    {field("Qualification", "title")}
                    {field("Qualification code", "code")}
                    {field("NSQF level (demo)", "nsqfLevel", "number")}
                    {field("Sector", "sector")}
                    {textarea("Skills (one per line)", "skills")}
                    {textarea("Tasks (one per line)", "tasks")}
                    {textarea("NOS (one per line)", "nos")}
                    {field("Reference URL", "sourceUrl", "url")}
                    <label>
                      <input
                        type="checkbox"
                        checked={!!form.active}
                        onChange={(e) =>
                          setForm({ ...form, active: e.target.checked })
                        }
                      />
                      {tr("Active")}
                    </label>
                    <p>
                      {tr(
                        "Administrator-entered packs remain prototype data until official approval is independently verified.",
                      )}
                    </p>
                  </>
                )}
                {form.kind === "rubric" && (
                  <>
                    {field("Practical task", "taskTitle")}
                    <p>
                      {tr(
                        "Create a new immutable rubric version. Weights must total 100; required safety criteria remain mandatory.",
                      )}
                    </p>
                    {form.criteria.map((c: Row, i: number) => (
                      <div className="rubric-editor-row" key={c.id}>
                        <label>
                          {tr(c.section)}
                          <input
                            aria-label={tr("Criterion")}
                            value={c.criterion}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                criteria: form.criteria.map(
                                  (r: Row, j: number) =>
                                    i === j
                                      ? { ...r, criterion: e.target.value }
                                      : r,
                                ),
                              })
                            }
                          />
                        </label>
                        <label>
                          {tr("Weight")}
                          <input
                            type="number"
                            min="1"
                            max="100"
                            value={c.weight}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                criteria: form.criteria.map(
                                  (r: Row, j: number) =>
                                    i === j
                                      ? { ...r, weight: e.target.value }
                                      : r,
                                ),
                              })
                            }
                          />
                        </label>
                        <span>
                          {tr(c.mandatory ? "Mandatory" : "Optional")}
                        </span>
                      </div>
                    ))}
                  </>
                )}
                {form.kind === "calibrationAssign" && (
                  <>
                    <p>
                      {tr(
                        "An empty selection makes this practice case available to every assessor.",
                      )}
                    </p>
                    {(data?.assessors ?? []).map((a: Row) => (
                      <label key={a.id}>
                        <input
                          type="checkbox"
                          checked={form.assessorIds.includes(a.id)}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              assessorIds: e.target.checked
                                ? [...form.assessorIds, a.id]
                                : form.assessorIds.filter(
                                    (id: string) => id !== a.id,
                                  ),
                            })
                          }
                        />
                        {a.name}
                      </label>
                    ))}
                  </>
                )}
                {form.kind === "revoke" &&
                  textarea("Reason for revocation", "reason")}
                {form.kind === "settings" && (
                  <>
                    {[
                      ["en", "English"],
                      ["hi", "Hindi"],
                      ["mr", "Marathi"],
                    ].map(([l, label]) => (
                      <label key={l}>
                        <input
                          type="checkbox"
                          checked={form.languages.includes(l)}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              languages: e.target.checked
                                ? [...form.languages, l]
                                : form.languages.filter((x: string) => x !== l),
                            })
                          }
                        />
                        {tr(label)}
                      </label>
                    ))}
                    <label>
                      <input
                        type="checkbox"
                        checked={form.demoEnabled}
                        onChange={(e) =>
                          setForm({ ...form, demoEnabled: e.target.checked })
                        }
                      />
                      {tr("Allow demo accounts")}
                    </label>
                    {select(
                      "Active qualification",
                      "activeQualificationId",
                      (selected?.qualifications ?? [])
                        .filter((q: Row) => q.active !== false)
                        .map((q: Row) => [q.id, q.title]),
                    )}
                    {field("Self-assessment weight", "selfWeight", "number")}
                    {field("Competent threshold", "competent", "number")}
                    {field("Minor skill-gap threshold", "minorGap", "number")}
                    {field(
                      "Further assessment threshold",
                      "furtherAssessment",
                      "number",
                    )}
                    {textarea("Reason for change", "reason")}
                  </>
                )}
              </div>
              <div className="admin-toolbar">
                <button className="button" disabled={busy}>
                  {tr(busy ? "Saving…" : "Save changes")}
                </button>
                {action("Cancel", () => {
                  setForm(null);
                  setSelected(null);
                })}
              </div>
            </form>
          </section>
        )}
        {detail && (
          <section className="workspace-panel admin-record">
            <div className="admin-toolbar">
              <h2>{tr("Record details")}</h2>
              {action("Close", () => setDetail(null))}
            </div>
            {detail.assessment && (
              <>
                <h3>{tr("Human review and sign-off")}</h3>
                {table(
                  [
                    ["status", "Status"],
                    ["selfAssessmentScore", "Self-assessment"],
                    ["aiSuggestedScore", "AI suggested score"],
                    ["assessorScore", "Assessor score"],
                    ["aiHumanDifference", "AI–human score difference"],
                    ["overrideReason", "Override reason"],
                    ["recommendation", "Recommendation"],
                    ["signedOffAt", "Signed off at"],
                  ],
                  [detail.assessment],
                )}
                <h3>{tr("AI Observation — Suggested Only")}</h3>
                {detail.analyses.map((a: Row) => (
                  <article key={a.id}>
                    <strong>
                      {a.type} · {a.createdAt}
                    </strong>
                    <p>{a.observation.summary}</p>
                    {table(
                      [
                        ["criterion", "Criterion"],
                        ["status", "Status"],
                        ["confidence", "Confidence"],
                        ["evidence", "Evidence"],
                      ],
                      a.observation.observations ?? [],
                    )}
                    <p>{a.observation.limitations.join(" · ")}</p>
                  </article>
                ))}
              </>
            )}
            {detail.events &&
              table(
                [
                  ["createdAt", "Date"],
                  ["action", "Action"],
                  ["actorId", "Actor ID"],
                  ["metadata", "Details"],
                ],
                detail.events,
              )}
            {detail.rubricVersions &&
              table(
                [
                  ["version", "Revision"],
                  ["taskTitle", "Practical task"],
                  ["createdAt", "Date"],
                ],
                detail.rubricVersions,
              )}
            {detail.calibration &&
              table(
                [
                  ["caseId", "Case"],
                  ["score", "Score"],
                  ["reference", "Reference score"],
                  ["createdAt", "Date"],
                ],
                detail.calibration,
              )}
          </section>
        )}
      </section>
    </main>
  );
}
