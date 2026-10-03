// Player screen: join the lobby on your phone, place one bet, watch the race,
// see your payout. Uses the shared reducer for live phase/odds/winner state.
import { initialState, reduce, CREW } from '/reducer.js';

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

const $ = (id) => document.getElementById(id);

// build the pick buttons
const picksEl = $('picks');
for (const def of CREW) {
  const b = document.createElement('button');
  b.className = 'pick';
  b.dataset.agent = def.id;
  b.innerHTML = `<span>${def.name}</span><span style="font-size:11px;color:var(--ink-soft)">${def.strategy}</span><span class="pick-odds">—</span>`;
  b.addEventListener('click', () => { if (canBet()) { selected = def.id; render(); } });
  picksEl.appendChild(b);
}

function canBet() {
  return Boolean(store.id) && state.bettingOpen && myBetRound !== state.round;
}

function renderPicks() {
  for (const b of picksEl.children) {
    const id = b.dataset.agent;
    b.classList.toggle('sel', id === selected);
    b.querySelector('.pick-odds').textContent = state.odds?.[id] ? `×${state.odds[id]}` : '—';
    b.disabled = !canBet();
  }
}

function render() {
  $('phase').textContent = state.phase;
  $('pot').textContent = state.pot;
  $('balance').textContent = store.balance;

  const joined = Boolean(store.id);
  $('joinView').hidden = joined;
  $('betView').hidden = !joined;

  // phase guidance
  const note = {
    LOBBY: 'Waiting for the host to open betting…',
    BETTING_OPEN: myBetRound === state.round ? 'Bet placed. Waiting for the host to lock & start.' : 'Bets are OPEN — pick a safecracker and place your chips.',
    BETS_LOCKED: 'Bets locked. And they’re off!',
    RACING: 'The crew is racing…',
    SETTLED: '',
  }[state.phase] ?? '';
  $('phaseNote').textContent = note;
  $('betBtn').disabled = !canBet() || !selected;
  $('amount').disabled = !canBet();
  renderPicks();

  // result card on settle
  const settled = state.phase === 'SETTLED' && state.payouts;
  $('resultView').hidden = !settled;
  if (settled) {
    const mine = state.payouts.find((p) => p.playerId === store.id);
    const rt = $('resultText');
    if (!mine) { rt.textContent = 'You sat this round out.'; rt.className = 'result'; }
    else if (mine.won) { rt.textContent = `🏆 Your crew cracked it — you took ${mine.payout} chips!`; rt.className = 'result win'; }
    else if (state.winner) { rt.textContent = `Your pick didn’t crack it. ${state.winner} took the round.`; rt.className = 'result lose'; }
    else { rt.textContent = `No one cracked it — your ${mine.payout} chips were refunded.`; rt.className = 'result'; }
    $('balance2').textContent = store.balance;
  }
}

// ---- actions ----
$('joinBtn').addEventListener('click', async () => {
  const name = $('name').value.trim() || 'anon';
  try {
    const res = await (await fetch('/api/join', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) })).json();
    if (res.ok) { store.save(res.playerId, res.name, res.balance); render(); }
  } catch { /* ignore */ }
});

$('betBtn').addEventListener('click', async () => {
  if (!selected || !canBet()) return;
  const amount = Math.floor(Number($('amount').value));
  try {
    const res = await (await fetch('/api/bet', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ playerId: store.id, agent: selected, amount }) })).json();
    if (res.ok) {
      store.setBalance(res.balance);
      myBetRound = state.round;
      $('betStatus').textContent = `✓ ${amount} chips on ${selected}.`;
      render();
    } else {
      $('betStatus').textContent = `✗ ${res.error}`;
    }
  } catch { $('betStatus').textContent = '✗ network error'; }
});

// ---- event stream ----
// `replay` = true for backlog events on (re)connect; we must NOT re-credit the
// balance for those, since it already reflects past payouts.
function onEvent(ev, replay = false) {
  state = reduce(state, ev);

  if (state.phase !== lastPhase) {
    if (state.phase === 'BETTING_OPEN' && myBetRound !== state.round) { selected = null; $('betStatus').textContent = ''; }
    lastPhase = state.phase;
  }
  if (!replay && ev.type === 'settled' && store.id) {
    const mine = ev.payload?.payouts?.find((p) => p.playerId === store.id);
    if (mine) store.setBalance(store.balance + mine.payout);
  }
  if (!replay) render();
}

function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}`);
  ws.onopen = () => { $('conn').classList.add('live'); };
  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.type === 'hello') {
        if (msg.phase) state.phase = msg.phase;
        (msg.recent || []).forEach((r) => onEvent(r, true));
        render();
      } else onEvent(msg);
    } catch { /* ignore bad frame */ }
  };
  ws.onclose = () => { $('conn').classList.remove('live'); setTimeout(connect, 1500); };
  ws.onerror = () => ws.close();
}

render();
connect();
