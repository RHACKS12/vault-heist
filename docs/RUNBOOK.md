# Demo-day runbook — Vault Heist

A step-by-step run-of-show for the pitch. Goal: a live, interactive, narrated
heist that **cannot break on stage**.

## The golden rule

Run the **live** interactive demo when the network is healthy; keep **REPLAY**
one click away as the fallback. Both use the exact same screen and code — judges
can't tell the difference.

## Before you leave / the night before

- [ ] `npm install` and `npm test` pass on the demo laptop.
- [ ] `npm start` boots and the log shows `announcer: 17 pre-generated clips loaded`.
- [ ] Open `http://localhost:3000/`, click **ANNOUNCER: ON**, click **▶ REPLAY** —
      confirm the vault cracks and you hear the voice. This verifies audio + the
      fallback path end to end.
- [ ] Note the laptop's LAN IP (`ipconfig` / `ifconfig`) so phones can reach
      `http://<ip>:3000/play.html`. Put a QR to that URL on a slide if you can.
- [ ] Decide host gating: set `HOST_TOKEN` in `.env` for a real event, or leave
      it unset for a friendly room. If set, on the dashboard run
      `localStorage.hostToken = '<token>'` in the browser console once.
- [ ] Charge the laptop; have a phone hotspot as a backup network.

## Setup at the table (2 minutes)

1. `npm start` on the demo laptop. Put the **dashboard** (`/`) on the projector.
2. Click **🔊 ANNOUNCER: ON** once (audio needs one click to unlock).
3. Show the join URL / QR: `http://<laptop-ip>:3000/play.html`.

## The live run (~3 minutes)

1. **Judges join** on their phones (alias → JOIN). The dashboard footer shows the
   lobby filling up.
2. Host clicks **OPEN BETTING**. "Bets are now open!" Judges each pick a
   safecracker and drop chips — odds and the pot shift live on the big screen.
3. When everyone's in, host clicks **LOCK & START**. "Bets are locked — and
   they're off!"
4. The crew races: reasoning streams in the three panels, milestone bars advance,
   the announcer calls each break-in, avatars work the vault.
5. First correct submission — the vault **CRACKS**, "We have a winner!", and the
   pot splits to that agent's backers. Each judge sees their payout on their phone.
6. Host clicks **NEW ROUND** to run it again, or move to the close.

## If anything looks shaky

- **Flaky WiFi / an agent stalls / you're short on time** → click **▶ REPLAY**.
  It plays the pre-vetted `demo-clean.jsonl` run start to finish with narration,
  no network needed. Narrate over it as if live.
- **No audio** → you missed the one-time **ANNOUNCER** click; click it, it works
  from the next line.
- **Phones can't reach the laptop** → make sure they're on the same network;
  fall back to REPLAY and let judges watch the big screen.

## Talking points (work these in)

- It's **identification-only** authorized firmware analysis on OWASP IoTGoat — a
  real, documented CVE-style vulnerability, found live.
- Three different model families with **different search strategies**, so the
  winner genuinely varies round to round — that's what makes the betting real.
- Everything is one **event stream**; the announcer and the bulletproof replay
  both fall out of that design.
- One line nodding to the social-engineering / security theme the organizers are
  spotlighting.

## Reset between runs / groups

- **NEW ROUND** (from SETTLED) returns to the lobby; players keep their chip
  balances across rounds.
- To wipe everything, restart the server (`Ctrl+C`, `npm start`).
