// Observer dashboard: connect to the event stream, fold events through the pure
// reducer, and render. All DOM lives here; all state logic lives in reducer.js.
// render() compares against the last frame it drew and hands real changes
// (a milestone, a wrong call, a win) to fx.js for motion. Effects only fire for
// live events, never while a reconnect backlog is being painted.
import { initialState, reduce, CREW, STAGES } from '/reducer.js';
import { gsap, animated, countTo, slam, shake, scramble, swapText, typeOut, entrance, mark, unmark } from '/fx.js';
import { resolveJoinUrl, qrSvg, prettyUrl } from '/qr.js';

let state = initialState();
const $ = (id) => document.getElementById(id);
const nameOf = (id) => CREW.find((d) => d.id === id)?.name ?? id;

// one chip per milestone, in STAGES order: [icon, label]
const STEPS = [['search', 'Explore'], ['folder', 'Find dir'], ['file', 'Open file'], ['flag', 'Submit']];

// ---- build the crew dossiers once, keep refs for fast updates ----
const crewEl = $('crew');
const panels = {};
CREW.forEach((def, i) => {
  const el = document.createElement('article');
  el.className = 'agent';
  el.dataset.reveal = '';
  el.setAttribute('aria-labelledby', `agent-${def.id}`);
  el.innerHTML = `
    <div class="agent-sheet">
      <div class="agent-file"><span>DOSSIER / 0${i + 1}</span><span class="lead-tag">IN THE LEAD</span><b class="agent-status">STANDING BY</b></div>
      <div class="agent-head">
        <div class="mugshot" aria-hidden="true"><span>${def.name[0]}</span></div>
        <div class="agent-id">
          <h3 class="agent-name" id="agent-${def.id}">${def.name}</h3>
          <div class="agent-strategy">M.O. / ${def.strategy}</div>
          <div class="agent-bets">No backers yet</div>
        </div>
        <div class="agent-odds"><b>—</b><span>ODDS</span></div>
      </div>
      <div class="track" role="img" aria-label="Progress: not started">${STEPS.map(([icon, name]) => `<span class="step"><i class="fill"></i><svg class="icon" aria-hidden="true"><use href="/assets/icons.svg#${icon}" /></svg><span>${name}</span></span>`).join('')}</div>
      <div class="bar-caption" aria-hidden="true"><span class="stage-name">not started</span><code class="stage-clue"></code><span class="stage-count">0 / ${STAGES.length}</span></div>
      <div class="notes">
        <div class="log-label">FIELD NOTES <span><i class="tx"></i>LIVE TRANSCRIPT</span></div>
        <div class="reasoning" tabindex="0" role="region" aria-label="${def.name} field notes"></div>
      </div>
      <div class="finding" hidden><span class="finding-label">SUBMITTED FINDING</span><p><span class="finding-text"></span></p></div>
    </div>
    <div class="agent-stamp" aria-hidden="true"></div>`;
  crewEl.appendChild(el);
  const q = (sel) => el.querySelector(sel);
  panels[def.id] = {
    el, sheet: q('.agent-sheet'), status: q('.agent-status'), odds: q('.agent-odds b'), bets: q('.agent-bets'),
    track: q('.track'), steps: [...el.querySelectorAll('.step')], stageName: q('.stage-name'), clue: q('.stage-clue'), stageCount: q('.stage-count'),
    tx: q('.tx'), reasoning: q('.reasoning'), finding: q('.finding'), findingText: q('.finding-text'), stamp: q('.agent-stamp'),
    queue: [], draining: false, prev: null,
  };
});

