// Recorder: tap the event bus and capture a run to a .jsonl file.
//
// One JSON event per line (the exact GameEvent objects, with their ts). A
// recorded run can be replayed through the same bus (see replayer.js) so the
// pitch never depends on a live model or the venue WiFi.
import fsp from 'node:fs/promises';
import path from 'node:path';

export class Recorder {
  constructor({ bus }) {
    if (!bus) throw new Error('Recorder requires a bus');
    this.bus = bus;
    this.recording = false;
    this.events = [];
    this.label = null;
    this.startedAt = null;
    this._unsub = null;
  }

  start(label = 'run') {
    if (this.recording) throw new Error('already recording');
    this.events = [];
    this.label = String(label).replace(/[^\w.-]+/g, '-').slice(0, 48) || 'run';
    this.startedAt = Date.now();
    this.recording = true;
    this._unsub = this.bus.subscribe((e) => this.events.push(e));
    return { recording: true, label: this.label };
  }

  stop() {
    if (!this.recording) throw new Error('not recording');
    this._unsub?.();
    this._unsub = null;
    this.recording = false;
    return { label: this.label, count: this.events.length, events: this.events };
  }

  get count() { return this.events.length; }

  /** Write the captured events to <dir>/<name>.jsonl. */
  async save(dir, name) {
    const base = name.endsWith('.jsonl') ? name : `${name}.jsonl`;
    const file = path.join(dir, base);
    await fsp.mkdir(dir, { recursive: true });
    const text = this.events.map((e) => JSON.stringify(e)).join('\n') + (this.events.length ? '\n' : '');
    await fsp.writeFile(file, text);
    return { file, count: this.events.length };
  }
}
