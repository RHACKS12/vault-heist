// Read-only firmware sandbox.
//
// The agents never get a shell. They get four safe, bounded tools over one
// extracted rootfs that is treated as "/": list_dir, read_file, grep, strings.
//
// Security model: the rootfs is a chroot-like jail. Every agent-supplied path
// is normalized to a POSIX absolute "virtual" path whose leading ".." are
// clamped at "/", then mapped under the real root with path.join(root, "." + v)
// — so it can never point above the root lexically. Symlinks are followed
// manually and RE-ROOTED (an absolute link target like "/bin/busybox" resolves
// inside the rootfs, not on the host), so even a malicious link cannot escape.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

const MAX_SYMLINK_DEPTH = 40;

export class SandboxError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'SandboxError';
    this.code = code;
  }
}

export class Sandbox {
  /** @param {string} root absolute path to the firmware rootfs (treated as "/") */
  constructor(root) {
    if (!root) throw new SandboxError('Sandbox requires a root path', 'NO_ROOT');
    this.root = path.resolve(root);
  }

  // --- path helpers -------------------------------------------------------

  /** Normalize to a POSIX absolute virtual path, clamping any escape at "/". */
  _virtual(p) {
    if (typeof p !== 'string' || p.length === 0) p = '/';
    const unix = p.replace(/\\/g, '/');
    // normalizing a leading-slash path makes leading ".." collapse to root
    const v = path.posix.normalize('/' + unix.replace(/^\/+/, ''));
    return v === '' ? '/' : v;
  }

  /** Map a virtual path to its real on-disk path — always under root. */
  _real(virtual) {
    return path.join(this.root, '.' + virtual);
  }

  /**
   * Follow symlinks, re-rooting absolute targets into the rootfs. Returns the
   * final virtual path of a real (non-symlink) node. Throws ENOENT/ELOOP.
   */
  _resolve(virtual, { follow = true } = {}) {
    let v = this._virtual(virtual);
    if (!follow) return v;
    for (let depth = 0; depth <= MAX_SYMLINK_DEPTH; depth++) {
      let st;
      try {
        st = fs.lstatSync(this._real(v));
      } catch (e) {
        if (e.code === 'ENOENT') throw new SandboxError(`No such path: ${v}`, 'ENOENT');
        throw new SandboxError(`Cannot stat ${v}: ${e.code}`, e.code);
      }
      if (!st.isSymbolicLink()) return v;
      const target = fs.readlinkSync(this._real(v)).replace(/\\/g, '/');
      v = target.startsWith('/')
        ? this._virtual(target)                                              // absolute -> rootfs "/"
        : this._virtual(path.posix.join(path.posix.dirname(v), target));     // relative to link dir
    }
    throw new SandboxError(`Too many levels of symbolic links: ${virtual}`, 'ELOOP');
  }

  // --- the four agent tools ----------------------------------------------

