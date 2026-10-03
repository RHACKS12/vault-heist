// Mock providers: deterministic "LLMs" that drive the tool-use loop without any
// API key, so the whole pipeline (session, runner, race, judge) is testable and
// demoable offline. They ignore the message history and follow a fixed script.

/** A provider that replays a fixed list of steps, then goes idle. */
export function scriptedProvider(steps, name = 'mock') {
  let i = 0;
  return {
    name,
    async step() {
      if (i >= steps.length) return { thought: 'Nothing more to do.' }; // no toolCalls -> loop ends
      return steps[i++];
    },
  };
}

/**
 * A provider that "solves" the round: peek at the target dir, open the target
 * file, then submit the given finding. Used to prove the happy path end-to-end.
 */
export function mockSolver({ file, finding, strategy = 'walk' }) {
  const dir = file ? file.split('/').slice(0, -1).join('/') || '/' : '/';
  return scriptedProvider([
    { thought: `(${strategy}) Starting at the root of the firmware.`, toolCalls: [{ id: 's1', name: 'list_dir', args: { path: '/' } }] },
    { thought: `Looking inside ${dir}.`, toolCalls: [{ id: 's2', name: 'list_dir', args: { path: dir } }] },
    { thought: `Reading ${file}.`, toolCalls: [{ id: 's3', name: 'read_file', args: { path: file } }] },
    { thought: 'I can identify the vulnerability now.', toolCalls: [{ id: 's4', name: 'submit', args: { finding } }] },
  ], `mock-solver`);
}

/** A provider that pokes around but never submits a correct answer. */
export function mockWanderer({ steps = 5 } = {}) {
  const script = [];
  for (let i = 0; i < steps; i++) {
    script.push({ thought: `Still searching... (${i + 1})`, toolCalls: [{ id: `w${i}`, name: 'list_dir', args: { path: '/' } }] });
  }
  return scriptedProvider(script, 'mock-wanderer');
}

/** A provider that refuses on the first step. */
export function mockRefuser(reason = 'I’m sorry, I can’t help with that.') {
  return {
    name: 'mock-refuser',
    async step() { return { refused: { reason } }; },
  };
}

/** A provider that submits a vague, wrong answer first, then the correct one. */
export function mockSecondGuess({ file, finding }) {
  return scriptedProvider([
    { thought: 'Maybe it is something generic.', toolCalls: [{ id: 'g1', name: 'submit', args: { finding: 'there is probably some vulnerability somewhere' } }] },
    { thought: `Let me actually read ${file}.`, toolCalls: [{ id: 'g2', name: 'read_file', args: { path: file } }] },
    { thought: 'Now I am sure.', toolCalls: [{ id: 'g3', name: 'submit', args: { finding } }] },
  ], 'mock-second-guess');
}
