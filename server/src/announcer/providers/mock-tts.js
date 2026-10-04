// Mock TTS: no audio synthesis, no key. Returns null for every line, which tells
// the dashboard to fall back to the browser's built-in speech (Web Speech API).
// So the announcer is audibly working in the demo today, and swapping in the real
// ElevenLabs provider (Milestone 6 wiring) just makes the voices better.
export function createMockTTS() {
  return {
    name: 'mock',
    async synthesize() { return null; },
  };
}