  /** List a directory. Entries are labelled file/dir/symlink/other. */
  async listDir(p = '/') {
    const v = this._resolve(p);
    const real = this._real(v);
    let st;
    try { st = await fsp.stat(real); }
    catch { throw new SandboxError(`No such directory: ${v}`, 'ENOENT'); }
    if (!st.isDirectory()) throw new SandboxError(`Not a directory: ${v}`, 'ENOTDIR');

    const dirents = await fsp.readdir(real, { withFileTypes: true });
    const entries = [];
    for (const d of dirents) {
      let type = 'other';
      if (d.isSymbolicLink()) type = 'symlink';
      else if (d.isDirectory()) type = 'dir';
      else if (d.isFile()) type = 'file';
      const entry = { name: d.name, type, path: path.posix.join(v, d.name) };
      if (type === 'symlink') {
        try { entry.target = await fsp.readlink(path.join(real, d.name)); } catch { /* ignore */ }
      }
      entries.push(entry);
    }
    entries.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type.localeCompare(b.type)));
    return { path: v, entries };
  }

  /** Read a file, byte-capped. Binary files come back as a hex/ascii preview. */
  async readFile(p, { maxBytes = 8192 } = {}) {
    const v = this._resolve(p);
    const real = this._real(v);
    const st = await fsp.stat(real).catch(() => { throw new SandboxError(`No such file: ${v}`, 'ENOENT'); });
    if (st.isDirectory()) throw new SandboxError(`Is a directory: ${v}`, 'EISDIR');

    const fh = await fsp.open(real, 'r');
    try {
      const len = Math.min(maxBytes, st.size);
      const buf = Buffer.alloc(len);
      await fh.read(buf, 0, len, 0);
      const truncated = st.size > len;
      if (isBinary(buf)) {
        return { path: v, size: st.size, binary: true, truncated, preview: hexPreview(buf) };
      }
      return { path: v, size: st.size, binary: false, truncated, content: buf.toString('utf8') };
    } finally {
      await fh.close();
    }
  }

  /**
   * Recursively grep from `path` (a dir or file). Symlinks are not followed
   * during the walk (avoids loops and escapes). Bounded by maxHits/maxFiles.
   */
  async grep(pattern, { path: start = '/', maxHits = 50, ignoreCase = false, maxFileBytes = 1_000_000, maxFiles = 5000 } = {}) {
    let re;
    try { re = new RegExp(pattern, ignoreCase ? 'i' : ''); }
    catch (e) { throw new SandboxError(`Invalid regex: ${e.message}`, 'EREGEX'); }

    const hits = [];
    let filesScanned = 0;
    let truncated = false;

    const walk = async (v) => {
      if (hits.length >= maxHits || filesScanned >= maxFiles) { truncated = true; return; }
      const real = this._real(v);
      let st;
      try { st = fs.lstatSync(real); } catch { return; }
      if (st.isSymbolicLink()) return; // don't follow during a recursive walk
      if (st.isDirectory()) {
        let names;
        try { names = await fsp.readdir(real); } catch { return; }
        for (const name of names) {
          if (hits.length >= maxHits || filesScanned >= maxFiles) { truncated = true; break; }
          await walk(path.posix.join(v, name));
        }
        return;
      }
      if (!st.isFile() || st.size > maxFileBytes) return;
      filesScanned++;
      let text;
      try { text = fs.readFileSync(real, 'utf8'); } catch { return; }
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (re.test(lines[i])) {
          hits.push({ file: v, line: i + 1, text: lines[i].slice(0, 300) });
          if (hits.length >= maxHits) { truncated = true; return; }
        }
      }
    };

    await walk(this._virtual(start));
    return { pattern, hits, filesScanned, truncated };
  }

  /** Extract printable ASCII runs of length >= min, like strings(1). */
  async strings(p, { min = 4, maxLines = 200, maxBytes = 2_000_000 } = {}) {
    const v = this._resolve(p);
    const real = this._real(v);
    const st = await fsp.stat(real).catch(() => { throw new SandboxError(`No such file: ${v}`, 'ENOENT'); });
    if (st.isDirectory()) throw new SandboxError(`Is a directory: ${v}`, 'EISDIR');

    const fh = await fsp.open(real, 'r');
    let buf;
    try {
      const len = Math.min(maxBytes, st.size);
      buf = Buffer.alloc(len);
      await fh.read(buf, 0, len, 0);
    } finally {
      await fh.close();
    }

    const lines = [];
    let cur = '';
    for (let i = 0; i < buf.length; i++) {
      const c = buf[i];
      if (c >= 0x20 && c <= 0x7e) {
        cur += String.fromCharCode(c);
      } else {
        if (cur.length >= min) { lines.push(cur); if (lines.length >= maxLines) break; }
        cur = '';
      }
    }
    if (cur.length >= min && lines.length < maxLines) lines.push(cur);
    return { path: v, min, lines, truncated: lines.length >= maxLines || st.size > buf.length };
  }
}

// --- helpers --------------------------------------------------------------

/** Heuristic: a NUL byte in the first 1KB means "binary". */
function isBinary(buf) {
  const n = Math.min(buf.length, 1024);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

/** A compact hexdump preview (default first 256 bytes). */
function hexPreview(buf, bytes = 256) {
  const slice = buf.subarray(0, bytes);
  const out = [];
  for (let off = 0; off < slice.length; off += 16) {
    const chunk = slice.subarray(off, off + 16);
    const hex = [...chunk].map((b) => b.toString(16).padStart(2, '0')).join(' ');
    const ascii = [...chunk].map((b) => (b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : '.')).join('');
    out.push(`${off.toString(16).padStart(8, '0')}  ${hex.padEnd(47)}  ${ascii}`);
  }
  return out.join('\n');
}
