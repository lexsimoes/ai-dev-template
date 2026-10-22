// External commands (git, gh) run without a shell: arguments go as a list, never as one string to parse.

import { spawnSync } from "node:child_process";

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

export type Run = (cmd: string, args: string[]) => RunResult;

export const run: Run = (cmd, args) => {
  const r = spawnSync(cmd, args, { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 16 * 1024 * 1024 });
  // A missing program (e.g. gh not installed) is not an exception: it is a failed run with a reason.
  if (r.error) return { code: 127, stdout: "", stderr: r.error.message };
  return { code: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
};
