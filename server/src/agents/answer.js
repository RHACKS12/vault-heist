// Load the committed answer key and pick the active round.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { REPO_ROOT } from '../config.js';

/** Load targets/<target>/answer.json. */
export async function loadAnswerKey(target = 'iotgoat') {
  const file = path.join(REPO_ROOT, 'targets', target, 'answer.json');
  return JSON.parse(await readFile(file, 'utf8'));
}

/**
 * Resolve a round from a loaded answer key.
 * @returns {{name:string, file?:string, function?:string, accept?:object}}
 */
export function getRound(answerKey, roundName) {
  const name = roundName ?? answerKey.defaultRound;
  const round = answerKey.rounds?.[name];
  if (!round) throw new Error(`Unknown round "${name}" (have: ${Object.keys(answerKey.rounds ?? {}).join(', ')})`);
  return { name, ...round };
}

/**
 * The round for the next race, per the ROUND setting: unset keeps the answer
 * key's default (the proven demo round), a round name pins that round, and
 * "random" picks any round except the previous one so back-to-back races differ.
 */
export function pickRound(answerKey, mode, { last = null, random = Math.random } = {}) {
  if (!mode) return getRound(answerKey);
  if (mode !== 'random') return getRound(answerKey, mode);
  const names = Object.keys(answerKey.rounds ?? {});
  const pool = names.length > 1 ? names.filter((n) => n !== last) : names;
  return getRound(answerKey, pool[Math.floor(random() * pool.length)]);
}

/** The milestone target (vulnerable file + its directory) derived from a round. */
export function roundTarget(round) {
  const file = round.file ?? null;
  const dir = file ? path.posix.dirname(file) : null;
  return { file, dir };
}
