// Starts the demo web app: `npm start` (http://127.0.0.1:3000).
// APP_ENV=e2e is the isolated mode of the end-to-end tests: only the fake AI provider is accepted,
// so a test run can never call a real model or spend a key.

import { createServer } from "node:http";
import { createLLMClient } from "../ai/llm.ts";
import { createApp } from "./app.ts";

/** The LLM provider for this environment; in e2e mode anything but the fake provider is refused. */
export function providerFor(env: NodeJS.ProcessEnv): string {
  const provider = env.LLM_PROVIDER || "mock";
  if (env.APP_ENV === "e2e" && provider !== "mock") {
    throw new Error(`APP_ENV=e2e accepts only LLM_PROVIDER=mock (got "${provider}"): end-to-end tests never call a real model`);
  }
  return provider;
}

if (import.meta.main) {
  const port = Number(process.env.PORT ?? 3000);
  const app = createApp({ llm: createLLMClient({ provider: providerFor(process.env) }) });
  createServer((req, res) => {
    // Backstop: an unexpected error answers 500 and is logged; it never takes the server down.
    app(req, res).catch((error: unknown) => {
      console.error(error);
      if (!res.headersSent) res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Something went wrong. Try again in a moment.");
    });
  }).listen(port, "127.0.0.1", () => {
    console.log(`Demo store on http://127.0.0.1:${port}`);
  });
}
