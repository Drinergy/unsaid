/** How deep replies may nest: a reply to the thought is depth 0, a reply to that is depth 1, and so on. */
export const MAX_REPLY_DEPTH = 5;

/** Depth of a new reply, given its parent's depth (null = a reply to the thought itself). */
export function nextReplyDepth(parentDepth: number | null): number {
  return parentDepth === null ? 0 : parentDepth + 1;
}

/** May a reply be posted at this depth? */
export function isReplyDepthAllowed(depth: number): boolean {
  return depth <= MAX_REPLY_DEPTH;
}
