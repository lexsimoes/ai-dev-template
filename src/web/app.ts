// Demo web app: the store's checkout (coupon, INV-001), the contact form and the support inbox
// (messages classified by the LLM, INV-002). Server-rendered HTML, no scripts. Run: npm start.

import type { IncomingMessage, ServerResponse } from "node:http";
import { CATEGORIES, classifyMessage } from "../ai/classify-message.ts";
import type { Category, Classification } from "../ai/classify-message.ts";
import type { LLMClient } from "../ai/llm.ts";
import { applyCoupon, isCouponActive } from "../pricing.ts";
import type { Coupon } from "../pricing.ts";
import { escapeHtml, formatPrice, page } from "./html.ts";

export const CART = [
  { name: "Canvas tote bag", cents: 2_000 },
  { name: "Ceramic mug", cents: 3_000 },
];

// Demo coupons. A real store reads them from its database.
export const COUPONS: Coupon[] = [
  { code: "WELCOME10", percentOff: 10 },
  { code: "HALF", percentOff: 50 },
  { code: "SUMMER20", percentOff: 20, expiresAt: "2025-08-31" },
];

export const MAX_MESSAGE_CHARS = 2_000;
// The limit as the page and its errors state it. The browser counts a line break as one character; the form sends it
// as CRLF, so the server turns CRLF back into LF before counting.
const STATED_LIMIT = `${MAX_MESSAGE_CHARS.toLocaleString("en-US")} characters (a line break counts as one)`;
// Room for a message at the limit in any alphabet: one UTF-16 unit takes at most 9 bytes once form-encoded
// (3 UTF-8 bytes, each as %XX), plus the field name.
const MAX_BODY_BYTES = MAX_MESSAGE_CHARS * 9 + 1_024;

export interface SupportMessage {
  text: string;
  receivedAt: Date;
  classification: Classification;
}

export interface AppOptions {
  llm: LLMClient;
  now?: () => Date;
}

const TOPIC_LABEL: Record<Category, string> = {
  exchange: "Exchange",
  delivery: "Delivery",
  payment: "Payment",
  other: "Other",
};

class BodyTooLarge extends Error {}

async function readForm(req: IncomingMessage): Promise<URLSearchParams> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new BodyTooLarge();
    chunks.push(chunk as Buffer);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString("utf-8"));
}

function send(res: ServerResponse, status: number, html: string): void {
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    // No scripts at all: even if some text escaped the HTML escaping, it could not run.
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  });
  res.end(html);
}

function redirect(res: ServerResponse, location: string): void {
  res.writeHead(303, { Location: location });
  res.end();
}

const longDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

function checkoutPage(input: { code?: string; now: Date }): { status: number; html: string } {
  const subtotal = CART.reduce((sum, item) => sum + item.cents, 0);
  const code = input.code?.trim().toUpperCase() ?? "";
  const coupon = code ? (COUPONS.find((c) => c.code === code) ?? null) : null;
  let notice = "";
  let status = 200;
  let applied: Coupon | null = null;
  if (code && !coupon) {
    status = 422;
    notice = `<p class="notice error" role="alert" id="coupon-error">We don't recognize the code “${escapeHtml(code)}”. Check the spelling, or pay without a coupon.</p>`;
  } else if (coupon && !isCouponActive(coupon, input.now)) {
    notice = `<p class="notice error" role="alert" id="coupon-error">The code ${escapeHtml(coupon.code)} expired on ${longDate(coupon.expiresAt ?? "")}. Your total has no discount.</p>`;
  } else if (coupon) {
    applied = coupon;
    notice = `<p class="notice ok" role="status">Code ${escapeHtml(coupon.code)} applied: ${coupon.percentOff}% off.</p>`;
  }
  const total = applyCoupon(subtotal, applied, input.now);
  const items = CART.map((i) => `<li><span>${escapeHtml(i.name)}</span><span>${formatPrice(i.cents)}</span></li>`).join("");
  const discount = applied ? `<li><span>Discount (${escapeHtml(applied.code)})</span><span>−${formatPrice(subtotal - total)}</span></li>` : "";
  const invalid = status === 422 || (coupon !== null && applied === null);
  const body = `
<h1>Checkout</h1>
<p class="lead">Review your order and add a discount code if you have one.</p>
<section class="panel" aria-label="Order summary">
  <ul class="lines">
    ${items}
    <li><span class="muted">Subtotal</span><span>${formatPrice(subtotal)}</span></li>
    ${discount}
    <li class="total"><span>Total</span><span data-testid="total">${formatPrice(total)}</span></li>
  </ul>
</section>
<form method="post" action="/checkout" novalidate>
  <label for="coupon">Discount code <span class="muted">(optional)</span></label>
  <div class="row">
    <input type="text" id="coupon" name="coupon" autocomplete="off" value="${escapeHtml(code)}"${invalid ? ' aria-invalid="true" aria-describedby="coupon-error"' : ""}>
    <button type="submit">Apply code</button>
  </div>
  ${notice}
</form>`;
  return { status, html: page({ title: "Checkout", path: "/", body }) };
}

