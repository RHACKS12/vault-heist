// The event bus: the single source of truth for the whole app.
//
// Everything publishes here; the WebSocket layer, the (future) announcer, the
// recorder, and the betting engine all subscribe. Building this cleanly means
// each feature plugs in instead of being wired separately.
import { EventEmitter } from 'node:events';

export class EventBus extends EventEmitter {
  /** @param {{bufferSize?:number}} [opts] size of the recent-events ring buffer */
  constructor({ bufferSize = 1000 } = {}) {
    super();
    this.setMaxListeners(0); // many clients subscribe; no leak warning
    /** @type {object[]} */
    this._buffer = [];
    this._bufferSize = bufferSize;
  }

  /**
   * Publish an event: append to the ring buffer and emit to all subscribers.
   * @param {object} event a GameEvent from createEvent()
   * @returns {object} the same event (for convenience)
   */
  publish(event) {
    this._buffer.push(event);
    if (this._buffer.length > this._bufferSize) this._buffer.shift();
    this.emit('event', event);
    return event;
  }

  /**
   * The most recent `n` events, oldest-first. Used to seed a late-joining
   * client so it sees current state without waiting for the next event.
   * @param {number} [n]
   */
  recent(n = 50) {
    return n >= this._buffer.length ? [...this._buffer] : this._buffer.slice(-n);
  }

  /**
   * Subscribe to every published event.
   * @param {(event:object)=>void} listener
   * @returns {()=>void} unsubscribe function
   */
  subscribe(listener) {
    this.on('event', listener);
    return () => this.off('event', listener);
  }
}
