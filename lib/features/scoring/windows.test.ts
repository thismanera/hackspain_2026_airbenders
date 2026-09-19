import assert from "node:assert/strict";
import test from "node:test";
import { PARAMS } from "@/lib/features/scoring/params";
import {
  CALENDAR,
  clamp,
  divide,
  endOfMonth,
  mad,
  median,
  monthIndex,
  percentile,
  sum,
  window,
} from "@/lib/features/scoring/windows";

test("calendar is derived from the parameter window", () => {
  assert.equal(CALENDAR.length, 24);
  assert.equal(CALENDAR[0], PARAMS.mesInicio);
  assert.equal(CALENDAR[CALENDAR.length - 1], PARAMS.mesFin);
  assert.equal(monthIndex("2025-01"), 4);
  assert.equal(monthIndex("2020-01"), -1);
  assert.equal(endOfMonth("2025-02"), "2025-02-28");
  assert.equal(endOfMonth("2024-02"), "2024-02-29");
  assert.equal(endOfMonth("2024-12"), "2024-12-31");
});

test("robust statistics", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(median([]), null);
  assert.equal(mad([1, 2, 3, 4, 100]), 1);
  assert.equal(sum([]), 0);
  assert.equal(sum([1, 2, 3.5]), 6.5);
  assert.equal(percentile([1, 2, 3, 4], 0.5), 2.5);
  assert.equal(percentile([], 0.5), null);
});

test("clamp and divide guard the degenerate cases", () => {
  assert.equal(clamp(1.5), 1);
  assert.equal(clamp(-0.5), 0);
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-30, -20, 20), -20);
  assert.equal(divide(10, 4), 2.5);
  assert.equal(divide(10, 0), null);
  assert.equal(divide(10, -4), null);
});

test("window returns the last n calendar slots, padding with undefined", () => {
  const items = ["a", "b", "c"];
  assert.deepEqual(window(items, 2, 6), [undefined, undefined, undefined, "a", "b", "c"]);
  assert.deepEqual(window(items, 1, 2), ["a", "b"]);
});