const els = {
  phase: $('phase'), phaseTrack: $('phaseTrack'), phaseMarker: $('phaseMarker'),
  round: $('round'), clock: $('clock'), clockWrap: $('clockWrap'), conn: $('conn'),
  stamp: $('stamp'), stampTitle: $('stampTitle'), stampSub: $('stampSub'), header: document.querySelector('.case-header'),
  stage: document.querySelector('.stage'), vault: $('vault'), dial: $('dial'), vaultLabel: $('vaultLabel'), vaultStamp: $('vaultStamp'),
  jobKicker: $('jobKicker'), jobTitle: $('jobTitle'), jobCopy: $('jobCopy'), verdict: $('verdict'),
  pot: $('pot'), players: $('players'), joinQr: $('joinQr'), joinUrl: $('joinUrl'), joinWarn: $('joinWarn'), ticket: $('ticket'),
  qrDialog: $('qrDialog'), joinQrBig: $('joinQrBig'), joinUrlBig: $('joinUrlBig'), qrPot: $('qrPot'), qrPlayers: $('qrPlayers'),
  hostToggle: $('hostToggle'), desk: $('hostDesk'), hostClose: $('hostClose'), hostStatus: $('hostStatus'),
  hostOpen: $('hostOpen'), hostLock: $('hostLock'), hostReset: $('hostReset'),
  runRace: $('runRace'), recBtn: $('recBtn'), replayBtn: $('replayBtn'), muteBtn: $('muteBtn'), qrBtn: $('qrBtn'),
  dispatch: $('dispatch'), announcer: $('announcer'), announcerVis: $('announcerVis'),
};
const label = (btn) => btn.querySelector('span');

// 60 dial graduations, every fifth one long
$('vaultTicks').setAttribute('d', Array.from({ length: 60 }, (_, i) => {
  const a = (i * 6 * Math.PI) / 180, r1 = i % 5 ? 77 : 73, r2 = 81;
  const pt = (r) => `${(110 + r * Math.sin(a)).toFixed(1)} ${(110 - r * Math.cos(a)).toFixed(1)}`;
  return `M${pt(r1)}L${pt(r2)}`;
}).join(''));

// ---- copy for each phase ----
const STAMPS = {
  LOBBY: ['CONFIDENTIAL', 'FOR THE CREW ONLY'],
  BETTING_OPEN: ['BETS OPEN', 'PLACE YOUR CUT'],
  BETS_LOCKED: ['NO MORE BETS', 'ODDS ARE FINAL'],
  RACING: ['IN PROGRESS', 'DO NOT DISTURB'],
};
const JOB = {
  LOBBY: ['THE JOB', 'Find the flaw. Crack the vault.', 'Three AI safecrackers search the same router firmware for one planted vulnerability. Scan the ticket to join the crew.'],
  BETTING_OPEN: ['THE TABLE IS OPEN', 'Place your bets.', 'Scan the ticket, back a safecracker, and get your chips down before the host locks the table.'],
  BETS_LOCKED: ['NO MORE BETS', 'The table is locked.', 'Odds are final. The crew is gearing up.'],
};
const PHASES = ['LOBBY', 'BETTING_OPEN', 'BETS_LOCKED', 'RACING', 'SETTLED'];

/** The single runner furthest along, or null on a tie or before anyone moves. */
function leader() {
  const runners = CREW.map((d) => state.agents[d.id]).filter((a) => !a.refused);
  const top = Math.max(0, ...runners.map((a) => a.stage));
  const front = runners.filter((a) => a.stage === top);
  return top > 0 && front.length === 1 ? front[0] : null;
}

// ---- render ----
let last = { phase: null, winner: undefined };

function render(live) {
  els.phase.textContent = state.phase;
  els.round.textContent = state.round;
  countTo(els.pot, state.pot);
  countTo(els.players, state.players);
  els.qrPot.textContent = state.pot;
  els.qrPlayers.textContent = state.players;

  renderPhaseTrack(live);
  renderStamp(live);
  renderJob(live);
  renderVault(live);
  renderCrew(live);
  renderHost();
  last = { phase: state.phase, winner: state.winner };
}

function renderPhaseTrack(live) {
  const at = PHASES.indexOf(state.phase);
  [...els.phaseTrack.children].forEach((li, i) => {
    li.classList.toggle('done', i < at);
    if (i === at) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
  });
  if (state.phase !== last.phase) placeMarker(live);
}

