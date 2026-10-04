// ElevenLabs TTS client — used by the OFFLINE generator (npm run generate:announcer)
// to synthesize each predefined catalog line once. Runtime never calls this: the
// dashboard plays the pre-generated clips from the manifest, so there is no
// per-event cost.
//
// Needs ELEVENLABS_API_KEY (and optionally ELEVENLABS_VOICE_ID / _MODEL). Note:
// the cloud sandbox blocks general internet egress, so run the generator on a
// machine with network access, then commit web/announcer/.

const DEFAULT_VOICE = '21m00Tcm4TlvDq8ikWAM'; // a stock ElevenLabs voice; override for the heist persona
const DEFAULT_MODEL = 'eleven_multilingual_v2';

export function createElevenLabsTTS({
  apiKey = process.env.ELEVENLABS_API_KEY,
  voiceId = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE,
  model = process.env.ELEVENLABS_MODEL || DEFAULT_MODEL,
} = {}) {
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY is required to synthesize audio');

  /** Synthesize text to MPEG audio bytes. */
  async function toBuffer(text) {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: model, voice_settings: { stability: 0.4, similarity_boost: 0.8 } }),
    });
    if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return Buffer.from(await res.arrayBuffer());
  }

  return { name: 'elevenlabs', voiceId, model, toBuffer };
}
