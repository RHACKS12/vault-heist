// Player screen: join the lobby on your phone, place one bet, watch the race,
// see your payout. Uses the shared reducer for live phase/odds/winner state;
// fx.js adds the motion on top of what render() draws.
import { initialState, reduce, CREW } from '/reducer.js';
import { gsap, animated, countTo, slam, swapText, entrance, mark, unmark } from '/fx.js';

let state = initialState();

// per-player identity persisted on this device
const store = {
  get id() { try { return localStorage.getItem('playerId'); } catch { return null; } },
  get name() { try { return localStorage.getItem('playerName') || ''; } catch { return ''; } },
  get balance() { try { return Number(localStorage.getItem('balance') ?? '100'); } catch { return 100; } },
  save(id, name, balance) { try { localStorage.setItem('playerId', id); localStorage.setItem('playerName', name); localStorage.setItem('balance', String(balance)); } catch { /* private mode */ } },
  setBalance(b) { try { localStorage.setItem('balance', String(b)); } catch { /* ignore */ } },
};

let selected = null;          // chosen agent for the pending bet
let myBetRound = null;        // round number I've already bet in
let lastPhase = null;
let revealedRound = null;     // round whose payout card has already made its entrance

const $ = (id) => document.getElementById(id);
const nameOf = (id) => CREW.find((d) => d.id === id)?.name ?? id;
const PHASE_LABEL = { LOBBY: 'LOBBY', BETTING_OPEN: 'BETTING OPEN', BETS_LOCKED: 'BETS LOCKED', RACING: 'RACING', SETTLED: 'SETTLED' };

// build the pick buttons
const picksEl = $('picks');
for (const def of CREW) {
  const b = document.createElement('button');
  b.className = 'pick';
  b.type = 'button';
  b.dataset.agent = def.id;
  b.setAttribute('aria-pressed', 'false');
  b.innerHTML = `<span class="pick-avatar" aria-hidden="true">${def.name[0]}</span><span class="pick-info"><span class="pick-name">${def.name}</span><span class="pick-strategy">${def.strategy}</span></span><span class="pick-odds">—</span>`;
  b.addEventListener('click', () => {
    if (!canBet()) return;
    selected = def.id;
    render();
    if (animated) gsap.fromTo(b, { scale: 0.97 }, { scale: 1, duration: 0.4, ease: 'back.out(3)', clearProps: 'scale' });
  });
  picksEl.appendChild(b);
}

function canBet() {
  return Boolean(store.id) && state.bettingOpen && myBetRound !== state.round;
}

function renderPicks() {
  for (const b of picksEl.children) {
    const id = b.dataset.agent;
    const odds = b.querySelector('.pick-odds');
    b.classList.toggle('sel', id === selected);
    b.setAttribute('aria-pressed', String(id === selected));
    odds.textContent = state.odds?.[id] ? `×${state.odds[id]}` : '—';
    b.disabled = !canBet();
    // a hand-drawn ring around the odds you're backing
    if (id === selected) mark(odds, { type: 'circle', color: '#f0ede7', padding: 7, strokeWidth: 2, iterations: 1 });
    else unmark(odds);
  }
}

function render(live = true) {
  const phase = $('phase');
  phase.textContent = PHASE_LABEL[state.phase] ?? state.phase;
  phase.classList.toggle('open', state.phase === 'BETTING_OPEN');
  countTo($('pot'), state.pot);
  countTo($('balance'), store.balance);
  $('alias').textContent = store.name;

  const joined = Boolean(store.id);
  $('joinView').hidden = joined;
  $('betView').hidden = !joined;

  // phase guidance
  const note = {
    LOBBY: 'Stand by. Waiting for the host to open betting.',
    BETTING_OPEN: myBetRound === state.round ? 'Your chips are in. Waiting for the host to lock bets and start the heist.' : 'Betting is open. Pick a safecracker and place your chips.',
    BETS_LOCKED: 'Bets locked. The heist is about to begin.',
    RACING: 'The crew is on the case. Follow the live investigation on the big screen.',
    SETTLED: '',
  }[state.phase] ?? '';
  if (live) swapText($('phaseNote'), note); else $('phaseNote').textContent = note;
  const open = canBet();
  $('betBtn').disabled = !open || !selected;
  $('amount').disabled = !open;
  for (const c of document.querySelectorAll('.chip')) c.disabled = !open;
  renderPicks();
  renderResult(live);
}

function renderResult(live) {
  const settled = state.phase === 'SETTLED' && state.payouts;
  const card = $('resultView');
  card.hidden = !settled;
  if (!settled) return;
  const mine = state.payouts.find((p) => p.playerId === store.id);
  const rt = $('resultText');
  const stamp = $('resultStamp');
  let kind = null;
  if (!mine) { rt.textContent = 'You sat this round out.'; rt.className = 'result'; }
  else if (mine.won) { rt.textContent = `Your crew cracked it. Your take: ${mine.payout} chips.`; rt.className = 'result win'; kind = ['PAID', 'win']; }
  else if (state.winner) { rt.textContent = `Your pick didn’t crack it. ${nameOf(state.winner)} took the round.`; rt.className = 'result lose'; kind = ['BUSTED', 'lose']; }
  else { rt.textContent = `No one cracked it. Your ${mine.payout} chips were refunded.`; rt.className = 'result'; kind = ['REFUNDED', 'even']; }
  stamp.textContent = kind?.[0] ?? '';
  stamp.className = `result-stamp ${kind?.[1] ?? ''}`;
  countTo($('balance2'), store.balance, { duration: 1.4 });

  if (!live || revealedRound === state.round) return;
  revealedRound = state.round;
  if (!animated) return;
  gsap.fromTo(card, { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.5, ease: 'power3.out', clearProps: 'all' });
  if (kind) gsap.delayedCall(0.35, () => slam(stamp, { shake: card }));
  if (mine?.won) { gsap.delayedCall(0.6, () => burst(card, stamp)); navigator.vibrate?.([30, 50, 30]); }
}