function placeMarker(live) {
  const li = els.phaseTrack.querySelector('[aria-current]');
  if (!li) return;
  const to = { x: li.offsetLeft, width: li.offsetWidth };
  if (gsap) gsap.to(els.phaseMarker, { ...to, duration: live && animated ? 0.6 : 0, ease: 'power3.inOut' });
  else Object.assign(els.phaseMarker.style, { transform: `translateX(${to.x}px)`, width: `${to.width}px` });
}

function renderStamp(live) {
  const w = state.winner;
  const [title, sub] = state.phase === 'SETTLED' ? ['CASE CLOSED', w ? `CRACKED BY ${nameOf(w).toUpperCase()}` : 'THE VAULT HELD'] : STAMPS[state.phase] ?? STAMPS.LOBBY;
  if (els.stampTitle.textContent === title && els.stampSub.textContent === sub) return;
  els.stampTitle.textContent = title;
  els.stampSub.textContent = sub;
  els.stamp.classList.toggle('closed', state.phase === 'SETTLED');
  if (live) slam(els.stamp, { shake: els.header });
}

function renderJob(live) {
  let kicker, title, copy;
  if (state.phase === 'SETTLED') {
    const w = state.winner && state.agents[state.winner];
    kicker = 'CASE CLOSED';
    title = w ? `${w.name} cracked it.` : 'The vault held.';
    copy = w ? (w.finding ? `“${w.finding}”` : 'The finding checked out.') : 'No one cracked it. Every chip goes back to its owner.';
  } else if (state.phase === 'RACING') {
    const lead = leader();
    const moving = CREW.some((d) => state.agents[d.id].stage > 0);
    kicker = 'HEIST IN PROGRESS';
    title = 'The crew is inside.';
    copy = lead ? `${lead.name} is out front: ${STAGES[lead.stage - 1]}.` : moving ? 'Neck and neck. Watch the field notes.' : 'Three safecrackers, one firmware image. Watch the field notes.';
  } else {
    [kicker, title, copy] = JOB[state.phase] ?? JOB.LOBBY;
  }
  if (live) { swapText(els.jobKicker, kicker); scramble(els.jobTitle, title); swapText(els.jobCopy, copy); }
  else { els.jobKicker.textContent = kicker; els.jobTitle.textContent = title; els.jobCopy.textContent = copy; }

  els.verdict.innerHTML = state.winner ? payoutLine() : '';
  if (state.winner && state.phase === 'SETTLED') mark(els.jobTitle, { type: 'underline', multiline: true, delay: live ? 2600 : 0 });
  else unmark(els.jobTitle);
}

function payoutLine() {
  if (!state.payouts?.length) return '';
  const winners = state.payouts.filter((p) => p.won);
  const paid = winners.reduce((s, p) => s + p.payout, 0);
  return winners.length ? `${winners.length} backer${winners.length > 1 ? 's' : ''} split <b>${paid}</b> chips.` : 'Nobody backed the winner. The house keeps the pot.';
}

// ---- the vault: dial motion by state, door + stamp by CSS state ----
const vault = { state: null, motion: null };

