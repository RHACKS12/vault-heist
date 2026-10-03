// Observer dashboard: connect to the event stream, fold events through the pure
// reducer, and render. All DOM lives here; all state logic lives in reducer.js.
import { initialState, reduce, CREW, STAGES } from '/reducer.js';

let state = initialState();

// ---- build the crew panels once, keep refs for fast updates ----
const crewEl = document.getElementById('crew');
const panels = {};
for (const def of CREW) {
  const el = document.createElement('div');
  el.className = 'agent';
  el.innerHTML = `
    <div class="agent-head">
      <div class="avatar">${def.name[0]}</div>
      <div>
        <div class="agent-name">${def.name}</div>
        <div class="agent-strategy">${def.strategy}</div>
      </div>
      <div class="agent-odds"><b>—</b><span>odds</span></div>
      <div class="agent-status">—</div>
    </div>
    <div class="agent-bets" hidden></div>
    <div class="bar">${STAGES.map(() => '<div class="seg"></div>').join('')}</div>
    <div class="bar-labels">${STAGES.map((s) => `<span>${s}</span>`).join('')}</div>
    <div class="reasoning"></div>
    <div class="finding" hidden></div>`;
  crewEl.appendChild(el);
  panels[def.id] = {
    el,
    odds: el.querySelector('.agent-odds b'),
    bets: el.querySelector('.agent-bets'),
    status: el.querySelector('.agent-status'),
    segs: [...el.querySelectorAll('.seg')],
    reasoning: el.querySelector('.reasoning'),
    finding: el.querySelector('.finding'),
  };
}

const els = {
  phase: document.getElementById('phase'),
  round: document.getElementById('round'),
  conn: document.getElementById('conn'),
  vault: document.getElementById('vault'),
  vaultLabel: document.getElementById('vaultLabel'),
  verdict: document.getElementById('verdict'),
  pot: document.getElementById('pot'),
  players: document.getElementById('players'),
  joinUrl: document.getElementById('joinUrl'),
  hostOpen: document.getElementById('hostOpen'),
  hostLock: document.getElementById('hostLock'),
  hostReset: document.getElementById('hostReset'),
  runRace: document.getElementById('runRace'),
};
els.joinUrl.textContent = `${location.host}/play.html`;

function render() {
  els.phase.textContent = state.phase;
  els.round.textContent = state.round;
  els.pot.textContent = state.pot;
  els.players.textContent = state.players;

  els.vault.dataset.state = state.winner ? 'cracked' : state.phase === 'RACING' ? 'racing' : 'idle';
  if (state.winner) {
    const w = state.agents[state.winner];
    els.verdict.innerHTML = `<b>${w ? w.name : state.winner}</b> cracked the mark.${payoutLine()}`;
    els.vaultLabel.textContent = 'CRACKED';
  } else if (state.phase === 'SETTLED') {
    els.verdict.textContent = `No one cracked it — the pot was refunded.`;
    els.vaultLabel.textContent = 'THE MARK';
  } else if (state.phase === 'BETTING_OPEN') {
    els.verdict.textContent = 'Place your bets — the lobby is open.';
    els.vaultLabel.textContent = 'THE MARK';
  } else {
    els.verdict.textContent = state.phase === 'RACING' ? 'The crew is working the mark…' : '';
    els.vaultLabel.textContent = 'THE MARK';
  }

  for (const def of CREW) {
    const a = state.agents[def.id];
    const p = panels[def.id];
    p.el.classList.toggle('won', a.won);
    p.el.classList.toggle('refused', a.refused);
    p.status.textContent = a.won ? 'CRACKED' : a.refused ? 'STOOD DOWN' : a.stage > 0 ? 'ON THE JOB' : '—';
    const o = state.odds?.[def.id];
    p.odds.textContent = o ? `×${o}` : '—';
    const n = state.counts?.[def.id] ?? 0;
    const chips = state.totals?.[def.id] ?? 0;
    if (n > 0) { p.bets.hidden = false; p.bets.textContent = `${n} bet${n > 1 ? 's' : ''} · ${chips} chips`; }
    else { p.bets.hidden = true; }

    p.segs.forEach((seg, i) => seg.classList.toggle('on', i < a.stage));
    if (p.reasoning.childElementCount !== a.reasoning.length) {
      p.reasoning.innerHTML = a.reasoning.map(() => '<p></p>').join('');
      [...p.reasoning.children].forEach((node, i) => { node.textContent = a.reasoning[i]; });
      p.reasoning.scrollTop = p.reasoning.scrollHeight;
    }
    if (a.finding) { p.finding.hidden = false; p.finding.textContent = a.finding; }
    else { p.finding.hidden = true; }
  }

  // host controls enabled by phase
  els.hostOpen.disabled = !(state.phase === 'LOBBY' || state.phase === 'SETTLED');
  els.hostLock.disabled = state.phase !== 'BETTING_OPEN';
  els.hostReset.disabled = state.phase !== 'SETTLED';
  els.runRace.disabled = !(state.phase === 'LOBBY' || state.phase === 'SETTLED');
}

function payoutLine() {
  if (!state.payouts?.length) return '';
  const winners = state.payouts.filter((p) => p.won);
  const paid = winners.reduce((s, p) => s + p.payout, 0);
  return winners.length ? ` <span class="pay">${winners.length} backer${winners.length > 1 ? 's' : ''} split ${paid} chips.</span>` : '';
}

// ---- WebSocket event stream (auto-reconnect) ----
function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}`);
  ws.onopen = () => { els.conn.classList.add('live'); els.conn.classList.remove('down'); };
  ws.onmessage = (ev) => { try { state = reduce(state, JSON.parse(ev.data)); render(); } catch { /* ignore */ } };
  ws.onclose = () => { els.conn.classList.remove('live'); els.conn.classList.add('down'); setTimeout(connect, 1500); };
  ws.onerror = () => ws.close();
}

// ---- host controls ----
const hostToken = () => { try { return localStorage.getItem('hostToken') || ''; } catch { return ''; } };
async function host(path) {
  try { await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: hostToken() }) }); }
  catch { /* ignore */ }
}
els.hostOpen.addEventListener('click', () => host('/api/host/open'));
els.hostLock.addEventListener('click', () => host('/api/host/lock'));
els.hostReset.addEventListener('click', () => host('/api/host/reset'));
els.runRace.addEventListener('click', async () => {
  els.runRace.disabled = true;
  try { await fetch('/api/demo/race', { method: 'POST' }); } catch { /* ignore */ }
});

render();
connect();
