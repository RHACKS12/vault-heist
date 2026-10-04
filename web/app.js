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
  recBtn: document.getElementById('recBtn'),
  replayBtn: document.getElementById('replayBtn'),
  muteBtn: document.getElementById('muteBtn'),
  announcer: document.getElementById('announcer'),
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
    p.el.classList.toggle('rejected', a.rejected && !a.won);
    p.status.textContent = a.won ? 'CRACKED'
      : a.refused ? 'STOOD DOWN'
      : a.rejected ? (a.attemptsLeft === 0 ? 'OUT OF GUESSES' : `WRONG CALL · ${a.attemptsLeft} LEFT`)
      : a.stage > 0 ? 'ON THE JOB' : '—';
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
  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'announce') announce(msg.payload);   // audio cue (handled separately)
      state = reduce(state, msg);
      render();
    } catch { /* ignore bad frame */ }
  };
  ws.onclose = () => { els.conn.classList.remove('live'); els.conn.classList.add('down'); setTimeout(connect, 1500); };
  ws.onerror = () => ws.close();
}

// ---- host controls ----
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
    return await res.json();
  } catch { return null; }
}
els.hostOpen.addEventListener('click', () => host('/api/host/open'));
els.hostLock.addEventListener('click', () => host('/api/host/lock'));
els.hostReset.addEventListener('click', () => host('/api/host/reset'));
els.runRace.addEventListener('click', async () => {
  els.runRace.disabled = true;
  try { await host('/api/demo/race'); } catch { /* ignore */ }
});

// record toggle
let recording = false;
els.recBtn.addEventListener('click', async () => {
  if (!recording) {
    await host('/api/record/start', { label: 'live' });
    recording = true; els.recBtn.textContent = '■ STOP REC'; els.recBtn.classList.add('rec-on');
  } else {
    const r = await host('/api/record/stop');
    recording = false; els.recBtn.textContent = '● REC'; els.recBtn.classList.remove('rec-on');
    if (r?.file) els.recBtn.title = `saved ${r.file} (${r.count} events)`;
  }
});

// replay the committed clean run (the bulletproof demo path)
els.replayBtn.addEventListener('click', async () => {
  els.replayBtn.disabled = true;
  els.replayBtn.textContent = '▶ REPLAYING…';
  await host('/api/replay', { name: 'demo-clean.jsonl' });
  setTimeout(() => { els.replayBtn.disabled = false; els.replayBtn.textContent = '▶ REPLAY'; }, 6000);
});

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
  els.muteBtn.textContent = `🔊 ANNOUNCER: ${announcerOn ? 'ON' : 'OFF'}`;
  els.muteBtn.classList.toggle('rec-on', announcerOn);
  if (announcerOn) { try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; window.speechSynthesis.speak(u); } catch { /* no TTS */ } }
  else { audioQueue.length = 0; try { window.speechSynthesis?.cancel(); } catch { /* ignore */ } speaking = false; }
});

function announce(a) {
  if (!a?.text) return;
  els.announcer.textContent = `📣 ${a.text}`;                       // caption always shows
  els.announcer.classList.remove('flash'); void els.announcer.offsetWidth; els.announcer.classList.add('flash');
  if (!announcerOn) return;
  if ((a.priority || 0) >= 3) audioQueue.length = 0;                 // a win preempts queued chatter
  if (a.key && audioQueue.some((x) => x.key === a.key)) return;      // don't queue the same line twice
  audioQueue.push(a);
  audioQueue.sort((x, y) => (y.priority || 0) - (x.priority || 0)); // wins/submissions jump ahead
  while (audioQueue.length > 4) audioQueue.pop();                    // drop stale low-priority stragglers
  playNext();
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

render();
connect();