function renderVault(live) {
  const next = state.winner ? 'cracked' : state.phase === 'RACING' ? 'racing' : state.phase === 'SETTLED' ? 'sealed' : 'idle';
  const top = Math.max(...CREW.map((d) => state.agents[d.id].stage));
  if (next === 'racing') vault.motion?.timeScale(1 + top * 0.6); // the dial speeds up as the crew closes in
  if (next === vault.state) return;
  vault.state = next;
  els.vault.dataset.state = next;
  els.vaultLabel.textContent = { cracked: 'CRACKED', sealed: 'THE VAULT HELD', racing: 'WORKING THE DIAL', idle: 'THE MARK' }[next];
  els.vaultStamp.textContent = next === 'sealed' ? 'SEALED' : 'CRACKED';
  if (!animated) return;

  vault.motion?.kill();
  vault.motion = null;
  const dial = els.dial;
  const at = Number(gsap.getProperty(dial, 'rotation')) || 0;
  const home = Math.ceil(at / 360) * 360;
  if (next === 'racing') {
    vault.motion = gsap.to(dial, { rotation: '+=360', svgOrigin: '110 110', duration: 4, ease: 'none', repeat: -1 });
  } else if (next === 'cracked') {
    // spin up, catch on the combination, then the CSS door swing takes over
    gsap.timeline()
      .to(dial, { rotation: home + 720, svgOrigin: '110 110', duration: 1.1, ease: 'power2.in' })
      .to(dial, { rotation: home + 720 + 32, svgOrigin: '110 110', duration: 0.5, ease: 'back.out(3)' });
    if (live) {
      gsap.set(els.vaultStamp, { autoAlpha: 0 });
      gsap.delayedCall(2.5, () => slam(els.vaultStamp, { shake: els.stage }));
    }
  } else {
    gsap.to(dial, { rotation: home, svgOrigin: '110 110', duration: 1, ease: 'power3.out',
      onComplete: () => { if (vault.state === 'idle') vault.motion = gsap.to(dial, { rotation: home + 18, svgOrigin: '110 110', duration: 2.6, ease: 'sine.inOut', yoyo: true, repeat: -1, repeatDelay: 0.8 }); } });
    if (live && next === 'sealed') slam(els.vaultStamp);
  }
}

// ---- the crew ----
function renderCrew(live) {
  const lead = state.phase === 'RACING' ? leader() : null;
  crewEl.classList.toggle('has-winner', Boolean(state.winner));
  for (const def of CREW) {
    const a = state.agents[def.id];
    const p = panels[def.id];
    const prev = p.prev ?? { stage: 0, notes: 0, finding: null, rejected: false, won: false, refused: false, out: false, odds: null };
    const out = a.rejected && a.attemptsLeft === 0;

    p.el.classList.toggle('won', a.won);
    p.el.classList.toggle('refused', a.refused);
    p.el.classList.toggle('rejected', a.rejected && !a.won);
    p.el.classList.toggle('leading', lead?.id === def.id);
    p.status.textContent = a.won ? 'CRACKED'
      : a.refused ? 'STOOD DOWN'
      : a.rejected ? (out ? 'OUT OF GUESSES' : `WRONG CALL · ${a.attemptsLeft} LEFT`)
      : state.phase === 'SETTLED' ? (state.winner ? 'OUTPACED' : 'NO CRACK')
      : a.stage > 0 ? 'ON THE JOB' : 'STANDING BY';

    const o = state.odds?.[def.id];
    const odds = o ? `×${o}` : '—';
    if (p.odds.textContent !== odds) live ? swapText(p.odds, odds) : (p.odds.textContent = odds);
    p.odds.classList.toggle('none', !o);
    const n = state.counts?.[def.id] ?? 0;
    const chips = state.totals?.[def.id] ?? 0;
    p.bets.textContent = n > 0 ? `${n} backer${n > 1 ? 's' : ''} · ${chips} chips` : 'No backers yet';

    // the chip the agent is working toward runs a striped "in progress" fill
    const working = state.phase === 'RACING' && !a.won && !a.refused && !out;
    p.steps.forEach((step, i) => {
      step.classList.toggle('on', i < a.stage);
      step.classList.toggle('next', working && i === a.stage);
      if (live && animated && i >= prev.stage && i < a.stage) {
        gsap.fromTo(step, { scale: 1.14 }, { scale: 1, duration: 0.55, delay: 0.3 + (i - prev.stage) * 0.1, ease: 'back.out(3)', clearProps: 'scale' });
      }
    });
    const stageName = a.stage > 0 ? STAGES[a.stage - 1] : working ? 'getting started' : 'not started';
    if (p.stageName.textContent !== stageName) live ? swapText(p.stageName, stageName) : (p.stageName.textContent = stageName);
    const clue = (a.stage >= 3 ? a.file : a.stage === 2 ? a.dir : null) ?? '';
    if (p.clue.textContent !== clue) live && clue ? swapText(p.clue, clue) : (p.clue.textContent = clue);
    p.stageCount.textContent = `${a.stage} / ${STAGES.length}`;
    p.track.setAttribute('aria-label', `Progress: ${stageName}${clue ? ` (${clue})` : ''}, ${a.stage} of ${STAGES.length}`);

    // field notes: only the lines that arrived since the last frame
    if (a.notes < prev.notes) { p.reasoning.textContent = ''; p.queue.length = 0; }
    const fresh = Math.min(a.notes - Math.min(prev.notes, a.notes), a.reasoning.length);
    if (fresh > 0) pushNotes(p, a.reasoning.slice(-fresh), !live);

    if (a.finding !== prev.finding) {
      p.finding.hidden = !a.finding;
      if (a.finding && live) { scramble(p.findingText, a.finding); if (animated) gsap.fromTo(p.finding, { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.4, clearProps: 'all' }); }
      else p.findingText.textContent = a.finding ?? '';
    }
    if (a.rejected && !a.won) mark(p.findingText, { type: 'strike-through', multiline: true, delay: live ? 300 : 0 });
    else unmark(p.findingText);
    if (live && a.rejected && !prev.rejected && !a.won) shake(p.el, 7);

    if (a.won) mark(p.sheet, { type: 'box', padding: 6, strokeWidth: 3, delay: live ? 2800 : 0 });
    else unmark(p.sheet);

    setAgentStamp(p, a.won ? 'cracked' : out ? 'out' : a.refused ? 'stood-down' : null, live && (a.won !== prev.won || out !== prev.out || a.refused !== prev.refused), a.won ? 2.6 : 0);
    if (live && a.rejected && !prev.rejected && !out && !a.won) flashAgentStamp(p, 'wrong');

    p.prev = { stage: a.stage, notes: a.notes, finding: a.finding, rejected: a.rejected, won: a.won, refused: a.refused, out, odds };
  }
}