function contactPage(input: { sent?: boolean; error?: string; text?: string }): string {
  const error = input.error ? `<p class="notice error" role="alert" id="message-error">${escapeHtml(input.error)}</p>` : "";
  const sent = input.sent ? `<p class="notice ok" role="status">Thanks, we got your message. Our team replies within one business day.</p>` : "";
  const body = `
<h1>Contact us</h1>
<p class="lead">Tell us what happened with your order. A person from our team reads every message.</p>
${sent}
<form method="post" action="/contact" novalidate>
  <label for="message">Your message</label>
  <p class="hint" id="message-hint">Up to ${STATED_LIMIT}. Include your order number if you have it.</p>
  <textarea id="message" name="message" maxlength="${MAX_MESSAGE_CHARS}" aria-describedby="message-hint${input.error ? " message-error" : ""}"${input.error ? ' aria-invalid="true"' : ""}>${escapeHtml(input.text ?? "")}</textarea>
  ${error}
  <div class="actions"><button type="submit">Send message</button></div>
</form>`;
  return page({ title: "Contact us", path: "/contact", body });
}

const FILTERS: Array<{ key: string; label: string; match: (m: SupportMessage) => boolean }> = [
  { key: "all", label: "All", match: () => true },
  { key: "needs-person", label: "Needs a person", match: (m) => m.classification.needsHuman },
  ...CATEGORIES.map((c) => ({ key: c, label: TOPIC_LABEL[c], match: (m: SupportMessage) => !m.classification.needsHuman && m.classification.category === c })),
];

