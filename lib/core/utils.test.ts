import assert from "node:assert/strict";
import { test } from "node:test";

import { cn } from "./utils";

test("cn merges class names and drops falsy values", () => {
  assert.equal(cn("a", false, "c"), "a c");
});
