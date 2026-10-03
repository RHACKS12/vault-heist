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
      <div class="agent-status">—</div>
    </div>
    <div class="bar">${STAGES.map(() => '<div class="seg"></div>').join('')}</div>
    <div class="bar-labels">${STAGES.map((s) => `<span>${s}</span>`).join('')}</div>
    <div class="reasoning"></div>
    <div class="finding" hidden></div>`;
  crewEl.appendChild(el);
  panels[def.id] = {
    el,
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
  runRace: document.getElementById('runRace'),
};

function render() {
  els.phase.textContent = state.phase;
  els.round.textContent = state.round;
  els.pot.textContent = state.pot;

  // vault state: racing while RACING, cracked once there's a winner, else idle
  els.vault.dataset.state = state.winner ? 'cracked' : state.phase === 'RACING' ? 'racing' : 'idle';
  if (state.winner) {
    const w = state.agents[state.winner];
    els.verdict.innerHTML = `<b>${w ? w.name : state.winner}</b> cracked the mark.`;
    els.vaultLabel.textContent = 'CRACKED';
  } else if (state.phase === 'SETTLED') {
    els.verdict.textContent = 'No one cracked it this round.';
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
    p.segs.forEach((seg, i) => seg.classList.toggle('on', i < a.stage));
    // reasoning log (only re-render if line count changed)
    if (p.reasoning.childElementCount !== a.reasoning.length) {
      p.reasoning.innerHTML = a.reasoning.map((t) => `<p></p>`).join('');
      [...p.reasoning.children].forEach((node, i) => { node.textContent = a.reasoning[i]; });
      p.reasoning.scrollTop = p.reasoning.scrollHeight;
    }
    if (a.finding) { p.finding.hidden = false; p.finding.textContent = a.finding; }
    else { p.finding.hidden = true; }
  }
}

// ---- WebSocket event stream (auto-reconnect) ----
function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}`);
  ws.onopen = () => { els.conn.classList.add('live'); els.conn.classList.remove('down'); };
  ws.onmessage = (ev) => {
    try { state = reduce(state, JSON.parse(ev.data)); render(); } catch { /* ignore bad frame */ }
  };
  ws.onclose = () => {
    els.conn.classList.remove('live'); els.conn.classList.add('down');
    setTimeout(connect, 1500); // reconnect
  };
  ws.onerror = () => ws.close();
}

els.runRace.addEventListener('click', async () => {
  els.runRace.disabled = true;
  try { await fetch('/api/demo/race', { method: 'POST' }); }
  catch { /* ignore */ }
  setTimeout(() => { els.runRace.disabled = false; }, 2000);
});

render();
connect();