function ago(from: Date, now: Date): string {
  const minutes = Math.floor((now.getTime() - from.getTime()) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours} h ago` : from.toLocaleDateString("en-US", { day: "numeric", month: "short", timeZone: "UTC" });
}

function supportPage(input: { messages: SupportMessage[]; topic: string; now: Date }): string {
  const filter = FILTERS.find((f) => f.key === input.topic) ?? FILTERS[0];
  const shown = input.messages.filter((m) => filter?.match(m) ?? true);
  const filters = FILTERS.map(
    (f) => `<li><a href="/support${f.key === "all" ? "" : `?topic=${f.key}`}"${f === filter ? ' aria-current="page"' : ""}>${f.label}</a></li>`,
  ).join("");
  const rows = shown
    .map((m) => {
      const topic = m.classification.needsHuman
        ? `<span class="flag">Needs a person</span>`
        : `<span class="topic">${TOPIC_LABEL[m.classification.category]}</span>`;
      const summary = m.classification.summary ? `<p class="muted">${escapeHtml(m.classification.summary)}</p>` : "";
      return `<li><div class="meta">${topic}<span class="muted">· ${ago(m.receivedAt, input.now)}</span></div><p class="text">${escapeHtml(m.text)}</p>${summary}</li>`;
    })
    .join("");
  const empty =
    input.messages.length === 0
      ? `<p class="empty">No messages yet. Messages sent through <a href="/contact">Contact us</a> show up here.</p>`
      : `<p class="empty">No messages in this topic. <a href="/support">Show all messages</a>.</p>`;
  const body = `
<h1>Support inbox</h1>
<p class="lead">Customer messages, newest first, sorted by topic. Anything the AI could not sort is marked “Needs a person”.</p>
<nav aria-label="Topics"><ul class="filters">${filters}</ul></nav>
<section class="panel" aria-label="Messages">${shown.length > 0 ? `<ul class="feed">${rows}</ul>` : empty}</section>`;
  return page({ title: "Support inbox", path: "/support", body, wide: true });
}

export function createApp(options: AppOptions): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  const now = options.now ?? (() => new Date());
  const messages: SupportMessage[] = [];

  return async (req, res) => {
    let url: URL;
    try {
      url = new URL(req.url ?? "/", "http://localhost");
    } catch {
      // A malformed request line (e.g. "GET //") is the client's error, not a reason to stop the server.
      send(res, 400, page({ title: "Bad request", path: "", body: `<h1>Bad request</h1><p class="lead">This address is not valid. <a href="/">Go to checkout</a>.</p>` }));
      return;
    }
    try {
      if (req.method === "GET" && url.pathname === "/") {
        send(res, 200, checkoutPage({ now: now() }).html);
      } else if (req.method === "POST" && url.pathname === "/checkout") {
        const form = await readForm(req);
        const result = checkoutPage({ code: form.get("coupon") ?? "", now: now() });
        send(res, result.status, result.html);
      } else if (req.method === "GET" && url.pathname === "/contact") {
        send(res, 200, contactPage({ sent: url.searchParams.get("sent") === "1" }));
      } else if (req.method === "POST" && url.pathname === "/contact") {
        const text = ((await readForm(req)).get("message") ?? "").replace(/\r\n?/g, "\n").trim();
        if (!text) {
          send(res, 422, contactPage({ error: "Write a message before sending it." }));
        } else if (text.length > MAX_MESSAGE_CHARS) {
          send(res, 422, contactPage({ error: `Your message has ${text.length.toLocaleString("en-US")} characters; the limit is ${STATED_LIMIT}. Shorten it and send it again.`, text }));
        } else {
          // A failed model call never loses the message: it goes to a person.
          const classification = await classifyMessage(text, options.llm).catch((error: unknown): Classification => {
            console.error("classification failed; the message is marked for a person:", error);
            return { category: "other", summary: "", needsHuman: true };
          });
          messages.unshift({ text, receivedAt: now(), classification });
          redirect(res, "/contact?sent=1");
        }
      } else if (req.method === "GET" && url.pathname === "/support") {
        send(res, 200, supportPage({ messages, topic: url.searchParams.get("topic") ?? "all", now: now() }));
      } else {
        send(res, 404, page({ title: "Page not found", path: "", body: `<h1>Page not found</h1><p class="lead">This page does not exist. <a href="/">Go to checkout</a>.</p>` }));
      }
    } catch (error) {
      if (error instanceof BodyTooLarge) {
        // The same limit guards every form: answer on the page the customer came from.
        const html =
          url.pathname === "/contact"
            ? contactPage({ error: "Your message is too long. Shorten it and send it again." })
            : page({ title: "Too much data", path: "", body: `<h1>Too much data</h1><p class="lead">What you sent is too long. <a href="/">Go back to checkout</a> and try again.</p>` });
        send(res, 413, html);
        return;
      }
      console.error(error);
      send(res, 500, page({ title: "Something went wrong", path: "", body: `<h1>Something went wrong</h1><p class="lead">We could not finish that. Try again in a moment, or <a href="/">go back to checkout</a>.</p>` }));
    }
  };
}
