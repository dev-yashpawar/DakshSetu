import { useTranslate } from "../localization";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ShieldCheck,
  MessageCircle,
  ChevronDown,
} from "lucide-react";
import { useCopy } from "../store/session";
import { electricianReference } from "../../../shared/qualification-reference";
export function Info({ help = false }: { help?: boolean }) {
  const tr = useTranslate();

  const t = useCopy();
  const faqs = [
    [
      "Who is this pilot for?",
      "This prototype supports workers with practical experience in domestic electrical work. Other trades are planned for future development.",
    ],
    [
      "Do I need formal training?",
      "No formal training document is required to describe your experience in this prototype. Your self-assessment helps build your skill profile.",
    ],
    [
      "Can I speak instead of typing?",
      "Yes, on browsers that support speech recognition. Choose English, Hindi, or Marathi, then tap the microphone. You can always type your experience instead.",
    ],
    [
      "What if AI is unavailable?",
      "Choose “Select skills manually”. Your experience will still be saved, and you can confirm skills, find a qualification match, and complete the self-assessment.",
    ],
    [
      "Is this an official certificate?",
      "No. The qualification is clearly labeled demo data. A self-assessment is not a final competency decision or a government certificate.",
    ],
    [
      "What is included right now?",
      "The electrician pilot includes skill matching, practical assessment, private image and video review, human sign-off, QR Skill Passports, focused reassessment, offline drafts and media sync, consistency comparison and calibration. Hosting is manual.",
    ],
    [
      "Will my progress be saved?",
      "Completed steps are saved to your account. Quiz and practical drafts and queued evidence can be saved on this device offline and synced after reconnecting. Login, AI and final sign-off need a connection.",
    ],
    [
      "How are matches calculated?",
      "The prototype uses skill overlap (60%), work-description relevance (20%), and years of experience (20%). These are demo rules, not official qualification requirements.",
    ],
  ];
  return (
    <main className="info-page container">
      <div className="info-hero">
        <div className="section-label">
          <span>{tr(help ? "?" : "01")}</span>
          {tr(help ? "HERE TO HELP" : "RECOGNITION OF PRIOR LEARNING")}
        </div>
        <h1>
          {tr(
            help
              ? "A little guidance.\nA clearer next step."
              : "Your experience\nalready has value.",
          )}
        </h1>
        <p>
          {tr(
            help
              ? "Answers to common questions about your DakshSetu journey."
              : "Recognition of Prior Learning helps people demonstrate skills gained through practical work, experience, and informal learning.",
          )}
        </p>
      </div>
      {!help && (
        <div className="about-content">
          <div>
            <h2>{tr("A bridge from doing to recognition.")}</h2>
            <p>
              {tr(
                "DakshSetu helps workers describe their experience, review their practical skills, and connect them to a structured competency profile.",
              )}
            </p>
            <p>
              {tr(
                "The current electrician pilot includes a guided worker journey and five self-assessment questions, practical evidence, and human assessor verification.",
              )}
            </p>
            <Link to="/start" className="button">
              {tr("Start your journey")}
              <ArrowRight size={17} />
            </Link>
          </div>
          <div className="human-principle">
            <ShieldCheck size={32} />
            <h3>
              {tr("AI assists.")}
              <br />
              {tr("The assessor decides.")}
            </h3>
            <p>
              {tr(
                "Skill extraction is a suggestion for you to review. It does not certify competence.",
              )}
            </p>
          </div>
        </div>
      )}
      {!help && (
        <details className="faq qualification-provenance">
          <summary>
            {tr("Qualification source and approval status")}
            <ChevronDown size={18} />
          </summary>
          <p>
            {tr(
              "The pilot qualification remains demonstration data. An older PSSC reference is provided for background; its current approval has not been verified.",
            )}
          </p>
          <p>
            {tr("Reference document")}: {electricianReference.code} ·{" "}
            {tr("Version")} {electricianReference.version} ·{" "}
            {tr("Reference NSQF level")}: {electricianReference.nsqfLevel}
          </p>
          <p>
            {tr(
              "The reference was reviewed in July 2017 with a July 2021 review date. Its Level 3 must not be confused with this pilot’s unverified demonstration Level 4.",
            )}
          </p>
          <div className="hero-buttons">
            <a
              className="text-button"
              href={electricianReference.url}
              target="_blank"
              rel="noreferrer"
            >
              {tr("Read PSSC reference PDF")}
              <ArrowRight size={16} />
            </a>
            <a
              className="text-button"
              href={electricianReference.registerUrl}
              target="_blank"
              rel="noreferrer"
            >
              {tr("Check the National Qualification Register")}
              <ArrowRight size={16} />
            </a>
          </div>
        </details>
      )}
      <section className="faq-section">
        <h2>{tr(help ? "How can we help?" : "A few things to know")}</h2>
        {faqs.map(([q, a]) => (
          <details className="faq" key={q}>
            <summary>
              {tr(q)}
              <ChevronDown size={18} />
            </summary>
            <p>{tr(a)}</p>
          </details>
        ))}
      </section>
      {help && (
        <div className="notice">
          <MessageCircle size={22} />
          <div>
            <strong>{tr("Having trouble?")}</strong>
            <p>
              {tr(
                "Check your connection, try again, or use manual skill selection when AI is unavailable. This prototype has no staffed helpdesk.",
              )}
            </p>
          </div>
        </div>
      )}
      <p className="prototype-caption">
        {tr("DakshSetu · SIH 26242 · Research prototype")}
      </p>
    </main>
  );
}
