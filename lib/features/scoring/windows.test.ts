import assert from "node:assert/strict";
import test from "node:test";
import { CALENDAR, endOfMonth, mad, median, monthIndex, percentile, window } from "@/lib/features/scoring/windows";

test("calendar covers 2024-09..2026-08", () => {
  assert.equal(CALENDAR.length, 24);
  assert.equal(CALENDAR[0], "2024-09");
  assert.equal(CALENDAR[23], "2026-08");
  assert.equal(monthIndex("2025-01"), 4);
  assert.equal(endOfMonth("2025-02"), "2025-02-28");
  assert.equal(endOfMonth("2024-12"), "2024-12-31");
});

test("robust statistics", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([]), null);
  assert.equal(mad([1, 2, 3, 4, 100]), 1);
  assert.equal(percentile([1, 2, 3, 4], 0.5), 2.5);
});

test("window returns the last n calendar slots, padding with undefined", () => {
  const items = ["a", "b", "c"];
  assert.deepEqual(window(items, 2, 6), [undefined, undefined, undefined, "a", "b", "c"]);
  assert.deepEqual(window(items, 1, 2), ["a", "b"]);
});
