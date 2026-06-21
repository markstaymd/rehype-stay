// rehype-stay: emit an HTML `id=` per markstay stay so the §12 address
// `doc.md#stay-id` resolves in a browser.
//
// Default export is the unified plugin (the mdast `hProperties` bridge); it runs
// at the remark stage, before `remark-rehype`. `attachIds` is the pure transform
// underneath. Attachment is delegated to remark-stay's `extractBlocks`, so this
// adapter never re-implements the spec algorithm.

export { default } from "./plugin.js";
export { attachIds } from "./emit.js";
