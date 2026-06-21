import { test } from "node:test";
import assert from "node:assert/strict";

import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import { attach } from "remark-stay";

import rehypeStay from "../src/index.js";
import { attachIds } from "../src/emit.js";

/** Run the full bridge pipeline; return the HTML string. */
async function toHtml(md, options) {
  const out = await unified()
    .use(remarkParse)
    .use(rehypeStay, options)
    .use(remarkRehype)
    .use(rehypeStringify)
    .process(md);
  return String(out);
}

/** Parse to mdast only (for attachIds unit tests). */
function toMdast(md) {
  const proc = unified().use(remarkParse);
  return { tree: proc.parse(md), source: md };
}

test("trailing marker -> id on the paragraph element", async () => {
  const html = await toHtml("A para. <!-- stay:para1 -->");
  assert.match(html, /<p id="para1">/);
});

test("heading marker -> id on the heading element", async () => {
  const html = await toHtml("## A heading <!-- stay:head1 -->");
  assert.match(html, /<h2 id="head1">/);
});

test("marker-only chunk -> id on the preceding block", async () => {
  const html = await toHtml("A para.\n\n<!-- stay:chunk1 -->");
  assert.match(html, /<p id="chunk1">A para\.<\/p>/);
});

test("list marker -> id on the whole list (§5.1)", async () => {
  const html = await toHtml("- one\n- two\n<!-- stay:list1 -->");
  assert.match(html, /<ul id="list1">/);
});

test("marker-shaped text inside a fence is never an id (§5.2)", async () => {
  const html = await toHtml("```js\n// <!-- stay:notamarker -->\nconst x = 1;\n```");
  assert.ok(!html.includes('id="notamarker"'), "fence-internal marker text must not emit an id");
});

test("marker comments are dropped from output (clean HTML, no allowDangerousHtml)", async () => {
  const html = await toHtml("A para. <!-- stay:p -->");
  assert.ok(!html.includes("<!--"), "no HTML comment should remain in output");
});

test("prefix is prepended to the emitted id", async () => {
  const html = await toHtml("A para. <!-- stay:p1 -->", { prefix: "stay-" });
  assert.match(html, /<p id="stay-p1">/);
});

test("orphan marker (no preceding block) emits no id and is reported", () => {
  const { tree, source } = toMdast("<!-- stay:orphan -->\n\n# later");
  const { attached, findings } = attachIds(tree, source);
  assert.ok(!attached.some((a) => a.action === "set"), "orphan must not set an id");
  assert.ok(findings.some((f) => f.code === "ORPHAN_MARKER" || /orphan/i.test(f.code) || /orphan/i.test(f.message)), "orphan should be a finding");
});

test("duplicate id across the doc: first emits, second is skip-dup, never duplicated", () => {
  const { tree, source } = toMdast("A. <!-- stay:dup -->\n\nB. <!-- stay:dup -->");
  const { attached } = attachIds(tree, source);
  const sets = attached.filter((a) => a.id === "dup" && a.action === "set");
  const skips = attached.filter((a) => a.id === "dup" && a.action === "skip-dup");
  assert.equal(sets.length, 1, "exactly one element gets the id");
  assert.equal(skips.length, 1, "the duplicate is skipped");
});

test("two stays on one block: first wins the element id, extra is skip-extra + warned", () => {
  const { tree, source } = toMdast("A para. <!-- stay:first --> <!-- stay:second -->");
  const { attached, findings } = attachIds(tree, source);
  const first = attached.find((a) => a.id === "first");
  const second = attached.find((a) => a.id === "second");
  assert.equal(first.action, "set");
  assert.equal(second.action, "skip-extra");
  assert.ok(findings.some((f) => f.code === "EXTRA_STAY"), "extra stay should warn");
});

test("idClash stay-wins overwrites an existing hProperties.id; keep-existing/skip do not", () => {
  for (const policy of ["stay-wins", "keep-existing", "skip"]) {
    const { tree, source } = toMdast("A para. <!-- stay:winner -->");
    // simulate an earlier plugin having set an id
    const para = tree.children[0];
    para.data = { hProperties: { id: "preexisting" } };
    const { attached } = attachIds(tree, source, { idClash: policy });
    const entry = attached.find((a) => a.id === "winner");
    if (policy === "stay-wins") {
      assert.equal(para.data.hProperties.id, "winner", "stay-wins overwrites");
      assert.equal(entry.action, "set");
    } else {
      assert.equal(para.data.hProperties.id, "preexisting", `${policy} keeps existing`);
      assert.equal(entry.action, "skip-clash");
    }
  }
});

test("raw HTML block: stay is skip-unemittable, no id, UNEMITTABLE warning", async () => {
  const md = "<div>raw block</div>\n<!-- stay:rawid -->";
  const { tree, source } = toMdast(md);
  const { attached, findings } = attachIds(tree, source);
  const entry = attached.find((a) => a.id === "rawid");
  assert.equal(entry.action, "skip-unemittable");
  assert.ok(findings.some((f) => f.code === "UNEMITTABLE"));
  const html = await toHtml(md);
  assert.ok(!html.includes('id="rawid"'), "raw HTML block must not emit an id");
});

test("clash then duplicate: a clash-skipped first occurrence still blocks a later duplicate", () => {
  // Block A's stay is clash-skipped (pre-existing id); block B repeats the same id.
  const { tree, source } = toMdast("A para. <!-- stay:dupx -->\n\nB para. <!-- stay:dupx -->");
  tree.children[0].data = { hProperties: { id: "preexisting" } };
  const { attached } = attachIds(tree, source, { idClash: "skip" });
  const a = attached.filter((x) => x.id === "dupx");
  assert.equal(a[0].action, "skip-clash", "first occurrence clash-skipped");
  assert.equal(a[1].action, "skip-dup", "later duplicate is skip-dup, never emitted");
  assert.ok(!a.some((x) => x.action === "set"), "the clashed id is never emitted on a later block");
});

test("two distinct stays on a clash-blocked block: extras report skip-clash, not skip-extra", () => {
  const { tree, source } = toMdast("A para. <!-- stay:one --> <!-- stay:two -->");
  tree.children[0].data = { hProperties: { id: "preexisting" } };
  const { attached } = attachIds(tree, source, { idClash: "keep-existing" });
  assert.equal(attached.find((a) => a.id === "one").action, "skip-clash");
  assert.equal(attached.find((a) => a.id === "two").action, "skip-clash");
});

test("clean-doc parity: emitted ids == remark-stay attach() ids (no dups/extras)", () => {
  const md = [
    "Intro. <!-- stay:a -->",
    "",
    "## Heading <!-- stay:b -->",
    "",
    "- one",
    "- two",
    "<!-- stay:c -->",
  ].join("\n");
  const { tree, source } = toMdast(md);
  const emitted = attachIds(tree, source).attached.filter((a) => a.action === "set").map((a) => a.id).sort();
  const fromAttach = attach(toMdast(md).tree, source).filter((s) => !s.orphan && !s.malformed).map((s) => s.id).sort();
  assert.deepEqual(emitted, fromAttach);
});
