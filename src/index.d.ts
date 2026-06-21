// Type declarations for rehype-stay, the markstay -> HTML id bridge. Hand-written
// to match the runtime in this directory. The default export is a unified plugin
// that runs at the mdast (remark) stage, before remark-rehype, and sets
// `node.data.hProperties.id` so the hast conversion emits `<el id="stay-id">`.

import type { Plugin } from "unified";
import type { Root } from "mdast";
import type { Finding } from "remark-stay";

export type { Finding } from "remark-stay";

/** What happened to one stay during emission. */
export type EmitAction =
  | "set"
  | "skip-clash"
  | "skip-dup"
  | "skip-extra"
  | "skip-unemittable";

/** Policy when a block node already carries an `hProperties.id` (rare; mdast-stage). */
export type IdClash = "stay-wins" | "keep-existing" | "skip";

/** One stay's emission record. */
export interface Attached {
  /** The emitted id (already `prefix`-ed). */
  id: string;
  action: EmitAction;
  /** The id that was already present on the node, if any. */
  previousId: string | null;
  /** Short machine reason, or null when a clean `set`. */
  reason: string | null;
  /** mdast node type of the bound block (the hast tag is not known yet). */
  nodeType: string | null;
  /** 1-based line of the marker. */
  line: number;
}

/** Result of the pure transform. */
export interface AttachIdsResult {
  tree: Root;
  attached: Attached[];
  findings: Finding[];
}

/** Options shared by `attachIds` and the plugin. */
export interface EmitOptions {
  /** Clash policy for a pre-existing `hProperties.id`. Default `'stay-wins'`. */
  idClash?: IdClash;
  /** Prepend to every emitted id (e.g. `'stay-'`). Default `''`. */
  prefix?: string;
  /**
   * 2nd+ stay on one block. Default `'skip'`. `'anchor'` (synthetic `<a id>`) is
   * reserved for a later raw-HTML mode and currently behaves as `'skip'`.
   */
  extraStays?: "skip" | "anchor";
  /** Detect MDX comment-expression markers (needs remark-mdx upstream). Default false. */
  mdx?: boolean;
}

/** Options for the `rehypeStay` plugin. */
export interface RehypeStayOptions extends EmitOptions {
  /** Emit each finding as a vfile message. Default true. */
  lint?: boolean;
  /** Attach `file.data.stay = { attached, findings }`. Default false. */
  annotate?: boolean;
  /** Mark error-level findings fatal so a unified run exits non-zero. Default false. */
  fail?: boolean;
}

/**
 * Emit ids over an mdast tree (SPEC.md §12 / §5). Mutates `tree` in place. The
 * first well-formed stay on a block sets the element id; extras and duplicates are
 * reported, never emitted twice. `source` is the exact Markdown the tree came from.
 */
export function attachIds(tree: Root, source: string, opts?: EmitOptions): AttachIdsResult;

/**
 * The bridge plugin. Add it to a remark->rehype pipeline BEFORE `remark-rehype`;
 * every stay becomes an `id=` on its block's element.
 */
declare const rehypeStay: Plugin<[RehypeStayOptions?], Root>;
export default rehypeStay;
