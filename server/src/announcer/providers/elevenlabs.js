// ElevenLabs TTS provider — STUB.
//
// Wired up with ELEVENLABS_API_KEY. Intended behavior:
//   - POST https://api.elevenlabs.io/v1/text-to-speech/<voiceId> with the line
//     text; receive audio (mpeg) bytes.
//   - Write the clip to a served cache dir (e.g. web/announcer/<hash>.mp3) and
//     return its URL so the dashboard can play it. Cache FIXED lines on first
//     use (synthesize once, replay forever) — "And they're off!", "We have a
//     winner!" — so they never stall on stage. Stream only the dynamic callouts.
//   - Give it a heist-crew voice, not a generic sportscaster.
//
// Until implemented, synthesize throws; the Announcer catches it and the
// dashboard falls back to the browser's speech synthesis.
import { NotWiredError } from '../../agents/providers/not-wired.js';

export function createElevenLabsTTS({ apiKey = process.env.ELEVENLABS_API_KEY, voiceId = process.env.ELEVENLABS_VOICE_ID } = {}) {
  return {
    name: 'elevenlabs',
    voiceId,
    async synthesize() {
      throw new NotWiredError('elevenlabs', 'ELEVENLABS_API_KEY', '@elevenlabs/elevenlabs-js (or REST)');
    },
    _hasKey: Boolean(apiKey),
  };
}
