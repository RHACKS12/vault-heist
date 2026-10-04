import { test } from 'node:test';
import assert from 'node:assert/strict';
import { joinUrls } from '../src/lan.js';

const iface = (address, extra = {}) => ({ address, family: 'IPv4', internal: false, ...extra });

test('PUBLIC_URL wins and loses its trailing slash', () => {
  assert.deepEqual(joinUrls({ port: 3000, publicUrl: 'https://heist.example.com/', interfaces: {} }), ['https://heist.example.com']);
});

test('external IPv4 addresses are listed with the most likely Wi-Fi range first', () => {
  const urls = joinUrls({
    port: 3000, publicUrl: '',
    interfaces: {
      lo: [iface('127.0.0.1', { internal: true })],
      docker0: [iface('172.17.0.1')],
      tun0: [iface('100.64.1.2')],
      wlan0: [iface('192.168.1.42'), { address: 'fe80::1', family: 'IPv6', internal: false }],
      eth0: [iface('10.0.0.7')],
    },
  });
  assert.deepEqual(urls, ['http://192.168.1.42:3000', 'http://10.0.0.7:3000', 'http://172.17.0.1:3000', 'http://100.64.1.2:3000']);
});

test('no external interfaces means no join URLs', () => {
  assert.deepEqual(joinUrls({ port: 3000, publicUrl: '', interfaces: { lo: [iface('127.0.0.1', { internal: true })] } }), []);
});
