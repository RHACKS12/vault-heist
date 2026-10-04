// Pre-generate every announcer line once, so the show pays zero per-event TTS.
//
//   ELEVENLABS_API_KEY=... [ELEVENLABS_VOICE_ID=...] npm run generate:announcer
//
// Writes one MP3 per catalog entry to web/announcer/ plus manifest.json
// (key -> url). The runtime server loads that manifest and plays the clips; no
// API calls happen during the event. Commit web/announcer/ so the demo has audio
// offline. Run this on a machine with network access (the cloud sandbox blocks
// general egress).
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CATALOG } from '../src/announcer/catalog.js';
import { createElevenLabsTTS } from '../src/announcer/providers/elevenlabs.js';
import { WEB_ROOT } from '../src/config.js';

const tts = createElevenLabsTTS(); // throws if no key
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
console.log(`\ngenerated ${CATALOG.length} clips + manifest.json in web/announcer/ (voice ${tts.voiceId})`);
