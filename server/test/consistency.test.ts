import { test } from "node:test";
import assert from "node:assert/strict";
import {
  agreement,
  compareRatings,
  parseRatingsCsv,
  syntheticRatings,
} from "../../shared/consistency.js";
test("Cohen and Fleiss Kappa agree with hand-calculated matrices; degenerate panels stay undefined", () => {
  assert.ok(
    Math.abs(
      agreement([
        [0, 0],
        [1, 1],
        [2, 2],
        [3, 2],
      ])!.kappa! -
        2 / 3,
    ) < 1e-10,
  );
  assert.ok(
    Math.abs(
      agreement([
        [0, 0, 0],
        [1, 1, 1],
        [2, 2, 3],
        [3, 3, 2],
      ])!.kappa! -
        5 / 9,
    ) < 1e-10,
  );
  assert.equal(
    agreement([
      [0, 0],
      [0, 0],
    ])!.kappa,
    null,
  );
  assert.equal(agreement([[0, 1]]), null);
  assert.equal(
    agreement([
      [0, 1],
      [1, 0],
    ])!.kappa,
    -1,
  );
  assert.equal(
    agreement([
      [0, 1],
      [1, 4],
    ]),
    null,
  );
});
test("paired comparisons exclude incomplete or mismatched panels and synthetic metrics are computed", () => {
  const ratings = syntheticRatings(),
    value = compareRatings(ratings);
  assert.equal(value.pairedUnits, 24);
  assert.equal(value.totalRatings, 96);
  assert.equal(value.unassisted!.metric, "Cohen’s Kappa");
  assert.ok(value.assisted!.kappa! > value.unassisted!.kappa!);
  const incomplete = compareRatings(ratings.slice(1));
  assert.equal(incomplete.pairedUnits, 23);
  assert.equal(incomplete.excludedUnits, 1);
  assert.throws(() => compareRatings([...ratings, ratings[0]]), /Duplicate/);
});
test("CSV validates required headers, quoted records, bounds, duplicate cells and category scales", () => {
  const header = "case_id,assessor_id,condition,score\r\n";
  assert.equal(
    parseRatingsCsv(header + '"case-1",assessor-1,unassisted,2')[0].score,
    2,
  );
  for (const bad of [
    header + "c,a,unassisted,4",
    header + "c,a,assisted,",
    header + "c,a,unknown,1",
    header + "=cmd,a,assisted,1",
    header + "c,a,assisted,2\nc,a,assisted,2",
    "case,assessor,score\nc,a,1",
    header + '"broken,a,assisted,2',
  ])
    assert.throws(() => parseRatingsCsv(bad));
  assert.throws(() => parseRatingsCsv("x".repeat(1024 * 1024 + 1)), /1 MB/);
});
