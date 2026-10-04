// Motion layer shared by the dashboard and the player screen.
//
// GSAP and ScrambleText load as classic scripts (window.gsap); Rough Notation is
// an ES module. CSS classes stay the source of truth for every visual state, and
// these helpers only add the transition on top, then clear their inline styles.
// Without GSAP, or when the viewer prefers reduced motion, each helper jumps
// straight to the end state, so rendering never waits on an animation.
import { annotate } from '/vendor/rough-notation.esm.js';

export const gsap = window.gsap ?? null;
if (gsap && window.ScrambleTextPlugin) gsap.registerPlugin(window.ScrambleTextPlugin);

export const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const animated = Boolean(gsap) && !reduced;
if (gsap) document.documentElement.classList.add('has-gsap');

const RED = '#ac1903';

/** Tween the number shown in `el` up or down to `value`. */
export function countTo(el, value, { duration = 0.9, format = (n) => String(Math.round(n)) } = {}) {
  const from = Number(el.dataset.value ?? value);
  el.dataset.value = value;
  if (!animated || from === value) { el.textContent = format(value); return; }
  const box = { n: from };
  gsap.to(box, { n: value, duration, ease: 'power2.out', overwrite: true, onUpdate: () => { el.textContent = format(box.n); } });
  gsap.fromTo(el, { scale: 1.12 }, { scale: 1, duration: 0.5, ease: 'back.out(3)', clearProps: 'scale' });
}

/** A rubber stamp hitting paper: drop in big and tilted, land with a jolt. */
export function slam(el, { shake: target } = {}) {
  if (!animated) return;
  gsap.timeline()
    .fromTo(el, { autoAlpha: 0, scale: 2.6, rotation: -14 }, { autoAlpha: 1, scale: 1, rotation: 0, duration: 0.34, ease: 'power4.in', clearProps: 'all' })
    .add(() => target && shake(target));
}

export function shake(el, strength = 5) {
  if (!animated) return;
  gsap.fromTo(el, { x: 0 }, { duration: 0.42, ease: 'none', clearProps: 'x',
    keyframes: { x: [strength, -strength * 0.8, strength * 0.5, -strength * 0.3, 0] } });
}

/** Swap text in with a short decode effect. */
export function scramble(el, text) {
  if (el.textContent === text) return;
  if (!animated || !window.ScrambleTextPlugin) { el.textContent = text; return; }
  gsap.to(el, { duration: 0.8, ease: 'none', overwrite: true,
    scrambleText: { text, chars: 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789', speed: 0.7, revealDelay: 0.15 } });
}

/** Swap text in with a quick fade and rise. */
export function swapText(el, text) {
  if (el.textContent === text) return;
  el.textContent = text;
  if (animated) gsap.fromTo(el, { autoAlpha: 0, y: 6 }, { autoAlpha: 1, y: 0, duration: 0.45, ease: 'power2.out', clearProps: 'all' });
}

const typing = new WeakMap();

/**
 * Type `text` into `el` like a teleprinter; a new line cuts off one still being
 * typed into the same element. Resolves when the line is complete.
 */
export function typeOut(el, text, { cps = 90, max = 0.9, onTick } = {}) {
  typing.get(el)?.progress(1);
  if (!animated) { el.textContent = text; onTick?.(); return Promise.resolve(); }
  el.classList.add('typing');
  const box = { n: 0 };
  return new Promise((resolve) => {
    typing.set(el, gsap.to(box, {
      n: text.length, duration: Math.min(text.length / cps, max), ease: 'none',
      onUpdate: () => { el.textContent = text.slice(0, Math.round(box.n)); onTick?.(); },
      onComplete: () => { el.textContent = text; el.classList.remove('typing'); typing.delete(el); onTick?.(); resolve(); },
    }));
  });
}

/** Rise the page sections into place on first paint. */
export function entrance(targets, { onDone } = {}) {
  document.documentElement.classList.remove('preload');
  if (!animated) { onDone?.(); return; }
  gsap.fromTo(targets,
    { autoAlpha: 0, y: 26, rotation: (i) => (i % 2 ? 0.6 : -0.6) },
    { autoAlpha: 1, y: 0, rotation: 0, duration: 0.8, ease: 'power3.out', stagger: 0.08, clearProps: 'all', onComplete: onDone });
}

// ---- hand-drawn red-ink marks (Rough Notation) ----
const marks = new WeakMap();

/** Draw a hand-inked annotation on `el` (once; repeated calls are no-ops). */
export function mark(el, { type = 'underline', color = RED, padding = 4, strokeWidth = 2.5, iterations = 2, multiline = false, delay = 0 } = {}) {
  if (!el || marks.has(el)) return;
  const a = annotate(el, { type, color, padding, strokeWidth, iterations, multiline, animate: animated, animationDuration: 700 });
  marks.set(el, a);
  setTimeout(() => { if (marks.get(el) === a) a.show(); }, animated ? delay : 0);
}

export function unmark(el) {
  const a = el && marks.get(el);
  if (!a) return;
  a.remove();
  marks.delete(el);
}