/** Chips fly out of the payout stamp. */
function burst(card, from) {
  const colors = ['#ac1903', '#1a1410', '#315d3b', '#c5a578'];
  const box = card.getBoundingClientRect();
  const src = from.getBoundingClientRect();
  const x0 = src.left - box.left + src.width / 2;
  const y0 = src.top - box.top + src.height / 2;
  for (let i = 0; i < 22; i++) {
    const chip = document.createElement('i');
    chip.className = 'burst';
    chip.style.cssText = `left:${x0}px;top:${y0}px;background:${colors[i % colors.length]}`;
    card.appendChild(chip);
    const dx = gsap.utils.random(-170, 120);
    gsap.timeline({ onComplete: () => chip.remove() })
      .to(chip, { x: dx * 0.6, y: gsap.utils.random(-150, -60), rotation: gsap.utils.random(-200, 200), duration: 0.45, ease: 'power2.out' })
      .to(chip, { x: dx, y: gsap.utils.random(60, 160), autoAlpha: 0, duration: 0.8, ease: 'power2.in' });
  }
}

/** Fade one card out and the next one in. */
function swapCards(out, then) {
  if (!animated) { then(); return; }
  gsap.to(out, { autoAlpha: 0, y: -14, duration: 0.25, ease: 'power2.in', onComplete: () => {
    gsap.set(out, { clearProps: 'all' });
    then();
    gsap.fromTo('#betView', { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: 0.45, ease: 'power3.out', clearProps: 'all' });
  } });
}

// ---- actions ----
$('joinForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('name').value.trim() || 'anon';
  const btn = $('joinBtn');
  btn.disabled = true;
  try {
    const res = await (await fetch('/api/join', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) })).json();
    if (res.ok) { store.save(res.playerId, res.name, res.balance); swapCards($('joinView'), () => render()); }
    else $('alias-hint').textContent = `Couldn't join: ${res.error}`;
  } catch { $('alias-hint').textContent = "Couldn't reach the heist. Check your connection and try again."; }
  btn.disabled = false;
});

for (const chip of document.querySelectorAll('.chip')) {
  chip.addEventListener('click', () => {
    const want = chip.dataset.chips === 'all' ? store.balance : Number(chip.dataset.chips);
    const amount = $('amount');
    amount.value = Math.max(1, Math.min(want, store.balance));
    if (animated) gsap.fromTo(amount, { scale: 1.08 }, { scale: 1, duration: 0.35, ease: 'back.out(3)', clearProps: 'scale' });
  });
}

$('betBtn').addEventListener('click', async () => {
  if (!selected || !canBet()) return;
  const amount = Math.floor(Number($('amount').value));
  const status = $('betStatus');
  try {
    const res = await (await fetch('/api/bet', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ playerId: store.id, agent: selected, amount }) })).json();
    if (res.ok) {
      store.setBalance(res.balance);
      myBetRound = state.round;
      const odds = state.odds?.[selected];
      status.textContent = `Bet confirmed: ${amount} chips on ${nameOf(selected)}${odds ? ` at ×${odds}` : ''}.`;
      $('slipStamp').hidden = false;
      slam($('slipStamp'), { shake: $('betView') });
      navigator.vibrate?.(25);
      render();
    } else {
      status.textContent = `Bet not placed: ${res.error}`;
    }
  } catch { status.textContent = 'Bet not placed: network error. Check your connection.'; }
});

// ---- event stream ----
// `replay` = true for backlog events on (re)connect; we must NOT re-credit the
// balance for those, since it already reflects past payouts.
function onEvent(ev, replay = false) {
  state = reduce(state, ev);

  if (state.phase !== lastPhase) {
    if (state.phase === 'BETTING_OPEN' && myBetRound !== state.round) { selected = null; $('betStatus').textContent = ''; $('slipStamp').hidden = true; }
    lastPhase = state.phase;
  }
  if (!replay && ev.type === 'settled' && store.id) {
    const mine = ev.payload?.payouts?.find((p) => p.playerId === store.id);
    if (mine) {
      $('balance2').dataset.value = store.balance; // count the payout up from the old stack
      store.setBalance(store.balance + mine.payout);
    }
  }
  if (!replay) render();
}

function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}`);
  ws.onopen = () => { $('conn').classList.add('live'); $('conn').textContent = 'LIVE'; $('conn').setAttribute('aria-label', 'Live connection: connected'); };
  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.type === 'hello') {
        if (msg.phase) state.phase = msg.phase;
        (msg.recent || []).forEach((r) => onEvent(r, true));
        if (state.phase === 'SETTLED') revealedRound = state.round; // already over: no fanfare on reconnect
        render(false);
      } else onEvent(msg);
    } catch { /* ignore bad frame */ }
  };
  ws.onclose = () => { $('conn').classList.remove('live'); $('conn').textContent = 'RECONNECTING'; $('conn').setAttribute('aria-label', 'Live connection: reconnecting'); setTimeout(connect, 1500); };
  ws.onerror = () => ws.close();
}

render(false);
entrance(document.querySelectorAll('[data-reveal]'));
connect();
