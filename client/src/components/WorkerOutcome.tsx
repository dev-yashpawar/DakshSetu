import { useTranslate } from "../localization";
import { Link } from "react-router-dom";
import { CheckCircle2, ClipboardCheck, RefreshCw } from "lucide-react";
import { useSession } from "../store/session";
import type { Assessment } from "../../../shared/types";
export function WorkerOutcome({
  assessment,
  onRefresh,
}: {
  assessment: Assessment;
  onRefresh: () => void;
}) {
  const tr = useTranslate();

  const { language } = useSession();
  const c = {
    en: {
      next: "Next step",
      practical: "Practical skill assessment",
      pending:
        "Your self-assessment is saved. A human assessor will review your practical work next.",
      active:
        "Your practical assessment is in progress. Your assessor will confirm the outcome.",
      verified: "Assessor verified",
      overall: "Overall competency score",
      refresh: "Refresh assessment status",
      note: "Prototype assessment result · Not a government certificate",
    },
    hi: {
      next: "अगला चरण",
      practical: "व्यावहारिक कौशल मूल्यांकन",
      pending:
        "आपका स्व-मूल्यांकन सहेज लिया गया है। अगला चरण मानव मूल्यांकनकर्ता द्वारा व्यावहारिक काम की जाँच है।",
      active:
        "आपका व्यावहारिक मूल्यांकन चल रहा है। मूल्यांकनकर्ता अंतिम परिणाम की पुष्टि करेंगे।",
      verified: "मूल्यांकनकर्ता द्वारा सत्यापित",
      overall: "समग्र कौशल स्कोर",
      refresh: "मूल्यांकन की स्थिति देखें",
      note: "प्रोटोटाइप मूल्यांकन परिणाम · सरकारी प्रमाणपत्र नहीं",
    },
    mr: {
      next: "पुढचा टप्पा",
      practical: "प्रात्यक्षिक कौशल्य मूल्यांकन",
      pending:
        "तुमचे स्व-मूल्यांकन जतन केले आहे. पुढे मानवी मूल्यांकनकर्ता तुमच्या प्रात्यक्षिक कामाचे मूल्यांकन करेल.",
      active:
        "तुमचे प्रात्यक्षिक मूल्यांकन सुरू आहे. मूल्यांकनकर्ता अंतिम निकाल निश्चित करेल.",
      verified: "मूल्यांकनकर्त्याने सत्यापित केले",
      overall: "एकूण कौशल्य गुण",
      refresh: "मूल्यांकन स्थिती पहा",
      note: "प्रोटोटाइप मूल्यांकन निकाल · सरकारी प्रमाणपत्र नाही",
    },
  }[language];
  const translated: Record<string, Record<"hi" | "mr", string>> = {
    Competent: { hi: "सक्षम", mr: "सक्षम" },
    "Competent with minor skill-gap training": {
      hi: "थोड़े कौशल प्रशिक्षण के साथ सक्षम",
      mr: "किरकोळ कौशल्य प्रशिक्षणासह सक्षम",
    },
    "Further assessment required": {
      hi: "आगे मूल्यांकन आवश्यक",
      mr: "पुढील मूल्यांकन आवश्यक",
    },
    "Not yet competent": { hi: "अभी सक्षम नहीं", mr: "अद्याप सक्षम नाही" },
  };
  if (assessment.status === "SIGNED_OFF")
    return (
      <div className="worker-final-outcome">
        <CheckCircle2 size={31} />
        <h3>{tr(c.verified)}</h3>
        <strong>{tr(assessment.finalScore)}%</strong>
        <span>{tr(c.overall)}</span>
        <p>
          {tr(
            language === "en"
              ? assessment.recommendation
              : (translated[assessment.recommendation ?? ""]?.[language] ??
                  assessment.recommendation),
          )}
        </p>
        <small>{tr(c.note)}</small>
        <Link className="button" to={"/passports/" + assessment.id}>
          {tr("View Skill Passport")}
        </Link>
      </div>
    );
  return (
    <>
      <div className="next-step">
        <span className="pale-icon">
          <ClipboardCheck size={24} />
        </span>
        <div>
          <small>{tr(c.next)}</small>
          <h3>{tr(c.practical)}</h3>
          <p>
            {tr(assessment.status === "IN_ASSESSMENT" ? c.active : c.pending)}
          </p>
        </div>
      </div>
      <button className="text-button refresh-status" onClick={onRefresh}>
        <RefreshCw size={17} />
        {tr(c.refresh)}
      </button>
    </>
  );
}
