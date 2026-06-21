// The default export: the markstay -> HTML id bridge as a unified/remark plugin.
// Drop it into a remark->rehype pipeline BEFORE `remark-rehype` and every stay
// becomes an `id=` on its block's element. All verdicts come from the core via
// ./emit.js (which reuses remark-stay); this file is the unified glue (vfile
// messages, file.data, options).

import { attachIds } from "./emit.js";

// vfile severity: fatal=true -> error, false -> warning, null -> info.
function emitMessage(file, f, fail) {
  const place = f.line ? { line: f.line, column: 1 } : undefined;
  const msg = file.message(f.message, { place, ruleId: f.code, source: "rehype-stay" });
  msg.fatal = f.level === "error" ? Boolean(fail) : f.level === "warn" ? false : null;
  return msg;
}

/**
 * remark plugin (runs at the mdast stage; see package note). Options:
 *   idClash    'stay-wins' (default) | 'keep-existing' | 'skip'
 *   prefix     string prepended to every emitted id (default '')
 *   extraStays 'skip' (default) | 'anchor'  (2nd+ stay on a block)
 *   mdx        detect MDX comment-expression markers (default false)
 *   lint       emit each finding as a vfile message (default true)
 *   annotate   attach `file.data.stay` = { attached, findings } (default false)
 *   fail       mark error-level findings fatal so the run exits non-zero (default false)
 */
export default function rehypeStay(options = {}) {
  const { lint = true, annotate = false, fail = false, ...emitOpts } = options;

  return function transformer(tree, file) {
    const source = String(file.value ?? "");
    const { attached, findings } = attachIds(tree, source, emitOpts);

    if (annotate) file.data.stay = { attached, findings };
    if (lint) for (const f of findings) emitMessage(file, f, fail);
  };
}
