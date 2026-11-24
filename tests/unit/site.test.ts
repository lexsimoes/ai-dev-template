// The product website in site/ (template-only, to be published at https://getadt.online).
// It must stay static, load nothing but its own files and Google Fonts, and agree with the repository on the
// latest release and the install commands.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The Portuguese page (site/pt/) and the deploy workflow come in the next pull request of mission 0048.
const pages = {
  en: readFileSync("site/index.html", "utf-8"),
};

function latestRelease(): string {
  const match = /^## \[(\d+\.\d+\.\d+)\]/m.exec(readFileSync("CHANGELOG.md", "utf-8"));
  assert.ok(match?.[1], "CHANGELOG.md has no released version");
  return match[1];
}

function text(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ");
}

for (const [lang, html] of Object.entries(pages)) {
  test(`site ${lang}: no script file and no external resource but Google Fonts`, () => {
    assert.doesNotMatch(html, /<script[^>]*\ssrc=/i, "scripts stay inline");
    for (const [, url] of html.matchAll(/<link[^>]*rel="(?:stylesheet|preconnect)"[^>]*href="([^"]+)"/g)) {
      assert.ok(
        !/^https?:/.test(url ?? "") || /^https:\/\/fonts\.(googleapis|gstatic)\.com(\/|$)/.test(url ?? ""),
        `unexpected external resource ${url}`,
      );
    }
    assert.doesNotMatch(html, /<(?:img|iframe|video|audio|source)[^>]*\ssrc="https?:/i);
  });

  test(`site ${lang}: shows the latest release from CHANGELOG.md`, () => {
    const version = latestRelease();
    assert.match(html, new RegExp(`releases/tag/v${version.replace(/\./g, "\\.")}"`));
    assert.match(text(html), new RegExp(`v${version.replace(/\./g, "\\.")}`));
    assert.doesNotMatch(html, /releases\/tag\/v(?!\d+\.\d+\.\d+")/);
  });

  test(`site ${lang}: the install commands are the README's`, () => {
    const readme = readFileSync("README.md", "utf-8");
    const commands = [...html.matchAll(/<code id="cmd-\d">([\s\S]*?)<\/code>/g)].map((m) => text(m[1] ?? "").trim());
    assert.equal(commands.length, 2);
    for (const command of commands) assert.ok(readme.includes(command), `README.md does not have: ${command}`);
  });
}

test("site: the English page links to the Portuguese one and declares both", () => {
  assert.match(pages.en, /href="pt\/index\.html" hreflang="pt-BR"/);
  assert.match(pages.en, /<link rel="alternate" hreflang="en" href="https:\/\/getadt\.online\/">/);
  assert.match(pages.en, /<link rel="alternate" hreflang="pt-BR" href="https:\/\/getadt\.online\/pt\/">/);
  assert.match(pages.en, /<html lang="en">/);
});

test("site: template-only, never copied into a project", () => {
  const copier = readFileSync("copier.yml", "utf-8");
  for (const path of ["site", ".github/workflows/site.yml", "tests/unit/site.test.ts"]) {
    assert.match(copier, new RegExp(`^  - ${path.replace(/\./g, "\\.")}$`, "m"), `${path} missing from _exclude`);
  }
});