const STAMP_TEXT = { cracked: 'CRACKED', out: 'OUT', 'stood-down': 'STOOD DOWN', wrong: 'WRONG CALL' };

function setAgentStamp(p, kind, animate, delay = 0) {
  if (!kind) { if (p.stamp.dataset.kind !== 'wrong') delete p.stamp.dataset.kind; return; } // let a flash run out
  clearTimeout(p.stampTimer);
  p.stamp.textContent = STAMP_TEXT[kind];
  p.stamp.dataset.kind = kind;
  if (animate && animated) { gsap.set(p.stamp, { autoAlpha: 0 }); gsap.delayedCall(delay, () => slam(p.stamp, { shake: p.el })); }
}

/** A wrong call stamps the dossier for a moment, then lifts off again. */
function flashAgentStamp(p, kind) {
  setAgentStamp(p, kind, true);
  p.stampTimer = setTimeout(() => { if (p.stamp.dataset.kind === kind) delete p.stamp.dataset.kind; }, 2600);
}
function pushNotes(p, lines, instant) {
  for (const text of lines) {
    const node = document.createElement('p');
    p.reasoning.appendChild(node);
    if (instant) node.textContent = text; else p.queue.push([node, text]);
  }
  while (p.reasoning.childElementCount > 60) p.reasoning.firstElementChild.remove();
  if (instant) p.reasoning.scrollTop = p.reasoning.scrollHeight;
  else drainNotes(p);
}

