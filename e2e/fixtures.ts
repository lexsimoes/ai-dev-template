// Isolation for every end-to-end test: the browser may only talk to the demo app started by
// playwright.config.ts. Any other request is aborted and fails the test, so a flow can never
// reach a real service (an AI provider, a payment API, analytics). Import `test` and `expect` from here.

import { test as base, expect } from "@playwright/test";

export const test = base.extend<{ blockedRequests: string[] }>({
  blockedRequests: [
    async ({ context, baseURL }, use) => {
      const allowed = new URL(baseURL ?? "http://127.0.0.1").origin;
      const blocked: string[] = [];
      await context.route(
        (url) => url.origin !== allowed && url.protocol !== "data:" && url.protocol !== "about:",
        async (route) => {
          blocked.push(route.request().url());
          await route.abort("blockedbyclient");
        },
      );
      await use(blocked);
      expect(blocked, "requests outside the demo app were blocked: a flow must not leave the isolated environment").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
