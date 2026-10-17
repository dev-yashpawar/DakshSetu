import { useTranslate } from "../localization";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  Mic,
  ShieldCheck,
  Check,
  Zap,
  ClipboardCheck,
  Route,
  Languages,
  UserRound,
  FileCheck2,
  ChevronRight,
  BriefcaseBusiness,
} from "lucide-react";
import { useCopy, useSession } from "../store/session";
const steps = [
  {
    icon: Mic,
    title: "Tell us your work",
    text: "Speak or type about the work you do every day.",
  },
  {
    icon: Zap,
    title: "Discover your skills",
    text: "Review the skills suggested from your experience.",
  },
  {
    icon: ClipboardCheck,
    title: "Complete an assessment",
    text: "Answer five simple questions about your trade.",
  },
  {
    icon: FileCheck2,
    title: "Take the next step",
    text: "Demonstrate your practical skills for a human assessor’s review.",
  },
];
export function Landing() {
  const tr = useTranslate();

  const { user } = useSession(),
    t = useCopy();
  const journeyPath =
    user?.role === "assessor"
      ? "/assessor"
      : user?.role === "admin"
        ? "/admin"
        : user
          ? "/worker"
          : "/start";
  return (
    <>
      <section className="hero">
        <div className="container hero-grid">
          <div className="hero-copy">
            <div className="eyebrow">
              <span />
              {tr("RPL · RECOGNITION OF PRIOR LEARNING")}
            </div>
            <h1>
              {tr("Your skills.")}
              <br />
              {tr("Your experience.")}
              <br />
              <span>{tr("Now recognised.")}</span>
            </h1>
            <p>
              {tr(
                "You’ve learned by doing. Let’s give that experience the recognition it deserves.",
              )}
            </p>
            <p className="hero-secondary">
              {tr(
                "Tell us what work you already know. DakshSetu helps map your experience to recognised competencies.",
              )}
            </p>
            <div className="hero-buttons">
              <Link to={journeyPath} className="button">
                {tr(user ? t.resume : "Start assessment")}
                <ArrowRight size={19} />
              </Link>
              <Link className="text-button" to="/about">
                {t.learnMore}
                <ArrowUpRight size={18} />
              </Link>
            </div>
            <div className="hero-reassurance">
              <span>
                <Check size={15} />
                {tr("Free to explore")}
              </span>
              <span>
                <Check size={15} />
                {tr("Your language")}
              </span>
              <span>
                <Check size={15} />
                {tr("Human assessment")}
              </span>
            </div>
            <Link to="/login/assessor" className="assessor-entry">
              {tr("For assessors · Sign in to your workspace ")}
              <ArrowRight size={16} />
            </Link>
          </div>
          <div className="hero-artwork">
            <div className="hero-worker-portrait">
              <img
                src="/landing-workers-900.webp"
                srcSet="/landing-workers-600.webp 600w, /landing-workers-900.webp 900w"
                sizes="(max-width: 800px) 92vw, 44vw"
                width={1448}
                height={1086}
                fetchPriority="high"
                decoding="async"
                alt={tr(
                  "Skilled electrician, plumber and carpenter welcoming you to DakshSetu",
                )}
              />
            </div>
            <div
              className="recognition-visual hero-profile-card"
              aria-label={tr(
                "Your work experience becomes a structured skill profile",
              )}
            >
              <div className="visual-topline">
                <span className="mini-logo">
                  <Zap size={17} />
                </span>
                {tr("EXPERIENCE HAS VALUE")}
                <span className="visual-dots">•••</span>
              </div>
              <div className="worker-identity">
                <div className="worker-avatar">
                  <UserRound size={37} />
                  <span>
                    <Check size={12} />
                  </span>
                </div>
                <div>
                  <small>{tr("YOUR EVERYDAY EXPERTISE")}</small>
                  <h3>
                    {tr("Years of doing.")}
                    <br />
                    {tr("A lifetime of skill.")}
                  </h3>
                </div>
              </div>
              <div className="experience-tags">
                <span>
                  <Zap size={14} />
                  {tr("House wiring")}
                </span>
                <span>
                  <BriefcaseBusiness size={14} />
                  {tr("On-the-job experience")}
                </span>
                <span>
                  <ShieldCheck size={14} />
                  {tr("Practical knowledge")}
                </span>
              </div>
              <div className="bridge-line">
                <span />
                <div>{tr("THE DAKSHSETU BRIDGE")}</div>
                <ArrowRight size={17} />
              </div>
              <div className="profile-preview">
                <div className="profile-preview-heading">
                  <span className="pale-icon">
                    <ClipboardCheck size={23} />
                  </span>
                  <div>
                    <h4>{tr("Your skill profile")}</h4>
                    <p>{tr("Built around what you know")}</p>
                  </div>
                  <span className="demo-pill">{tr("PREVIEW")}</span>
                </div>
                <div className="profile-skill">
                  <span>{tr("Experience")}</span>
                  <span>{tr("Recognised strengths")}</span>
                </div>
                <div className="skill-line">
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
                <div className="profile-bottom">
                  <ShieldCheck size={16} />
                  {tr("AI assists. The assessor decides.")}
                </div>
              </div>
              <div className="visual-caption">
                <span className="dot green" />
                {tr("Simple steps. A meaningful next chapter.")}
              </div>
            </div>
          </div>
        </div>
      </section>
      <div className="principles-strip">
        <div className="container">
          <span>
            <Mic size={20} />
            {tr("Voice & visual guidance")}
          </span>
          <span>
            <Languages size={20} />
            {tr("English, हिंदी, मराठी")}
          </span>
          <span>
            <ShieldCheck size={20} />
            {tr("You confirm every skill")}
          </span>
          <span>
            <Route size={20} />
            {tr("One clear step at a time")}
          </span>
        </div>
      </div>
      <section className="section container" id="how-it-works">
        <div className="section-heading">
          <div>
            <div className="section-label">
              <span>01</span>
              {tr("THE JOURNEY")}
            </div>
            <h2>{tr("Your experience is the starting point.")}</h2>
          </div>
          <p>
            {tr("A simple path from the work you know")}
            <br />
            {tr("to a clearer picture of your skills.")}
          </p>
        </div>
        <div className="steps-grid">
          {steps.map((s, i) => (
            <article className="journey-card" key={s.title}>
              <div className="journey-top">
                <span className="pale-icon">
                  <s.icon size={24} />
                </span>
                <span>0{tr(i + 1)}</span>
              </div>
              <h3>{tr(s.title)}</h3>
              <p>{tr(s.text)}</p>
              {tr(
                i < 3 && <ChevronRight className="journey-arrow" size={19} />,
              )}
            </article>
          ))}
        </div>
      </section>
      <section className="trade-section">
        <div className="container">
          <div className="section-heading">
            <div>
              <div className="section-label">
                <span>02</span>
                {tr("BUILT FOR YOUR WORK")}
              </div>
              <h2>{tr("Real work. Real skills.")}</h2>
            </div>
            <span className="neutral-pill">
              {tr("One trade. A focused pilot.")}
            </span>
          </div>
          <div className="pilot-card">
            <div className="pilot-icon">
              <Zap size={36} />
            </div>
            <div>
              <span className="status-pill">{tr("PILOT TRADE")}</span>
              <h3>{tr("Electrician")}</h3>
              <p>
                {tr(
                  "House wiring, installations, testing, and fault diagnosis.",
                )}
              </p>
            </div>
            <Link to={journeyPath} className="button outline">
              {tr("Explore your skills")}
              <ArrowUpRight size={18} />
            </Link>
          </div>
          <p className="coming-trades">
            {tr(
              "More trades on the horizon: Plumber · Carpenter · Welder · Mason · Tailor",
            )}
          </p>
        </div>
      </section>
      <section className="section container rpl-section">
        <div>
          <div className="section-label">
            <span>03</span>
            {tr("EXPERIENCE MATTERS")}
          </div>
          <h2>
            {tr("You know the work.")}
            <br />
            {tr("Let your skills speak.")}
          </h2>
          <p>
            {tr(
              "Recognition of Prior Learning (RPL) helps make the skills you have gained through work visible. DakshSetu starts with your experience, then builds a structured skill profile.",
            )}
          </p>
          <Link to="/about" className="text-button">
            {tr("Understand recognition of prior learning")}
            <ArrowRight size={17} />
          </Link>
        </div>
        <div className="human-principle">
          <ShieldCheck size={34} />
          <h3>
            {tr("AI assists.")}
            <br />
            {tr("The assessor decides.")}
          </h3>
          <p>
            {tr(
              "Technology helps identify skills and observe evidence. Your confirmation and a human assessor’s judgment stay central.",
            )}
          </p>
          <span>{tr("Built with people at the centre.")}</span>
        </div>
      </section>
    </>
  );
}