/** Restart a one-shot CSS animation (the transcript light, the announcer sweep). */
function blip(el, cls = 'blip') {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

async function drainNotes(p) {
  if (p.draining) return;
  p.draining = true;
  const follow = () => { p.reasoning.scrollTop = p.reasoning.scrollHeight; };
  while (p.queue.length) {
    const [node, text] = p.queue.shift();
    blip(p.tx);
    if (p.queue.length > 3) { node.textContent = text; follow(); continue; } // falling behind: catch up
    await typeOut(node, text, { cps: 110, max: 0.8, onTick: follow });
  }
  p.draining = false;
}

// ---- host controls ----
function renderHost() {
  els.hostOpen.disabled = !(state.phase === 'LOBBY' || state.phase === 'SETTLED');
  els.hostLock.disabled = state.phase !== 'BETTING_OPEN';
  els.hostReset.disabled = state.phase !== 'SETTLED';
  els.runRace.disabled = !(state.phase === 'LOBBY' || state.phase === 'SETTLED');
}

const hostToken = () => { try { return localStorage.getItem('hostToken') || ''; } catch { return ''; } };
const setHostToken = (t) => { try { localStorage.setItem('hostToken', t); } catch { /* ignore */ } };
async function host(path, extra = {}) {
  try {
    const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: hostToken(), ...extra }) });
    // When the server requires a host token, prompt once and retry.
    if (res.status === 403) {
      const entered = prompt('Host token required to control the game:');
      if (entered) { setHostToken(entered.trim()); return host(path, extra); }
    }
    const body = await res.json();
    if (!body.ok) hostSays(body.error ?? 'That did not work.');
    return body;
  } catch { hostSays('Could not reach the server.'); return null; }
}

let statusTimer;
function hostSays(msg) {
  clearTimeout(statusTimer);
  swapText(els.hostStatus, msg);
  statusTimer = setTimeout(() => { els.hostStatus.textContent = ''; }, 6000);
}

els.hostOpen.addEventListener('click', () => host('/api/host/open'));
els.hostLock.addEventListener('click', () => host('/api/host/lock'));
els.hostReset.addEventListener('click', () => host('/api/host/reset'));
els.runRace.addEventListener('click', async () => {
  els.runRace.disabled = true;
  await host('/api/demo/race');
});

// record toggle
let recording = false;
els.recBtn.addEventListener('click', async () => {
  if (!recording) {
    const r = await host('/api/record/start', { label: 'live' });
    if (!r?.ok) return;
    recording = true; label(els.recBtn).textContent = 'STOP RECORDING'; els.recBtn.classList.add('rec-on');
  } else {
    const r = await host('/api/record/stop');
    recording = false; label(els.recBtn).textContent = 'RECORD'; els.recBtn.classList.remove('rec-on');
    if (r?.file) { els.recBtn.title = `saved ${r.file} (${r.count} events)`; hostSays(`Saved ${r.file} (${r.count} events).`); }
  }
});

// replay the committed clean run (the bulletproof demo path)
els.replayBtn.addEventListener('click', async () => {
  els.replayBtn.disabled = true;
  label(els.replayBtn).textContent = 'REPLAYING…';
  await host('/api/replay', { name: 'demo-clean.jsonl' });
  setTimeout(() => { els.replayBtn.disabled = false; label(els.replayBtn).textContent = 'REPLAY'; }, 6000);
});

// the desk slides up from the corner so the projected page stays clean
function setDesk(open) {
  if (open === !els.desk.hidden) return;
  els.hostToggle.setAttribute('aria-expanded', String(open));
  if (open) {
    els.desk.hidden = false;
    if (animated) gsap.fromTo(els.desk, { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.35, ease: 'power3.out', clearProps: 'all' });
    els.desk.querySelector('button:not(:disabled):not(.host-close)')?.focus();
  } else {
    const hadFocus = els.desk.contains(document.activeElement);
    const done = () => { els.desk.hidden = true; if (gsap) gsap.set(els.desk, { clearProps: 'all' }); };
    if (animated) gsap.to(els.desk, { autoAlpha: 0, y: 24, duration: 0.22, ease: 'power2.in', onComplete: done }); else done();
    if (hadFocus) els.hostToggle.focus();
  }
}
els.hostToggle.addEventListener('click', () => setDesk(els.desk.hidden));
els.hostClose.addEventListener('click', () => setDesk(false));

