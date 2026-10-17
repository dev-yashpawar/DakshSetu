import { useTranslate } from "../localization";
import {
  ArrowRight,
  ArrowLeft,
  Check,
  LoaderCircle,
  Volume2,
  AlertCircle,
  ArrowUpRight,
  Languages,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useCopy, useSession } from "../store/session";
export function Brand({
  inverse = false,
  compact = false,
  to = "/",
}: {
  inverse?: boolean;
  compact?: boolean;
  to?: string;
}) {
  const tr = useTranslate();

  return (
    <Link
      to={to}
      className={
        compact
          ? "brand portal-brand"
          : `brand supplied-logo ${inverse ? "inverse" : ""}`
      }
      aria-label={tr("DakshSetu home")}
    >
      {compact ? (
        <svg
          className="portal-logo-artwork"
          viewBox="250 195 1045 650"
          aria-hidden="true"
          focusable="false"
        >
          <image href="/dakshsetu-logo.png" width="1536" height="1024" />
        </svg>
      ) : (
        <img
          src="/dakshsetu-logo.png"
          alt={tr(
            "DakshSetu — A bridge from practical competence to formal recognition.",
          )}
        />
      )}
    </Link>
  );
}
export function Header() {
  const tr = useTranslate();

  const t = useCopy(),
    { user, language, supportedLanguages, setLanguage, logout } = useSession(),
    navigate = useNavigate(),
    [menu, setMenu] = useState(false);
  if (user)
    return (
      <header className="portal-header portal-topbar">
        <div className="container portal-topbar-inner">
          <Brand
            compact
            to={
              user.role === "worker"
                ? "/worker/dashboard"
                : user.role === "admin"
                  ? "/admin"
                  : "/assessor"
            }
          />
          <div className="portal-account-controls">
            <label className="language-select">
              <Languages size={17} />
              <span className="sr-only">{t.language}</span>
              <select
                aria-label={t.language}
                value={language}
                onChange={(e) => setLanguage(e.target.value as typeof language)}
              >
                {(supportedLanguages ?? ["en", "hi", "mr"]).map((l) => (
                  <option key={l} value={l}>
                    {l === "en"
                      ? tr("English")
                      : l === "hi"
                        ? "हिंदी"
                        : "मराठी"}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="portal-signout"
              aria-label={t.logout}
              onClick={() => {
                logout();
                navigate("/");
              }}
            >
              <LogOut size={18} />
              <span>{t.logout}</span>
            </button>
          </div>
        </div>
      </header>
    );
  return (
    <>
      <div className="service-bar">
        <div className="container">
          <span>
            <span className="tricolor" />
            {tr(" A bridge from practical competence to formal recognition.")}
          </span>
          <span className="prototype-label">{tr("SIH 26242 · Prototype")}</span>
        </div>
      </div>
      <header className={user ? "header portal-header" : "header"}>
        <div className="masthead container">
          <Brand />
          <span>
            {tr("Recognition of Prior Learning")}
            <br />
            <strong>
              {tr("A bridge from practical competence")}
              <br />
              {tr("to formal recognition.")}
            </strong>
          </span>
        </div>
        <div className="container nav-wrap">
          {!user && (
            <nav
              aria-label={tr("Main navigation")}
              className={menu ? "nav open" : "nav"}
              onClick={() => setMenu(false)}
            >
              <NavLink end to="/">
                {t.home}
              </NavLink>
              <Link to="/#how-it-works">{t.how}</Link>
              <Link to="/about">{t.about}</Link>
              <Link to="/help">{t.help}</Link>
            </nav>
          )}
          <div className="header-actions">
            <label className="language-select">
              <Languages size={17} />
              <span className="sr-only">{t.language}</span>
              <select
                aria-label={t.language}
                value={language}
                onChange={(e) => setLanguage(e.target.value as typeof language)}
              >
                {(supportedLanguages ?? ["en", "hi", "mr"]).includes("en") && (
                  <option value="en">{tr("English")}</option>
                )}
                {(supportedLanguages ?? ["en", "hi", "mr"]).includes("hi") && (
                  <option value="hi">हिंदी</option>
                )}
                {(supportedLanguages ?? ["en", "hi", "mr"]).includes("mr") && (
                  <option value="mr">मराठी</option>
                )}
              </select>
            </label>
            {user ? (
              <button
                className="button small secondary"
                aria-label={t.logout}
                title={t.logout}
                onClick={() => {
                  logout();
                  navigate("/");
                }}
              >
                <LogOut size={19} />
                {t.logout}
              </button>
            ) : (
              <Link className="button small login-link" to="/login">
                {tr("Register / Login")}
                <ArrowUpRight size={16} />
              </Link>
            )}
            {!user && (
              <button
                className="icon-button mobile-menu"
                aria-label={tr(menu ? "Close navigation" : "Open navigation")}
                onClick={() => setMenu(!menu)}
              >
                {tr(menu ? <X /> : <Menu />)}
              </button>
            )}
          </div>
        </div>
      </header>
    </>
  );
}
export function Footer() {
  const tr = useTranslate();
  const { user } = useSession();
  if (user)
    return (
      <footer className="portal-footer">
        <div className="container">
          <span>
            © {new Date().getFullYear()} {"DakshSetu"}
          </span>
          <small>
            {tr(
              "Research prototype · No government affiliation or certification",
            )}
          </small>
          <Link to="/help">{tr("Help & support")}</Link>
        </div>
      </footer>
    );

  return (
    <footer>
      <div className="container footer-top">
        <Brand inverse />
        <p>
          {tr("Helping workers prove")}
          <br />
          {tr("what they already know.")}
        </p>
        <div>
          <Link to="/about">{tr("About RPL")}</Link>
          <Link to="/help">{tr("Help & support")}</Link>
        </div>
        <span className="footer-note">
          {tr("AI assists.")}
          <br />
          <strong>{tr("The assessor decides.")}</strong>
        </span>
      </div>
      <div className="container footer-bottom">
        <span>
          © {tr(new Date().getFullYear())}
          {tr(" DakshSetu · SIH problem statement 26242")}
        </span>
        <span>
          {tr(
            "Research prototype · No government affiliation or certification",
          )}
        </span>
      </div>
    </footer>
  );
}
export function ErrorNotice({
  message,
  children,
}: {
  message: string;
  children?: ReactNode;
}) {
  const tr = useTranslate();

  if (!message) return null;
  return (
    <div className="notice error" role="alert">
      <AlertCircle size={20} />
      <div>
        {tr(message)}
        {tr(children)}
      </div>
    </div>
  );
}
export function Loading() {
  const tr = useTranslate();

  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={24} />
      {tr("Loading your journey…")}
    </div>
  );
}
export function Listen({ text }: { text: string }) {
  const tr = useTranslate();

  const t = useCopy(),
    { language } = useSession();
  const supported =
    typeof window !== "undefined" && "speechSynthesis" in window;
  useEffect(
    () => () => {
      if (supported) window.speechSynthesis.cancel();
    },
    [text, supported],
  );
  return (
    <button
      className="listen-button"
      disabled={!supported}
      title={tr(
        !supported ? "Read aloud is not supported by this browser" : undefined,
      )}
      onClick={() => {
        window.speechSynthesis.cancel();
        const speech = new SpeechSynthesisUtterance(text);
        speech.lang = { en: "en-IN", hi: "hi-IN", mr: "mr-IN" }[language];
        window.speechSynthesis.speak(speech);
      }}
    >
      <Volume2 size={17} />
      {t.listen}
    </button>
  );
}
export function StepTitle({
  number,
  label,
  title,
  help,
  readText,
}: {
  number: string;
  label: string;
  title: string;
  help: string;
  readText?: string;
}) {
  const tr = useTranslate();

  return (
    <div className="step-title">
      <div className="section-label">
        <span>{tr(number)}</span>
        {tr(label)}
      </div>
      <div className="title-row">
        <h1>{tr(title)}</h1>
        <Listen text={readText ?? `${title} ${help}`} />
      </div>
      <p>{tr(help)}</p>
    </div>
  );
}
export function Choice({
  selected,
  icon,
  title,
  subtitle,
  disabled,
  onClick,
}: {
  selected?: boolean;
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  const tr = useTranslate();

  return (
    <button
      type="button"
      className={`choice ${selected ? "selected" : ""}`}
      aria-pressed={!!selected}
      disabled={disabled}
      onClick={onClick}
    >
      {icon && <span className="choice-icon">{tr(icon)}</span>}
      <span className="choice-copy">
        <strong>{tr(title)}</strong>
        {subtitle && <small>{tr(subtitle)}</small>}
      </span>
      <span className="choice-check">
        {tr(selected && <Check size={16} />)}
      </span>
    </button>
  );
}
export function Actions({
  onBack,
  onNext,
  nextLabel,
  disabled,
  busy,
}: {
  onBack: () => void;
  onNext: () => void;
  nextLabel?: string;
  disabled?: boolean;
  busy?: boolean;
}) {
  const tr = useTranslate();

  const t = useCopy();
  return (
    <div className="worker-actions">
      <button className="text-button" onClick={onBack} disabled={busy}>
        <ArrowLeft size={18} />
        {t.back}
      </button>
      <button className="button" onClick={onNext} disabled={disabled || busy}>
        {tr(busy ? <LoaderCircle size={18} className="spin" /> : null)}
        {tr(nextLabel ?? t.continue)}
        {tr(!busy && <ArrowRight size={18} />)}
      </button>
    </div>
  );
}
