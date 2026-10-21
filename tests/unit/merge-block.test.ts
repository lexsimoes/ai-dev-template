// Throwaway test for the merge-block check after M-EN: it fails on purpose. This PR is never merged.
import { test } from "node:test";
import assert from "node:assert/strict";

test("merge block: a red required check must block the merge", () => {
  assert.equal(1, 2, "intentional failure");
});