// ---- join code: small ticket in the bankroll, full-screen on demand ----
function showJoinCode() {
  if (els.qrDialog.open) return;
  els.qrDialog.showModal();
  if (animated) gsap.fromTo(els.qrDialog.firstElementChild, { autoAlpha: 0, y: 30, rotation: -1.5 }, { autoAlpha: 1, y: 0, rotation: 0, duration: 0.5, ease: 'power3.out', clearProps: 'all' });
}
els.ticket.addEventListener('click', showJoinCode);
els.qrBtn.addEventListener('click', showJoinCode);
els.qrDialog.addEventListener('click', (e) => { if (e.target === els.qrDialog) els.qrDialog.close(); });

resolveJoinUrl().then(({ url, reachable }) => {
  const text = prettyUrl(url);
  els.joinQr.innerHTML = qrSvg(url, `QR code for ${text}`);
  els.joinQrBig.innerHTML = qrSvg(url, `QR code for ${text}`);
  // break after each dot in the host and before the path, so a long host wraps inside the ticket
  const cut = text.indexOf('/');
  const parts = [...text.slice(0, cut).split(/(?<=\.)/), text.slice(cut)];
  els.joinUrl.replaceChildren(...parts.flatMap((part, i) => (i ? [document.createElement('wbr'), part] : [part])));
  els.joinUrlBig.textContent = text;
  els.joinWarn.hidden = reachable;
});

document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.('input, textarea, select')) return;
  const key = e.key.toLowerCase();
  if (els.qrDialog.open && key !== 'q') return; // the modal owns the keyboard (it handles Esc itself)
  if (key === 'h') setDesk(els.desk.hidden);
  else if (key === 'q') { if (els.qrDialog.open) els.qrDialog.close(); else showJoinCode(); }
  else if (key === 'escape' && !els.desk.hidden && !els.qrDialog.open) setDesk(false);
});

// ---- race clock ----
const clock = { start: null, end: null, timer: null };
const mmss = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };

function drawClock() {
  els.clock.textContent = clock.start == null ? '00:00' : mmss((clock.end ?? performance.now()) - clock.start);
  els.clockWrap.classList.toggle('running', clock.start != null && clock.end == null);
}
function runClock(on) {
  clearInterval(clock.timer);
  if (on) clock.timer = setInterval(drawClock, 250);
  drawClock();
}

/** Follow phase changes as they happen. */
function clockOnEvent(ev) {
  if (ev.type !== 'phase_change') return;
  const to = ev.payload?.to;
  if (to === 'RACING') { clock.start = performance.now(); clock.end = null; runClock(true); }
  else if (to === 'SETTLED' && clock.start != null) { clock.end = performance.now(); runClock(false); }
  else if (to !== 'SETTLED') { clock.start = clock.end = null; runClock(false); }
}

/** Rebuild the clock from a reconnect backlog, using the recorded timestamps. */
function clockFromBacklog(recent = []) {
  const ts = (e) => Number(e.ts) || 0;
  const raced = recent.findLast((e) => e.type === 'phase_change' && e.payload?.to === 'RACING');
  clock.start = clock.end = null;
  if (raced && (state.phase === 'RACING' || state.phase === 'SETTLED')) {
    const settled = recent.findLast((e) => e.type === 'phase_change' && e.payload?.to === 'SETTLED' && ts(e) >= ts(raced));
    const until = settled ? ts(settled) : Math.max(...recent.map(ts));
    clock.start = performance.now() - (until - ts(raced));
    if (settled) clock.end = performance.now();
  }
  runClock(state.phase === 'RACING' && clock.start != null);
}

