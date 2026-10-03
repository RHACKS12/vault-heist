// The judge: does a submission correctly identify the round's vulnerability?
//
// A submission is CORRECT when it names a specific identifier from the round's
// accept criteria — an accepted file (by full path or basename) or an accepted
// string (the exact hash, username, port, sink, etc.). Generic keywords alone
// ("command injection") are tracked for telemetry but are not sufficient, so a
// vague guess doesn't win the round.

/**
 * @param {string} submission the agent's finding text
 * @param {{accept?:{files?:string[], strings?:string[], keywords?:string[]}}} round
 * @returns {{correct:boolean, matchedOn:{type:string,value:string}[], keywords:string[]}}
 */
export function judge(submission, round) {
  const text = String(submission ?? '').toLowerCase();
  const accept = round?.accept ?? {};
  const matchedOn = [];
  const seen = new Set();

  for (const f of accept.files ?? []) {
    const full = f.toLowerCase();
    const base = f.split('/').filter(Boolean).pop()?.toLowerCase();
    if ((full && text.includes(full)) || (base && base.length >= 3 && text.includes(base))) {
      if (!seen.has('file:' + f)) { matchedOn.push({ type: 'file', value: f }); seen.add('file:' + f); }
    }
  }
  for (const s of accept.strings ?? []) {
    if (s && text.includes(String(s).toLowerCase())) {
      if (!seen.has('string:' + s)) { matchedOn.push({ type: 'string', value: s }); seen.add('string:' + s); }
    }
  }

  const keywords = [];
  for (const k of accept.keywords ?? []) {
    if (k && text.includes(String(k).toLowerCase())) keywords.push(k);
  }

  return { correct: matchedOn.length > 0, matchedOn, keywords };
}

/** Bind the judge to a round: `const j = makeJudge(round); j(submission)`. */
export function makeJudge(round) {
  return (submission) => judge(submission, round);
}
