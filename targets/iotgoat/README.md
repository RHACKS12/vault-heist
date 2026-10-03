# Target: OWASP IoTGoat

Deliberately insecure, OpenWrt-based firmware maintained by OWASP for teaching
IoT firmware testing. Chosen as the **guaranteed-clean** demo target: planted,
well-documented vulnerabilities at known locations, and models won't refuse
identification-only analysis.

Identification-only: the agents **name** the planted vulnerability
(file / function / string). Nothing here exploits the firmware or recovers a
live secret.

## Status: extracted ✅

The rootfs is already extracted and committed to [`rootfs/`](./rootfs) — the
read-only filesystem the agents read. The answer key in [`answer.json`](./answer.json)
is **verified** against it. You don't need to download anything to start building.

| Fact | Value |
| --- | --- |
| Asset | `IoTGoat-x86.img.gz` |
| Source | https://github.com/OWASP/IoTGoat/releases/latest/download/IoTGoat-x86.img.gz |
| sha256 (.gz) | `6237949316e1b7b1fcdb73cabd7458d4e2ea9db11034064b7b1c625867567be3` |
| Base | OpenWrt 18.06.2 (built 2019-01-30) |
| Rootfs | SquashFS 4.0 (xz), partition 2 at byte offset `17301504` |
| Extracted | `rootfs/` — ~13 MB, 1031 files |

> Note: `rootfs/dev/console` (the only device node) was removed after extraction
> because git can't track special files. It's irrelevant to static analysis.

## The three rounds (all verified in `rootfs/`)

| Round | File | Vulnerability |
| --- | --- | --- |
| **hardcoded-credentials** (default) | `/etc/shadow` | `iotgoatuser` MD5 hash `$1$79bz0K8z$…` → password `7ujMko0vizxv`; plus a `root` hash |
| **shellback-backdoor** | `/usr/bin/shellback` | bind-shell backdoor on **TCP 5515**, auto-started by `/etc/init.d/shellback` |
| **command-injection** | `/usr/lib/lua/luci/controller/iotgoat/iotgoat.lua` | `webcmd()` pipes unsanitized `cmd` into `io.popen()`; hidden page `admin/iotgoat/cmdinject` |

## Reproduce the extraction

Already done, but to rebuild `rootfs/` from scratch (needs network egress to the
GitHub release asset + `binwalk` and `squashfs-tools`):

```bash
./extract.sh                 # from this directory
```

Or manually:

```bash
# tools
sudo apt-get install -y binwalk squashfs-tools

# download + decompress
curl -L -o IoTGoat-x86.img.gz \
  https://github.com/OWASP/IoTGoat/releases/latest/download/IoTGoat-x86.img.gz
gunzip -f IoTGoat-x86.img.gz

# the x86 image is a partitioned disk; the rootfs is a SquashFS in partition 2.
# locate it (offset 17301504 on the current release):
binwalk IoTGoat-x86.img            # look for the "Squashfs filesystem" line

# carve the squashfs out and unpack it
dd if=IoTGoat-x86.img of=rootfs.sqfs bs=512 skip=33792 count=32768
unsquashfs -d rootfs rootfs.sqfs

# drop special files git can't track
find rootfs \( -type b -o -type c -o -type p -o -type s \) -delete
```

(If a future release changes the offset, re-read it from the `binwalk` output —
`skip = offset_bytes / 512`.)

## Verify the answer key against the rootfs

```bash
grep -n "iotgoatuser" rootfs/etc/shadow
ls -la rootfs/usr/bin/shellback
grep -n "webcmd\|io.popen" rootfs/usr/lib/lua/luci/controller/iotgoat/iotgoat.lua
```

## Sources

- OWASP IoTGoat — https://github.com/OWASP/IoTGoat
- Getting started wiki — https://github.com/OWASP/IoTGoat/wiki/Getting-started
- OneConsult overview — https://oneconsult.com/en/blog/iot-ot-security/owasp-iotgoat-deliberately-insecure-iot-firmware/
