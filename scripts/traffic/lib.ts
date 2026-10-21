// Pure parts of the traffic export (no network): GitHub's 14-day traffic window merged into versioned CSV files.
// Tested in tests/unit/traffic.test.ts.

export interface DailyCount {
  timestamp: string;
  count: number;
  uniques: number;
}

export const DAILY_HEADER = ["date", "count", "uniques"];
export const PATHS_HEADER = ["captured", "path", "title", "count", "uniques"];
export const REFERRERS_HEADER = ["captured", "referrer", "count", "uniques"];

/** Reads a CSV written by toCsv (quoted fields, "" inside quotes). Returns the rows without the header. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field || row.length) rows.push([...row, field]);
  return rows.slice(1);
}

/**
 * Titles and referrers come from outside (page titles, other sites): a cell that starts like a formula
 * (= + - @), or with a tab or carriage return (which some spreadsheets skip before reading a formula),
 * gets a leading apostrophe, so a spreadsheet never runs it.
 */
function cell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(header: string[], rows: string[][]): string {
  return [header, ...rows].map((r) => r.map(cell).join(",")).join("\n") + "\n";
}

/** Daily counts merged by date. For a date in both, GitHub's number wins: the latest days are still being counted. */
export function mergeDaily(existingCsv: string, days: DailyCount[]): string {
  const byDate = new Map(parseCsv(existingCsv).map((r) => [r[0] ?? "", r]));
  for (const d of days) byDate.set(d.timestamp.slice(0, 10), [d.timestamp.slice(0, 10), String(d.count), String(d.uniques)]);
  return toCsv(DAILY_HEADER, [...byDate.values()].sort((a, b) => (a[0] ?? "").localeCompare(b[0] ?? "")));
}

/**
 * Snapshot of a top-10 list (GitHub gives only totals for the last 14 days, not per day): the rows captured
 * on `captured` are replaced, every other snapshot is kept.
 */
export function mergeSnapshot(existingCsv: string, header: string[], captured: string, rows: string[][]): string {
  const kept = parseCsv(existingCsv).filter((r) => r[0] !== captured);
  return toCsv(header, [...kept, ...rows.map((r) => [captured, ...r])]);
}

// ---------- alert issue ----------

export const ALERT_MARKER = "<!-- traffic-export-alert -->";
export const ALERT_LABEL = "traffic-export";
/** Days before the token expires when the export starts warning (one weekly run is enough to react). */
export const EXPIRY_WARNING_DAYS = 30;

/** Why the traffic API refused the token, in words the owner can act on. */
export function failureReason(status: number | "missing"): string {
  if (status === "missing") return "`TRAFFIC_TOKEN` is not set (or is empty).";
  if (status === 401) return "`TRAFFIC_TOKEN` was rejected (HTTP 401): it has expired or was revoked.";
  if (status === 403 || status === 404) {
    return `\`TRAFFIC_TOKEN\` cannot read this repository's traffic (HTTP ${status}): it needs "Administration: Read-only" on this repository.`;
  }
  return `The GitHub traffic API answered HTTP ${status}.`;
}

/** Expiration of a fine-grained token, from the `github-authentication-token-expiration` header ("2027-10-21 20:00:00 UTC"). */
export function parseExpiry(header: string | null): Date | null {
  const m = header ? /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})(?: UTC| \+0000)?$/.exec(header.trim()) : null;
  return m ? new Date(`${m[1]}T${m[2]}Z`) : null;
}

/** Days until the token expires, if that is within the warning window; otherwise null. */
export function expiresSoon(expiry: Date | null, now: Date): number | null {
  if (!expiry) return null;
  const days = Math.floor((expiry.getTime() - now.getTime()) / 86_400_000);
  return days <= EXPIRY_WARNING_DAYS ? days : null;
}

const FIX_STEPS = [
  "**How to fix:**",
  "1. GitHub → **Settings → Developer settings → Fine-grained tokens** → regenerate this token (or **Generate new token**: only this repository, **Administration: Read-only**, nothing else).",
  "2. In your own terminal (never in a chat): `gh secret set TRAFFIC_TOKEN`.",
  "3. **Actions → Traffic export → Run workflow**. When it works, this issue closes on its own.",
];

export function renderAlert(input: { kind: "failure"; reason: string; runUrl: string } | { kind: "expiring"; days: number; runUrl: string }): { title: string; body: string } {
  if (input.kind === "expiring") {
    return {
      title: `Traffic export: TRAFFIC_TOKEN expires in ${input.days} day(s)`,
      body: [
        ALERT_MARKER,
        `⚠️ The traffic export still works, but \`TRAFFIC_TOKEN\` expires in **${input.days} day(s)**. After that, every run fails and GitHub's 14-day traffic window starts to slip away.`,
        "",
        ...FIX_STEPS,
        "",
        `Last run: ${input.runUrl}`,
      ].join("\n"),
    };
  }
  return {
    title: "Traffic export failed: traffic data is not being saved",
    body: [
      ALERT_MARKER,
      `❌ **The weekly traffic export failed.** ${input.reason}`,
      "",
      "GitHub keeps traffic for 14 days only: each week this stays broken loses data for good.",
      "",
      ...FIX_STEPS,
      "",
      `Failed run: ${input.runUrl}`,
    ].join("\n"),
  };
}
