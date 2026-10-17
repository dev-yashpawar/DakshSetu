import { useTranslate } from "../localization";
import { useState } from "react";
import { Link, NavLink, useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Eye,
  EyeOff,
  ArrowRight,
  LoaderCircle,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { loginSchema, registerSchema } from "../../../shared/validation";
import { api, errorMessage } from "../services/api";
import { useCopy, useSession } from "../store/session";
import { ErrorNotice } from "../components/common";
import type { PublicUser } from "../../../shared/types";
export function Auth({
  register = false,
  role,
}: {
  register?: boolean;
  role?: PublicUser["role"];
}) {
  const tr = useTranslate();

  const t = useCopy(),
    { language, authenticate, demoAccountsEnabled } = useSession(),
    navigate = useNavigate();
  const [search] = useSearchParams();
  const selectedRole =
    role ??
    (search.get("role") === "admin"
      ? "admin"
      : search.get("role") === "assessor"
        ? "assessor"
        : "worker");
  const assessorLogin = !register && selectedRole === "assessor";
  const adminLogin = !register && selectedRole === "admin";
  const demoEnabled = demoAccountsEnabled;
  const [show, setShow] = useState(false),
    [error, setError] = useState("");
  const [lockerDemo, setLockerDemo] = useState(false),
    [lockerBusy, setLockerBusy] = useState(false);
  const continueLockerDemo = async () => {
    setLockerBusy(true);
    setError("");
    try {
      const { data } = await api.post<{ user: PublicUser; token: string }>(
        "/auth/digilocker/demo",
        {},
      );
      authenticate(data.user, data.token);
      navigate("/worker/dashboard");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLockerBusy(false);
    }
  };
  const schema = register ? registerSchema : loginSchema;
  type Values = z.infer<typeof registerSchema>;
  const {
    register: field,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "", preferredLanguage: language },
  });
  const submit = async (values: Values) => {
    setError("");
    try {
      const { data } = await api.post<{ user: PublicUser; token: string }>(
        `/auth/${register ? "register" : "login"}`,
        register
          ? { ...values, preferredLanguage: language }
          : {
              email: values.email,
              password: values.password,
              role: selectedRole,
            },
      );
      authenticate(data.user, data.token);
      if (data.user.role === "worker") {
        await api.put("/workers/me", { preferredLanguage: language });
      }
      navigate(
        data.user.role === "worker"
          ? "/worker"
          : data.user.role === "assessor"
            ? "/assessor"
            : "/admin",
      );
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  return (
    <main className="auth-section container">
      <aside className="auth-intro">
        <div className="section-label">
          <span>01</span>
          {tr(
            adminLogin
              ? "Administrator"
              : assessorLogin
                ? "Assessor"
                : "YOUR JOURNEY STARTS HERE",
          )}
        </div>
        <h1>
          {tr(
            adminLogin
              ? "Manage assessments."
              : assessorLogin
                ? "Assess practical skills."
                : "Skills earned.",
          )}
          <br />
          <span>
            {tr(
              adminLogin
                ? "Support fair outcomes."
                : assessorLogin
                  ? "Recognise experience."
                  : "Recognition ahead.",
            )}
          </span>
        </h1>
        <p>
          {tr(
            "A few simple steps to help make your practical experience visible.",
          )}
        </p>
        {!(adminLogin || assessorLogin) && (
          <div className="auth-note">
            <ShieldCheck size={25} />
            <div>
              <strong>{tr("Your experience stays yours.")}</strong>
              <p>{tr("You review and confirm the skills in your profile.")}</p>
            </div>
          </div>
        )}
        <span className="auth-prototype">
          {tr("ELECTRICIAN PILOT · HUMAN-VERIFIED ASSESSMENT")}
        </span>
      </aside>
      <div className="auth-card">
        {!register && (
          <nav className="login-portals" aria-label={tr("Choose your portal")}>
            <NavLink
              to="/login/worker"
              className={selectedRole === "worker" ? "active" : ""}
            >
              {tr("Worker")}
            </NavLink>
            <NavLink
              to="/login/assessor"
              className={selectedRole === "assessor" ? "active" : ""}
            >
              {tr("Assessor")}
            </NavLink>
            <NavLink
              to="/login/admin"
              className={selectedRole === "admin" ? "active" : ""}
            >
              {tr("Administrator")}
            </NavLink>
          </nav>
        )}
        <div className="pale-icon">
          <UserRound size={25} />
        </div>
        <h2>
          {tr(
            register
              ? t.register
              : assessorLogin
                ? "Assessor sign in"
                : adminLogin
                  ? "Administrator sign in"
                  : "Worker sign in",
          )}
        </h2>
        <p>
          {tr(
            register
              ? t.registerHelp
              : assessorLogin
                ? "Sign in to review candidates and assess practical skills."
                : adminLogin
                  ? "Sign in to manage people, assessments and quality."
                  : t.authHelp,
          )}
        </p>
        <ErrorNotice message={tr(error)} />
        {(register || selectedRole === "worker") && (
          <section className="digilocker-entry">
            <button
              type="button"
              className="digilocker-button"
              aria-expanded={lockerDemo}
              aria-controls="digilocker-demo"
              onClick={() => setLockerDemo((v) => !v)}
            >
              <img src="/digilocker-logo.png" alt="" />
              <span>{tr("Continue with DigiLocker")}</span>
            </button>
            <small>{tr("Demo only. Not connected to DigiLocker.")}</small>
            {lockerDemo && (
              <div
                id="digilocker-demo"
                role="region"
                aria-label={tr("DigiLocker demo")}
                className="digilocker-demo"
              >
                <strong>{tr("DigiLocker demo")}</strong>
                <p>
                  {tr(
                    "This opens a shared demo worker account. No identity verification, Aadhaar access or real DigiLocker connection.",
                  )}
                </p>
                <button
                  type="button"
                  className="button secondary full"
                  disabled={lockerBusy || !demoEnabled || !demoAccountsEnabled}
                  onClick={continueLockerDemo}
                >
                  {tr(lockerBusy ? "Please wait" : "Continue with demo worker")}
                </button>
                {(!demoEnabled || !demoAccountsEnabled) && (
                  <small>{tr("Demo login is disabled.")}</small>
                )}
              </div>
            )}
          </section>
        )}
        <form onSubmit={handleSubmit(submit)} noValidate>
          {register && (
            <>
              <label>
                {t.name}
                <input
                  autoComplete="name"
                  {...field("name")}
                  placeholder={tr("Ramesh Patil")}
                  aria-invalid={!!errors.name}
                />
                {errors.name && (
                  <small className="field-error">
                    {tr(errors.name.message)}
                  </small>
                )}
              </label>
              <label>
                {t.phone}
                <input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  {...field("phone")}
                  placeholder="9876543210"
                  aria-invalid={!!errors.phone}
                />
                {errors.phone && (
                  <small className="field-error">
                    {tr(errors.phone.message)}
                  </small>
                )}
              </label>
            </>
          )}
          <label>
            {t.email}
            <input
              type="email"
              autoComplete="username"
              {...field("email")}
              placeholder={tr("you@example.com")}
              aria-invalid={!!errors.email}
            />
            {errors.email && (
              <small className="field-error">{tr(errors.email.message)}</small>
            )}
          </label>
          <label>
            {t.password}
            <span className="password-field">
              <input
                type={show ? "text" : "password"}
                aria-label={t.password}
                autoComplete={register ? "new-password" : "current-password"}
                {...field("password")}
                placeholder={tr("At least 6 characters")}
                aria-invalid={!!errors.password}
              />
              <button
                type="button"
                className="icon-button"
                aria-label={tr(show ? t.hidePassword : t.showPassword)}
                onClick={() => setShow(!show)}
              >
                {tr(show ? <EyeOff size={18} /> : <Eye size={18} />)}
              </button>
            </span>
            {errors.password && (
              <small className="field-error">
                {tr(errors.password.message)}
              </small>
            )}
          </label>
          {tr(register && <p className="form-consent">{t.consent}</p>)}
          <button className="button full" disabled={isSubmitting} type="submit">
            {tr(
              isSubmitting ? <LoaderCircle className="spin" size={18} /> : null,
            )}
            {tr(register ? t.register : t.signIn)}
            <ArrowRight size={18} />
          </button>
        </form>
        {(register || selectedRole === "worker") && (
          <p className="auth-switch">
            {tr(register ? t.haveAccount : t.newHere)}{" "}
            <Link to={register ? "/login/worker" : "/register"}>
              {tr(register ? t.signIn : t.register)}
            </Link>
          </p>
        )}
        {!register && selectedRole !== "worker" && (
          <p className="auth-switch">
            {tr("Staff accounts are created by an administrator.")}
          </p>
        )}
        {!register && demoEnabled && demoAccountsEnabled && (
          <div className="demo-login">
            <button
              className="text-button"
              disabled={isSubmitting}
              onClick={() => {
                setValue(
                  "email",
                  assessorLogin
                    ? "assessor@dakshsetu.demo"
                    : adminLogin
                      ? "admin@dakshsetu.demo"
                      : "worker@dakshsetu.demo",
                );
                setValue("password", "demo123");
                setError("");
              }}
            >
              {tr(
                assessorLogin
                  ? "Use demo assessor account"
                  : adminLogin
                    ? "Use demo administrator account"
                    : t.useDemo,
              )}
              <ArrowRight size={16} />
            </button>
            <small>{t.demoHint}</small>
          </div>
        )}
      </div>
    </main>
  );
}