// ---- WebSocket event stream (auto-reconnect) ----
function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}`);
  ws.onopen = () => { els.conn.classList.add('live'); els.conn.classList.remove('down'); els.conn.textContent = 'LIVE'; };
  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'hello') {
        // a fresh seed replaces whatever we had, so a reconnect can't double up
        state = reduce(initialState(), msg);
        clockFromBacklog(msg.recent);
        render(false);
        return;
      }
      if (msg.type === 'announce') announce({ ...msg.payload, agent: msg.agent }); // audio cue (handled separately)
      state = reduce(state, msg);
      clockOnEvent(msg);
      render(true);
    } catch (e) { console.error('[dashboard] bad frame', e); }
  };
  ws.onclose = () => { els.conn.classList.remove('live'); els.conn.classList.add('down'); els.conn.textContent = 'RECONNECTING'; setTimeout(connect, 1500); };
  ws.onerror = () => ws.close();
}

// ---- announcer (audio cues) ----
// The server emits `announce` events; the big screen plays them. Audio needs a
// user gesture (autoplay policy), so it's off until the host enables it. Lines
// with a `clip` url play that audio; otherwise we fall back to the browser's
// built-in speech synthesis, so the announcer is audible even without a key.
let announcerOn = false;
const audioQueue = [];
let speaking = false;

els.muteBtn.addEventListener('click', () => {
  announcerOn = !announcerOn;
  label(els.muteBtn).textContent = `ANNOUNCER: ${announcerOn ? 'ON' : 'OFF'}`;
  els.muteBtn.setAttribute('aria-pressed', String(announcerOn));
  els.muteBtn.classList.toggle('rec-on', announcerOn);
  if (announcerOn) { try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; window.speechSynthesis.speak(u); } catch { /* no TTS */ } }
  else { audioQueue.length = 0; try { window.speechSynthesis?.cancel(); } catch { /* ignore */ } speaking = false; }
});

let announceSeq = 0;
let airTimer;

function announce(a) {
  if (!a?.text) return;
  const seq = ++announceSeq;
  els.announcer.textContent = a.text;                              // caption always shows
  blip(els.dispatch, 'flash');
  els.dispatch.classList.add('on-air');
  clearTimeout(airTimer);
  airTimer = setTimeout(() => els.dispatch.classList.remove('on-air'), 3500);
  typeOut(els.announcerVis, a.text, { cps: 70, max: 1.4 }).then(() => { if (seq === announceSeq) highlightName(els.announcerVis, a); });
  if (!announcerOn) return;
  if ((a.priority || 0) >= 3) audioQueue.length = 0;                 // a win preempts queued chatter
  if (a.key && audioQueue.some((x) => x.key === a.key)) return;      // don't queue the same line twice
  audioQueue.push(a);
  audioQueue.sort((x, y) => (y.priority || 0) - (x.priority || 0)); // wins/submissions jump ahead
  while (audioQueue.length > 4) audioQueue.pop();                    // drop stale low-priority stragglers
  playNext();
}

/** Once a line has typed out, pick the safecracker's name out in gold. */
function highlightName(el, a) {
  const name = a.agent ? nameOf(a.agent) : '';
  const at = name ? a.text.indexOf(name) : -1;
  if (at < 0) return;
  const who = document.createElement('b');
  who.className = 'who';
  who.textContent = name;
  el.replaceChildren(a.text.slice(0, at), who, a.text.slice(at + name.length));
}

function playNext() {
  if (speaking || !audioQueue.length) return;
  const a = audioQueue.shift();
  speaking = true;
  const done = () => { speaking = false; playNext(); };
  if (a.clip) {
    const audio = new Audio(a.clip);
    audio.onended = done; audio.onerror = done;
    audio.play().catch(done);
  } else if (window.speechSynthesis) {
    const u = new SpeechSynthesisUtterance(a.text);
    u.rate = 1.05;
    u.onend = done; u.onerror = done;
    window.speechSynthesis.speak(u);
  } else { done(); }
}

// ---- boot ----
render(false);
document.fonts?.ready.then(() => placeMarker(false));
addEventListener('resize', () => placeMarker(false));
if (animated) { gsap.set(els.stamp, { autoAlpha: 0 }); gsap.delayedCall(0.75, () => slam(els.stamp)); }
entrance(document.querySelectorAll('[data-reveal]'));
connect();
