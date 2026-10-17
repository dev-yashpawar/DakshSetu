import type { Qualification } from "./types.js";
export const qualification: Qualification = {
  id: "demo-ele-001",
  title: "Electrician – Domestic Solutions",
  code: "DEMO-ELE-001",
  nsqfLevel: 4,
  sector: "Electrical",
  isDemo: true,
  skills: [
    "Residential Wiring",
    "MCB Installation",
    "Switch Installation",
    "Fault Diagnosis",
    "Safety Practices",
    "Testing",
  ],
  tasks: ["Install and test a basic switchboard."],
  nos: [
    "Safe working practices (demo)",
    "Domestic installation (demo)",
    "Inspection and testing (demo)",
  ],
};
export function matchSkills(
  skills: string[],
  years: number,
  description: string,
  q: Qualification = qualification,
) {
  const normalized = skills.map((s) => s.toLowerCase().trim());
  const matchedSkills = q.skills.filter((s) =>
    normalized.includes(s.toLowerCase()),
  );
  // Conservative vocabulary links only; no fuzzy match can infer safety competence.
  const aliases:Record<string,string[]>={'Residential Wiring':['house wiring','domestic wiring','घर की वायरिंग','घरातील वायरिंग'],'MCB Installation':['circuit breaker installation','mcb fitting'],'Switch Installation':['switch fitting'],'Fault Diagnosis':['fault finding','electrical troubleshooting'],'Testing':['continuity testing']};
  const partialMatches=q.skills.filter(s=>!matchedSkills.includes(s)).flatMap(skill=>{const source=skills.find(s=>(aliases[skill]??[]).includes(s.trim().toLowerCase()));return source?[{skill,source}]:[]});
  const gaps = q.skills.filter((s) => !matchedSkills.includes(s)&&!partialMatches.some(p=>p.skill===s));
  const taskKeywords = [
    /wir|वायर|वायरिंग/i,
    /switch|स्विच/i,
    /test|जाँच|तपास/i,
    /mcb|एमसीबी/i,
  ];
  const taskRelevance =
    taskKeywords.filter((r) => r.test(description)).length /
    taskKeywords.length;
  const score = Math.round(
    (q.skills.length ? (matchedSkills.length+partialMatches.length*.5) / q.skills.length : 0) * 60 +
      taskRelevance * 20 +
      Math.min(Math.max(years, 0) / 5, 1) * 20,
  );
  return {
    qualification: q,
    qualificationId:q.id,
    partialMatches,
    matchScore: score,
    matchedSkills,
    gaps,
    explanation:
      "Prototype match: skill overlap 60%, task relevance 20%, and experience 20%.",
  };
}
