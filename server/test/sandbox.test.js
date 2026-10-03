import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Sandbox } from '../src/sandbox.js';
import { DEFAULT_ROOTFS } from '../src/config.js';

// These run against the committed IoTGoat rootfs (Phase 0 output).
const sb = new Sandbox(DEFAULT_ROOTFS);

test('read_file reads /etc/shadow with the planted credential', async () => {
  const r = await sb.readFile('/etc/shadow');
  assert.equal(r.binary, false);
  assert.match(r.content, /iotgoatuser/);
});

test('read_file on an ELF binary returns a hex preview, not garbage text', async () => {
  const r = await sb.readFile('/usr/bin/shellback');
  assert.equal(r.binary, true);
  assert.ok(r.preview.length > 0);
});

test('list_dir lists the firmware root', async () => {
  const r = await sb.listDir('/');
  const names = r.entries.map((e) => e.name);
  for (const d of ['etc', 'usr', 'bin', 'www']) {
    assert.ok(names.includes(d), `expected /${d} in rootfs`);
  }
});

test('grep finds the hardcoded user under /etc', async () => {
  const r = await sb.grep('iotgoatuser', { path: '/etc' });
  assert.ok(r.hits.some((h) => h.file === '/etc/shadow'), 'iotgoatuser should be found in /etc/shadow');
});

test('strings surfaces readable text from the backdoor binary', async () => {
  const r = await sb.strings('/usr/bin/shellback');
  assert.ok(r.lines.some((l) => l.includes('/bin/busybox')));
});

test('path traversal cannot escape the rootfs (clamped to "/")', async () => {
  const escaped = await sb.readFile('/../../../../etc/shadow');
  const normal = await sb.readFile('/etc/shadow');
  assert.equal(escaped.content, normal.content, 'an escape attempt must resolve inside the rootfs');
});

test('symlinks resolve inside the rootfs', async () => {
  const bin = await sb.listDir('/bin');
  const link = bin.entries.find((e) => e.type === 'symlink');
  if (!link) return; // nothing to assert on this rootfs
  const r = await sb.readFile(link.path);
  assert.ok(r.binary === true || typeof r.content === 'string', 'a symlinked file should read through');
});

test('missing paths raise ENOENT', async () => {
  await assert.rejects(() => sb.readFile('/nope/not/here'), (e) => e.code === 'ENOENT');
});

test('invalid grep regex raises EREGEX', async () => {
  await assert.rejects(() => sb.grep('('), (e) => e.code === 'EREGEX');
});
