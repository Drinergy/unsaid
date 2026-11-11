/**
 * Flattens a reply tree into rows and works out which straight guide lines each row needs, so
 * the thread reads like Threads. Every level has its own line down the avatars of that level,
 * joining one reply to the next at the same level (replies to the thought, or replies to the
 * same reply). A reply to a reply is indented under its parent's text, and its parent's line
 * keeps running beside it until the last of its replies.
 *
 * Column k is the line down the avatars of depth k.
 */

import type { Reply } from '@/types/unsaid';

/**
 * Builds the reply tree from a flat, oldest-first list. A reply whose parent is missing (the
 * parent was hidden by reports) is dropped along with everything under it, rather than being
 * promoted to a top-level reply with no context.
 */
export function buildReplyTree(flat: Reply[]): Reply[] {
  const nodes = new Map<string, Reply>(flat.map((r) => [r.id, { ...r, replies: [] }]));
  const roots: Reply[] = [];
  for (const r of flat) {
    const node = nodes.get(r.id)!;
    if (!r.parentReplyId) roots.push(node);
    else nodes.get(r.parentReplyId)?.replies!.push(node);
  }
  return roots;
}

export interface ThreadRow {
  reply: Reply;
  depth: number;
  /** Columns (< depth) whose line runs through this whole row */
  pass: number[];
  /** This row's own line, from its avatar to the bottom of the row */
  ownDown: boolean;
}

export function buildThreadRows(replies: Reply[]): ThreadRow[] {
  const flat: { reply: Reply; depth: number }[] = [];
  const walk = (list: Reply[], depth: number) => {
    for (const reply of list) {
      flat.push({ reply, depth });
      walk(reply.replies ?? [], depth + 1);
    }
  };
  walk(replies, 0);

  // Is there a later row at `depth` before the subtree we are in (depth < stopBelow) ends?
  const laterAt = (i: number, depth: number, stopBelow: number): boolean => {
    for (let j = i + 1; j < flat.length; j++) {
      if (flat[j].depth < stopBelow) return false;
      if (flat[j].depth === depth) return true;
    }
    return false;
  };

  return flat.map(({ reply, depth }, i) => {
    // Column k continues past row i if another reply at depth k follows in the same group
    // (the next one at that level), or if the parent at depth k still has replies to reach.
    const continues = (k: number) => laterAt(i, k, k) || laterAt(i, k + 1, k + 1);

    const pass: number[] = [];
    for (let k = 0; k < depth; k++) {
      if (continues(k)) pass.push(k);
    }

    return { reply, depth, pass, ownDown: continues(depth) };
  });
}
