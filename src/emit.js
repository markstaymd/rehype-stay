// rehype-stay core: turn each stay into an HTML `id=` so the §12 address
// `doc.md#stay-id` resolves in a browser. The mechanism is the mdast `hProperties`
// bridge: segment the tree with remark-stay's `extractBlocks` (so attachment is
// byte-identical to remark-stay, the single source of the algorithm), then set
// `node.data.hProperties.id` on each block's bound node. `mdast-util-to-hast`
// honours `hProperties`, so `remark-rehype` emits `<el id="...">` natively , no
// HTML-comment survival, no hast position matching, and marker comments are dropped
// for free (mdast `html` nodes are omitted without `allowDangerousHtml`).
//
// This is a REMARK-stage transform (it runs on mdast, before `remark-rehype`),
// even though the package is named rehype-stay: the id has to be set before the
// hast conversion. See PLAN/README.

import { lintTree, sortFindings } from "remark-stay";

/** mdast node.type is what we have at this stage; the hast tag isn't known yet. */
const nodeType = (node) => (node ? node.type : null);

/**
 * Set `id` on a block node's hProperties, honouring the clash policy. A clash only
 * happens when an earlier mdast plugin already set `hProperties.id` (rehype-slug
 * runs later, at the hast stage, and is non-destructive). Returns the action taken.
 */
function setId(node, id, policy) {
  node.data = node.data || {};
  node.data.hProperties = node.data.hProperties || {};
  const existing = node.data.hProperties.id;

  if (existing != null && existing !== id) {
    if (policy === "keep-existing" || policy === "skip") {
      return { action: "skip-clash", previousId: existing, reason: `id-clash:${policy}` };
    }
    node.data.hProperties.id = id; // stay-wins
    return { action: "set", previousId: existing, reason: "id-clash:overwrote" };
  }

  node.data.hProperties.id = id;
  return { action: "set", previousId: existing ?? null, reason: null };
}

/**
 * Emit ids over an mdast tree (SPEC.md §12 / §5). `source` is the exact Markdown
 * the tree was parsed from (offsets drive remark-stay's segmentation). Mutates the
 * tree in place and returns:
 *   { tree, attached, findings }
 * where `attached` is one entry per well-formed stay
 *   { id, action, previousId, reason, nodeType, line }
 * `action` in { set, skip-clash, skip-dup, skip-extra, skip-unemittable } and
 * `findings` are the core well-formedness findings (orphan/dup/malformed) plus
 * this pass's emission findings (ID_CLASH / EXTRA_STAY / UNEMITTABLE), in canonical
 * order.
 *
 * Options:
 *   idClash    'stay-wins' (default) | 'keep-existing' | 'skip'
 *   prefix     string prepended to every emitted id (default '')
 *   extraStays 'skip' (default) | 'anchor'  (2nd+ stay on one block; 'anchor'
 *              is reserved for a later raw-HTML mode and currently behaves as 'skip')
 *   mdx        detect MDX comment-expression markers (passed to extractBlocks)
 */
export function attachIds(tree, source, opts = {}) {
  const { idClash = "stay-wins", prefix = "", extraStays = "skip", mdx = false } = opts;

  const { blocks, findings: lintFindings } = lintTree(tree, source, { mdx });
  const findings = [...lintFindings];
  const attached = [];
  // An id's fate is decided at its FIRST well-formed occurrence in document order;
  // every later occurrence is a duplicate (§7) and is never emitted. This also
  // guarantees no duplicate HTML id: setId() runs at most once per id.
  const claimed = new Set();

  for (const b of blocks) {
    if (b.index < 0 || !b.node) continue; // orphan marker chunk: lint already flagged it
    const wellFormed = b.markers.filter((m) => !m.malformed && m.id);
    if (wellFormed.length === 0) continue;

    const nt = nodeType(b.node);
    // A raw HTML block (mdast `html`) has no element to carry an id: default
    // remark-rehype drops it, and even allowDangerousHtml passes it through as raw
    // (not an element), so hProperties never applies. Report instead of pretending.
    const emittable = b.node.type !== "html";
    let elementDecided = false; // the block's single element id has been resolved
    let decidedBySet = false; // ... and resolved by a stay emit (vs a clash block)

    for (const mk of wellFormed) {
      const id = prefix + mk.id;

      if (claimed.has(id)) {
        // Duplicate id somewhere earlier (§7). Core also emits DUPLICATE_ID.
        attached.push({ id, action: "skip-dup", previousId: null, reason: "duplicate-id", nodeType: nt, line: mk.line });
        continue;
      }
      claimed.add(id);

      if (!emittable) {
        attached.push({ id, action: "skip-unemittable", previousId: null, reason: "raw-html-block", nodeType: nt, line: mk.line });
        findings.push({ code: "UNEMITTABLE", level: "warn", id, line: mk.line, message: `stay '${id}' is on a raw HTML block; no element to carry an id (needs the deferred raw-HTML mode)` });
        continue;
      }

      if (elementDecided) {
        // The block's one element id is already taken.
        if (decidedBySet) {
          const anchorAsked = extraStays === "anchor";
          const reason = anchorAsked ? "extra-stay-anchor-deferred" : "extra-stay-on-block";
          const message = anchorAsked
            ? `extra stay '${id}': anchor mode is not available in v0.1, skipped (one HTML id per element)`
            : `extra stay '${id}' on a block already carrying a stay; not emitted (one HTML id per element)`;
          attached.push({ id, action: "skip-extra", previousId: null, reason, nodeType: nt, line: mk.line });
          findings.push({ code: "EXTRA_STAY", level: "warn", id, line: mk.line, message });
        } else {
          // The element kept a foreign pre-existing id; this stay can't emit either.
          attached.push({ id, action: "skip-clash", previousId: null, reason: `id-clash:${idClash}`, nodeType: nt, line: mk.line });
          findings.push({ code: "ID_CLASH", level: "warn", id, line: mk.line, message: `stay '${id}' not emitted: node already has a different id (idClash: ${idClash})` });
        }
        continue;
      }

      // First emittable, non-duplicate stay on this block: it resolves the element id.
      const res = setId(b.node, id, idClash);
      attached.push({ id, ...res, nodeType: nt, line: mk.line });
      elementDecided = true;
      decidedBySet = res.action === "set";
      if (!decidedBySet) {
        findings.push({ code: "ID_CLASH", level: "warn", id, line: mk.line, message: `stay '${id}' not emitted: node already has id '${res.previousId}' (idClash: ${idClash})` });
      }
    }
  }

  return { tree, attached, findings: sortFindings(findings) };
}
