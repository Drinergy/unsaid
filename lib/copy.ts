/**
 * Every sentence a person reads, in one place, so the voice stays the same everywhere.
 *
 * Voice: warm, short, never blaming. We say what happened, then what they can do. Nothing here
 * should feel like a form rejecting them: people may be sharing the hardest thing they have said.
 *
 * Words (use only these):
 *   - "Unsaid" is the name of the app, never a noun for what people write.
 *   - A "thought" is what someone shares. They "write" it and "share" it.
 *   - A "reply" answers a thought. "Saved thoughts" are the ones someone keeps for later.
 */

export const MAX_THOUGHT_NOTE = (max: number) => `That's a little long. Please keep it under ${max.toLocaleString()} characters.`;

export const COPY = {
  // Things the server says back (also shown directly to people)
  emptyContent: "Write a few words first. There's no rush.",
  linksNotAllowed: "Links and contact details can't be shared here. This space is only for your words.",
  rephrase: 'Please try saying that a little differently.',
  looksRepeated: 'That looks like repeated text. Try putting it in your own words.',
  dailyLimit: "You've shared a lot today. Take a breath, and come back tomorrow.",
  networkBusy: 'A lot of people are sharing from your network right now. Please try again in a little while.',
  throttleThought: 'Give it a moment before sharing another thought.',
  throttleReply: 'Give it a moment before replying again.',
  repeatedThought: 'Someone just shared these exact words. Try saying it in your own way.',
  repeatedReply: 'These exact words were just shared here. Try saying it in your own way.',
  thoughtGone: "That thought isn't here anymore.",
  replyGone: "That reply isn't here anymore.",
  tooDeep: 'This conversation has gone as deep as it can. You can reply to the thought itself.',
  humanCheck: "We couldn't confirm you're a person. Please try again.",
  paused: 'Sharing is resting for a little while. Please come back soon.',
  slowDown: 'Easy now. Please try again in a moment.',
  busy: "It's busy right now. Please try again in a moment.",
  badRequest: 'Something looked off with that. Please refresh the page and try again.',
  ourSide: 'Something went wrong on our side. Please try again in a moment.',
  couldNotShare: "We couldn't share your thought just now. Your words are still here, so please try again.",
  couldNotReply: "We couldn't send your reply just now. Your words are still here, so please try again.",
  couldNotReact: "We couldn't save that reaction. Please try again.",
  couldNotReport: "We couldn't send your report. Please try again.",
  couldNotFindPlace: "We couldn't find where you are. You can allow location access, or just look around the world.",

  // Landing
  landingBody: "Read what others could not say. Share yours when you're ready. You are not the only one carrying it.",
  landingDiscover: 'Discover thoughts',
  landingPromise: 'Anonymous. No account. No one will know it’s you.',
  landingLocationNote: 'Your exact location is never shown.',

  // Map
  mapLoading: 'Opening the map…', // read aloud by screen readers; the screen itself shows no words
  thoughtsHere: (n: number) => (n === 0 ? 'No thoughts here yet' : n === 1 ? '1 thought here' : `${n.toLocaleString()} thoughts here`),
  clusterHint: 'zoom in',
  groupHint: 'open to read',
  myLocation: 'My location',
  myLocationTitle: 'Go to where you are',
  writeThought: 'Write a thought',
  savedThoughts: 'Saved thoughts',

  // Writing
  composerTitle: 'Write a thought',
  composerPlaceholder: 'What have you never said out loud?',
  composerAria: 'Your thought',
  composerNote: 'Your exact location is never shown. No one will know it’s you.',
  shareButton: 'Share',
  sharing: 'Sharing…',
  replyPlaceholder: 'Reply with care…',
  replyButton: 'Reply',
  replying: 'Sending…',

  // Reading
  thoughtTitle: 'Thought',
  noReplies: 'No replies yet. A kind word could mean a lot.',
  nothingSaved: 'Nothing saved yet',
  nothingSavedHint: 'When a thought stays with you, tap the bookmark to keep it here.',

  // When something breaks
  errorTitle: 'Something broke on our side',
  errorBody: 'That’s not you, it’s us. Please refresh the page. The thoughts will still be here.',
  mapErrorTitle: "The map couldn't load",
  mapErrorBody: 'Please check your connection and try again.',
  tryAgain: 'Try again',
  botCheckFailed: 'The check could not load. Turn off content blockers for this site and reload the page.',

  // After sharing
  notAlone: "You're not alone.",
  sharedThought: 'Your thought is out there now. Someone may find it right when they need it.',
  sentReply: 'Your reply was sent. Thank you for being kind.',
  dismiss: 'Close',
} as const;
