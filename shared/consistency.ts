export type RatingCondition = "unassisted" | "assisted";
export interface Rating {
  caseId: string;
  assessorId: string;
  condition: RatingCondition;
  criterionId: string;
  score: number;
}
export interface Agreement {
  metric: "Cohen’s Kappa" | "Fleiss’ Kappa";
  kappa: number | null;
  observed: number;
  expected: number;
  units: number;
  assessors: number;
}
export function agreement(matrix: number[][]): Agreement | null {
  const n = matrix[0]?.length ?? 0;
  if (
    matrix.length < 2 ||
    n < 2 ||
    matrix.some(
      (row) =>
        row.length !== n ||
        row.some((v) => !Number.isInteger(v) || v < 0 || v > 3),
    )
  )
    return null;
  const counts = [0, 0, 0, 0];
  let observed = 0,
    expected = 0;
  if (n === 2) {
    const left = [0, 0, 0, 0],
      right = [0, 0, 0, 0];
    for (const row of matrix) {
      left[row[0]]++;
      right[row[1]]++;
      if (row[0] === row[1]) observed++;
    }
    observed /= matrix.length;
    expected =
      left.reduce((s, v, i) => s + v * right[i], 0) / matrix.length ** 2;
  } else {
    for (const row of matrix) {
      const c = [0, 0, 0, 0];
      for (const v of row) {
        c[v]++;
        counts[v]++;
      }
      observed += c.reduce((s, v) => s + v * (v - 1), 0) / (n * (n - 1));
    }
    observed /= matrix.length;
    expected = counts.reduce((s, v) => s + (v / (matrix.length * n)) ** 2, 0);
  }
  return {
    metric: n === 2 ? "Cohen’s Kappa" : "Fleiss’ Kappa",
    kappa:
      Math.abs(1 - expected) < 1e-12
        ? null
        : (observed - expected) / (1 - expected),
    observed,
    expected,
    units: matrix.length,
    assessors: n,
  };
}
export function compareRatings(ratings: Rating[]) {
  const assessors = [...new Set(ratings.map((r) => r.assessorId))].sort();
  const units = new Map<string, Map<RatingCondition, Map<string, number>>>();
  for (const r of ratings) {
    const key = JSON.stringify([r.caseId, r.criterionId]);
    let unit = units.get(key);
    if (!unit) {
      unit = new Map();
      units.set(key, unit);
    }
    let panel = unit.get(r.condition);
    if (!panel) {
      panel = new Map();
      unit.set(r.condition, panel);
    }
    if (panel.has(r.assessorId)) throw new Error("Duplicate rating cell.");
    panel.set(r.assessorId, r.score);
  }
  const matched = [...units.values()].filter((u) =>
    ["unassisted", "assisted"].every(
      (c) => u.get(c as RatingCondition)?.size === assessors.length,
    ),
  );
  const matrix = (condition: RatingCondition) =>
    matched.map((u) => assessors.map((id) => u.get(condition)!.get(id)!));
  const assistedMatrix = matrix("assisted");
  const drift =
    matched.length >= 2 && assessors.length >= 2
      ? assessors.map((assessorId, i) => {
          const averageScore =
              (assistedMatrix.reduce((s, r) => s + r[i], 0) /
                matched.length /
                3) *
              100,
            groupMean =
              (assistedMatrix.reduce(
                (s, r) => s + r.reduce((a, b) => a + b, 0) / r.length,
                0,
              ) /
                matched.length /
                3) *
              100,
            groupDeviation = averageScore - groupMean;
          return {
            assessorId,
            averageScore,
            groupDeviation,
            reviewRecommended: Math.abs(groupDeviation) >= 10,
          };
        })
      : [];
  return {
    unassisted: agreement(matrix("unassisted")),
    assisted: agreement(assistedMatrix),
    assessors: assessors.length,
    pairedUnits: matched.length,
    excludedUnits: units.size - matched.length,
    totalRatings: ratings.length,
    drift,
  };
}
export function parseRatingsCsv(csv: string): Rating[] {
  if (new TextEncoder().encode(csv).length > 1024 * 1024)
    throw new Error("CSV must be smaller than 1 MB.");
  // RFC-style quoted cells, escaped quotes and CRLF; never evaluate formulas.
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false,
    closed = false;
  const push = () => {
    row.push(cell);
    cell = "";
    closed = false;
  };
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (quoted) {
      if (c === '"') {
        if (csv[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else cell += c;
      continue;
    }
    if (c === '"') {
      if (cell || closed) throw new Error("Invalid CSV quoting.");
      quoted = true;
    } else if (c === ",") {
      push();
    } else if (c === "\r" || c === "\n") {
      if (c === "\r" && csv[i + 1] === "\n") i++;
      push();
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
      if (rows.length > 5001)
        throw new Error("CSV supports at most 5000 ratings.");
    } else {
      if (closed && !/\s/.test(c)) throw new Error("Invalid CSV quoting.");
      cell += c;
    }
  }
  if (quoted) throw new Error("Invalid CSV quoting.");
  push();
  if (row.some((v) => v.trim())) rows.push(row);
  const headers =
      rows.shift()?.map((v) => v.replace(/^\uFEFF/, "").trim()) ?? [],
    required = ["case_id", "assessor_id", "condition", "score"];
  if (
    required.some((h) => !headers.includes(h)) ||
    new Set(headers).size !== headers.length ||
    headers.some((h) => ![...required, "criterion_id"].includes(h))
  )
    throw new Error(
      "Required CSV headers: case_id,assessor_id,condition,score.",
    );
  if (!rows.length || rows.length > 5000)
    throw new Error("CSV supports 1 to 5000 ratings.");
  const ids = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/;
  const result = rows.map((r, i) => {
    if (r.length !== headers.length)
      throw new Error("Invalid CSV row " + (i + 2));
    const get = (key: string) => r[headers.indexOf(key)]?.trim();
    const caseId = get("case_id"),
      assessorId = get("assessor_id"),
      condition = get("condition"),
      criterionId = get("criterion_id") || "overall",
      score = Number(get("score"));
    if (
      !ids.test(caseId) ||
      !ids.test(assessorId) ||
      !ids.test(criterionId) ||
      !["unassisted", "assisted"].includes(condition) ||
      !/^\d$/.test(get("score")) ||
      score < 0 ||
      score > 3
    )
      throw new Error("Invalid CSV row " + (i + 2));
    return {
      caseId,
      assessorId,
      condition: condition as RatingCondition,
      criterionId,
      score,
    };
  });
  compareRatings(result);
  return result;
}
export function syntheticRatings(): Rating[] {
  const result: Rating[] = [];
  for (let i = 0; i < 24; i++)
    for (const condition of ["unassisted", "assisted"] as const)
      for (let a = 0; a < 2; a++) {
        const original = i % 4,
          changed = a === 1 && i < (condition === "unassisted" ? 10 : 5);
        result.push({
          caseId: "demo-case-" + (i + 1),
          assessorId: "demo-assessor-" + (a + 1),
          criterionId: "overall",
          condition,
          score: changed ? (original + 1) % 4 : original,
        });
      }
  return result;
}
