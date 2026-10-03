# Target: OWASP IoTGoat

Deliberately insecure, OpenWrt-based firmware maintained by OWASP for teaching
IoT firmware testing. Chosen as the **guaranteed-clean** demo target: planted,
well-documented vulnerabilities with exact locations, and models won't refuse
identification-only analysis.

This is identification-only: the agents **name** the planted vulnerability
(file / string). Nothing here exploits the firmware or extracts a live secret.

## 1. Download

Releases: **https://github.com/OWASP/IoTGoat/releases** (grab the latest).

- For the cleanest SquashFS extract, use the **Raspberry Pi image**
  (`IoTGoat-raspberry-pi*.img.gz`) — ARM OpenWrt images ship a SquashFS rootfs
  that `binwalk` pulls out as `squashfs-root/` directly.
- The **x86 image** (`IoTGoat-x86.img.gz`) also works but is usually ext4; if
  `binwalk` doesn't yield a clean rootfs, mount the ext4 partition instead.

## 2. Extract (offline, one-time)

```bash
# tools
sudo apt-get install -y binwalk squashfs-tools
# (recent SquashFS may need sasquatch for LZMA)

# unpack + carve
gunzip IoTGoat-raspberry-pi*.img.gz
binwalk -eM IoTGoat-raspberry-pi*.img        # -e extract, -M recurse

# find the root filesystem and copy it in, read-only
#   look under _IoTGoat-*.img.extracted/ for squashfs-root/
cp -r _IoTGoat-*.img.extracted/squashfs-root targets/iotgoat/rootfs
```

The committed `targets/iotgoat/rootfs/` is what the agents read. It never changes
at runtime.

## 3. Verify the answer key against YOUR rootfs

The paths/strings in `answer.json` are documented for IoTGoat, but confirm them
on your actual extract before trusting the judge:

```bash
# default round — hardcoded credentials
grep -n "iotgoatuser" targets/iotgoat/rootfs/etc/shadow
grep -rn '\$1\$'      targets/iotgoat/rootfs/etc/shadow

# backdoor binary (confirm exact path, then update answer.json 'file')
find targets/iotgoat/rootfs -name 'shellback'
grep -rIl 'shellback\|5515' targets/iotgoat/rootfs

# command-injection controller (confirm exact path)
grep -rIl 'webcmd\|cmdinject' targets/iotgoat/rootfs
```

## 4. Answer key

See [`answer.json`](./answer.json). Default round is **hardcoded-credentials**
(`/etc/shadow`, user `iotgoatuser` / `7ujMko0vizxv`) — the most reliable ground
truth for all three agent strategies. Two alternate rounds (shellback backdoor
on TCP 5515, LuCI command injection) are included for variety; verify their exact
paths with the commands above before using them.

## Sources

- OWASP IoTGoat — https://github.com/OWASP/IoTGoat
- Getting started wiki — https://github.com/OWASP/IoTGoat/wiki/Getting-started
- OneConsult overview — https://oneconsult.com/en/blog/iot-ot-security/owasp-iotgoat-deliberately-insecure-iot-firmware/
