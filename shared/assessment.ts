import type { RubricScore, Recommendation } from "./types.js";
export const practicalTask = "Install and test a basic switchboard.";
export const legacyRubric = [
  {
    id: "power",
    criterion: "Disconnects power supply",
    section: "Safety",
    weight: 15,
  },
  { id: "voltage", criterion: "Checks voltage", section: "Safety", weight: 10 },
  {
    id: "tools",
    criterion: "Uses correct tools",
    section: "Safety",
    weight: 10,
  },
  {
    id: "wire",
    criterion: "Selects correct wire",
    section: "Procedure",
    weight: 15,
  },
  {
    id: "connections",
    criterion: "Makes correct connections",
    section: "Procedure",
    weight: 20,
  },
  {
    id: "terminals",
    criterion: "Secures terminals",
    section: "Procedure",
    weight: 10,
  },
  {
    id: "test",
    criterion: "Performs final test",
    section: "Testing",
    weight: 10,
  },
  {
    id: "exposed",
    criterion: "Checks for exposed conductors",
    section: "Testing",
    weight: 10,
  },
] as const;
export const rubric = [
  {
    id: "power",
    criterion: "Disconnects power supply",
    section: "Safety",
    weight: 15,
    mandatory: true,
  },
  {
    id: "voltage",
    criterion: "Checks voltage",
    section: "Safety",
    weight: 10,
    mandatory: true,
  },
  {
    id: "ppe",
    criterion: "Uses appropriate PPE",
    section: "Safety",
    weight: 5,
    mandatory: true,
  },
  {
    id: "tools",
    criterion: "Uses correct tools",
    section: "Safety",
    weight: 5,
    mandatory: true,
  },
  {
    id: "wire",
    criterion: "Selects correct wire",
    section: "Procedure",
    weight: 10,
    mandatory: true,
  },
  {
    id: "strip",
    criterion: "Strips wire correctly",
    section: "Procedure",
    weight: 5,
    mandatory: true,
  },
  {
    id: "connections",
    criterion: "Makes correct connections",
    section: "Procedure",
    weight: 15,
    mandatory: true,
  },
  {
    id: "terminals",
    criterion: "Secures terminals",
    section: "Procedure",
    weight: 10,
    mandatory: true,
  },
  {
    id: "layout",
    criterion: "Maintains clean wiring layout",
    section: "Procedure",
    weight: 5,
    mandatory: false,
  },
  {
    id: "test",
    criterion: "Performs final test",
    section: "Testing",
    weight: 10,
    mandatory: true,
  },
  {
    id: "exposed",
    criterion: "Checks for exposed conductors",
    section: "Testing",
    weight: 5,
    mandatory: true,
  },
  {
    id: "operation",
    criterion: "Verifies final operation",
    section: "Testing",
    weight: 5,
    mandatory: true,
  },
] as const;
export type RubricCriterion = {
  id: string;
  criterion: string;
  section: string;
  weight: number;
  mandatory: boolean;
};
export function getRubric(
  version = 1,
  snapshot?: readonly RubricCriterion[],
): readonly RubricCriterion[] {
  if (snapshot?.length) return snapshot;
  return version === 2
    ? rubric
    : legacyRubric.map((r) => ({ ...r, mandatory: true }));
}
export const safetyWarnings = (
  scores: RubricScore[],
  version = 2,
  snapshot?: readonly RubricCriterion[],
) =>
  getRubric(version, snapshot).filter(
    (r) =>
      r.section === "Safety" &&
      r.mandatory &&
      scores.some((s) => s.criterionId === r.id && s.score <= 1),
  );
export const scoreLabels = [
  "Not demonstrated",
  "Partially demonstrated",
  "Demonstrated with assistance",
  "Independently demonstrated",
];
export const recommendations = [
  "Competent",
  "Competent with minor skill-gap training",
  "Further assessment required",
  "Not yet competent",
] as const;
export const prototypeScoring = {
  selfWeight: 0.3,
  practicalWeight: 0.7,
  aiDifferenceThreshold: 20,
};
export function calculatePractical(
  scores: RubricScore[],
  version = 2,
  snapshot?: readonly RubricCriterion[],
) {
  return Math.round(
    getRubric(version, snapshot).reduce(
      (total, r) =>
        total +
        ((scores.find((s) => s.criterionId === r.id)?.score ?? 0) / 3) *
          r.weight,
      0,
    ),
  );
}
export function calculateFinal(
  self: number,
  practical: number,
  policy?: import("./management.js").ScoringPolicy,
) {
  return Math.round(
    self * (policy?.selfWeight ?? prototypeScoring.selfWeight) +
      practical * (policy?.practicalWeight ?? prototypeScoring.practicalWeight),
  );
}
export function suggestedRecommendation(
  score: number,
  policy?: import("./management.js").ScoringPolicy,
): Recommendation {
  return score >= (policy?.competent ?? 75)
    ? "Competent"
    : score >= (policy?.minorGap ?? 60)
      ? "Competent with minor skill-gap training"
      : score >= (policy?.furtherAssessment ?? 0)
        ? "Further assessment required"
        : "Not yet competent";
}
