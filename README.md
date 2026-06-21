# rehype-stay , markstay block ids to HTML anchors

[![npm](https://img.shields.io/npm/v/rehype-stay)](https://www.npmjs.com/package/rehype-stay)
[![bundle size](https://img.shields.io/bundlephobia/minzip/rehype-stay)](https://bundlephobia.com/package/rehype-stay)
[![tests](https://img.shields.io/github/actions/workflow/status/markstaymd/rehype-stay/test.yml?label=tests)](https://github.com/markstaymd/rehype-stay/actions/workflows/test.yml)
[![spec](https://img.shields.io/badge/spec-v1.1-blue)](https://markstay.org)
![License](https://img.shields.io/npm/l/rehype-stay)

Make a [markstay](https://markstay.org) deep link work in a browser. The markstay
spec gives every block a stable id and a link-shaped address (`doc.md#stay-id`,
§12), but a browser only honours that fragment if the rendered HTML has an element
with `id="stay-id"`. This package emits that id.

It does not fork the algorithm: attachment comes from
[`remark-stay`](https://www.npmjs.com/package/remark-stay)'s tree segmentation, so
which block a stay binds to is identical to the rest of the markstay
implementations.

## How it works (and why it is a remark plugin)

The id has to be set on the mdast node **before** `remark-rehype` turns the tree
into HTML, so the mechanism is a remark-stage transform that sets
`node.data.hProperties.id`. `mdast-util-to-hast` honours `hProperties`, so
`remark-rehype` emits `<el id="stay-id">` natively. That means:

- no `allowDangerousHtml`, no `rehype-raw`, no scanning for HTML comments;
- the marker comments are dropped from the output for free (clean HTML);
- a marker-shaped line inside a fenced code block stays literal text, never an id.

The package is named `rehype-stay` because its job is the rehype/HTML half of
markstay (the rendered anchor), even though the plugin itself runs at the remark
stage.

## Install

```sh
npm install rehype-stay
```

Pulls in `remark-stay` (and `markstay` transitively) plus `unist-util-visit`.
Requires Node >= 22.

## Usage

```js
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import rehypeStay from "rehype-stay";

const file = await unified()
  .use(remarkParse)
  .use(rehypeStay)        // BEFORE remark-rehype
  .use(remarkRehype)
  .use(rehypeStringify)
  .process("## Install steps <!-- stay:install -->\n\nRun the command.");

String(file);
// => <h2 id="install">Install steps</h2>\n<p>Run the command.</p>
```

Now `page.html#install` scrolls to the heading.

### With `rehype-slug`

Run `rehype-stay` before `rehype-slug`. `rehype-slug` only fills elements that
lack an id, so stay-marked headings keep their stay id and unmarked headings still
get a slug. No configuration needed.

## Public API

Default export: the `rehypeStay` plugin.

| Option | Default | Meaning |
|--------|---------|---------|
| `idClash` | `'stay-wins'` | When a node already has an `hProperties.id` (rare, mdast-stage): `'stay-wins'` overwrites, `'keep-existing'` / `'skip'` leave it and warn. |
| `prefix` | `''` | Prepend to every emitted id, e.g. `'stay-'`. |
| `extraStays` | `'skip'` | 2nd+ stay on one block. One HTML id per element, so extras are skipped and warned. `'anchor'` is reserved for a later raw-HTML mode. |
| `mdx` | `false` | Detect MDX comment-expression markers (needs `remark-mdx` upstream). |
| `lint` | `true` | Emit each finding as a vfile message. |
| `annotate` | `false` | Attach `file.data.stay = { attached, findings }`. |
| `fail` | `false` | Make error-level findings fatal so the run exits non-zero. |

Named export `attachIds(tree, source, opts?)`: the pure transform. Mutates the
tree and returns `{ tree, attached, findings }`, where each `attached` entry is
`{ id, action, previousId, reason, nodeType, line }` and `action` is one of `set`,
`skip-clash`, `skip-dup`, `skip-extra`, `skip-unemittable`.

## Attachment rules

One stay identifies one whole block (SPEC §5.1), so the id lands on that block's
element: a paragraph, heading, the whole list, the whole blockquote, the whole
table. A marker on its own line after a block (a marker-only chunk) binds the
preceding block.

- **First stay wins the element id.** A second stay on the same block is reported
  (`EXTRA_STAY`) and not emitted, because an element can carry only one `id`.
- **Duplicate id** across the document (invalid per §7): the first occurrence in
  document order owns the id, every later one is skipped (`skip-dup`); the
  duplicate is also a core finding.
- **Orphan** marker (no preceding block) and **malformed** markers emit no id.
- **Raw HTML blocks emit no id** (`skip-unemittable`). A stay on a Markdown raw
  HTML block (e.g. `<div>...</div> <!-- stay:x -->`) has no element to carry an
  id: default `remark-rehype` drops the HTML. Use a normal Markdown block, or wait
  for the raw-HTML mode (see Out of scope).

### Findings

`ORPHAN_MARKER` and `DUPLICATE_ID` come from the markstay core; `ID_CLASH`,
`EXTRA_STAY`, and `UNEMITTABLE` are emission findings. With `lint: true` they
surface as vfile messages (`source: "rehype-stay"`); with `fail: true` error-level
findings make the run exit non-zero.

## Quirk: code fences

A stay bound to a fenced code block lands the id on the inner `<code>` (mdast
`code` becomes `<pre><code>`). The fragment still resolves; the scroll target is
the `<code>` element.

## Out of scope (v0.1)

- The rehype-only mode (scan an existing hast tree for stay comments) is a
  follow-up, for pipelines that already hold HTML/HAST.
- Synthetic anchors for extra stays on a block (`extraStays: 'anchor'`).
- Source-slice hash-drift checking: drift is a Markdown-source concern, handled by
  `remark-stay` / the `markstay` CLI, not by this renderer-side plugin.

## Running the tests

```sh
npm install
npm test
```

## License

MIT
