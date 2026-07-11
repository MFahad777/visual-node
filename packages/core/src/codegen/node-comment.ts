import type { FlowNode } from "../schema/node.types.js";
import type { EmittedCode } from "../schema/node-registry.js";

function formatCommentBlock(comment: string): string {
  const sanitized = comment.replace(/\*\//g, "*\\/"); // never let user text close the JS comment early
  const lines = sanitized.split("\n");
  if (lines.length === 1) return `/** ${lines[0]} */`;
  return `/**\n${lines.map((l) => ` * ${l}`).join("\n")}\n */`;
}

/**
 * Prepends the node's `data.comment` (if a non-empty string) as a `/** ... *\/` block
 * above its emitted `body`/`setup`. Returns the same object unchanged if there's no
 * comment, so the shared `emitNode` cache in each caller stores the annotated result
 * exactly once (this must be called BEFORE `cache.set(...)`, not after).
 */
export function withNodeComment(node: FlowNode, emitted: EmittedCode): EmittedCode {
  const comment = node.data?.comment;
  if (typeof comment !== "string" || comment.trim().length === 0) return emitted;
  const block = formatCommentBlock(comment);
  return {
    ...emitted,
    ...(emitted.setup ? { setup: `${block}\n${emitted.setup}` } : {}),
    ...(emitted.body ? { body: `${block}\n${emitted.body}` } : {}),
  };
}
