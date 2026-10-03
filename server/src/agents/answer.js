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

/** The milestone target (vulnerable file + its directory) derived from a round. */
export function roundTarget(round) {
  const file = round.file ?? null;
  const dir = file ? path.posix.dirname(file) : null;
  return { file, dir };
}
