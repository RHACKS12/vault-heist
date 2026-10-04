// Pre-generate every announcer line once, so the show pays zero per-event TTS.
//
//   ELEVENLABS_API_KEY=... ELEVENLABS_VOICE_ID=... npm run generate:announcer
//   (add --dry-run to check the plan + credits without synthesizing)
//
// Writes one MP3 per catalog entry to web/announcer/ plus manifest.json
// (key -> url). The runtime server loads that manifest and plays the clips; no
// API calls happen during the event. Commit web/announcer/ so the demo has audio
// offline. Run this on a machine with network access (the cloud sandbox blocks
// general egress).
//
// Credit guard: checks your ElevenLabs balance first (a free call) and refuses to
// run if there isn't enough headroom for the whole catalog.
import '../src/env.js'; // load .env (repo root or server/) before reading keys
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CATALOG } from '../src/announcer/catalog.js';
import { createElevenLabsTTS } from '../src/announcer/providers/elevenlabs.js';
import { WEB_ROOT } from '../src/config.js';

const dryRun = process.argv.includes('--dry-run');
const tts = createElevenLabsTTS(); // throws if no key
const totalChars = CATALOG.reduce((s, e) => s + e.text.length, 0);
console.log(`plan: ${CATALOG.length} lines, ${totalChars} characters, voice ${tts.voiceId}`);

// credit guard — never exceed the account balance
let remaining = Infinity;
try {
  const sub = await tts.subscription();
  const used = sub.character_count ?? 0;
  const limit = sub.character_limit ?? 0;
  remaining = limit - used;
  console.log(`credits: ${used}/${limit} used — ${remaining} characters remaining`);
} catch (e) {
  console.warn(`could not check credits (${e.message}); refusing to generate to stay safe.`);
  process.exit(1);
}
if (remaining < totalChars) {
  console.error(`ABORT: not enough credits — need ${totalChars}, only ${remaining} remaining.`);
  process.exit(1);
}
if (dryRun) {
  console.log('dry run — no audio generated.');
  process.exit(0);
}

const outDir = path.join(WEB_ROOT, 'announcer');
await mkdir(outDir, { recursive: true });

const manifest = {};
for (const entry of CATALOG) {
  const fileName = `${entry.key.replace(/[^\w.-]/g, '_')}.mp3`;
  process.stdout.write(`  ${entry.key} … `);
  const bytes = await tts.toBuffer(entry.text);
  await writeFile(path.join(outDir, fileName), bytes);
  manifest[entry.key] = `/announcer/${fileName}`;
  console.log(`${bytes.length} bytes`);
}
await writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`\ngenerated ${CATALOG.length} clips + manifest.json in web/announcer/ (${totalChars} characters billed)`);
