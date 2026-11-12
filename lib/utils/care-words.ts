/**
 * Spots writing that may come from someone in real pain, so we can show them where to find support
 * after they share. It never blocks or changes a post, and a wrong guess only shows a kind note.
 * Covers English and Filipino, because people write in the language they feel in.
 */

const CARE_PATTERNS: RegExp[] = [
  /\b(kill(ing)? myself|end(ing)? my (own )?life|end it all|take my (own )?life)\b/i,
  /\b(want(ed)?|wanna|going|plan(ning)?) to (die|disappear forever)\b/i,
  /\b(don'?t|do not|no longer) want to (live|be alive|be here|exist)\b/i,
  /\b(hurt(ing)?|harm(ing)?|cut(ting)?) myself\b/i,
  /\b(suicide|suicidal)\b/i,
  /\b(better off dead|no reason to live|wish i (was|were) dead)\b/i,
  /(magpakamatay|magpatiwakal|pagpapakamatay)/i,
  /(gusto|ayoko|ayaw) (ko )?(nang|na) (mamatay|mabuhay)/i,
  /(sawa na (akong|ako) mabuhay|wakasan ang buhay ko|saktan ang sarili ko)/i,
];

export function mentionsSelfHarm(text: string): boolean {
  return CARE_PATTERNS.some((pattern) => pattern.test(text));
}
