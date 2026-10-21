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
 * (= + - @) gets a leading apostrophe, so a spreadsheet never runs it.
 */
function cell(value: string): string {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
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
