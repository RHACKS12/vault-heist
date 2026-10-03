#!/usr/bin/env bash
# Rebuild targets/iotgoat/rootfs/ from the OWASP IoTGoat x86 release image.
# Requires: curl, gunzip, binwalk, unsquashfs (squashfs-tools), and network
# egress to the GitHub release asset.
#
# Identification-only firmware analysis: this just unpacks a read-only
# filesystem so the agents can read it. It does not run or exploit anything.
set -euo pipefail

cd "$(dirname "$0")"

URL="https://github.com/OWASP/IoTGoat/releases/latest/download/IoTGoat-x86.img.gz"
EXPECTED_SHA256="6237949316e1b7b1fcdb73cabd7458d4e2ea9db11034064b7b1c625867567be3"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "[*] downloading IoTGoat-x86.img.gz ..."
curl -fL --retry 3 -o "$WORK/IoTGoat-x86.img.gz" "$URL"

echo "[*] checking sha256 (warn-only; releases can change) ..."
GOT="$(sha256sum "$WORK/IoTGoat-x86.img.gz" | awk '{print $1}')"
[ "$GOT" = "$EXPECTED_SHA256" ] || echo "    WARNING: sha256 $GOT != pinned $EXPECTED_SHA256"

echo "[*] decompressing ..."
gunzip -f "$WORK/IoTGoat-x86.img.gz"
IMG="$WORK/IoTGoat-x86.img"

echo "[*] locating squashfs rootfs offset ..."
# default offset for the pinned release; auto-detect if binwalk finds a different one
OFFSET=17301504
DETECTED="$(binwalk "$IMG" 2>/dev/null | awk '/Squashfs/ {print $1; exit}')"
if [ -n "${DETECTED:-}" ] && [ "$DETECTED" != "$OFFSET" ]; then
  echo "    binwalk reports squashfs at $DETECTED (using it)"
  OFFSET="$DETECTED"
fi
SKIP=$(( OFFSET / 512 ))

echo "[*] carving + unpacking rootfs (offset=$OFFSET) ..."
dd if="$IMG" of="$WORK/rootfs.sqfs" bs=512 skip="$SKIP" count=32768 status=none
rm -rf rootfs
unsquashfs -d rootfs "$WORK/rootfs.sqfs" >/dev/null

echo "[*] removing special files git can't track ..."
find rootfs \( -type b -o -type c -o -type p -o -type s \) -delete

echo "[*] sanity check ..."
grep -q iotgoatuser rootfs/etc/shadow && echo "    /etc/shadow ok"
[ -f rootfs/usr/bin/shellback ] && echo "    /usr/bin/shellback ok"
[ -f rootfs/usr/lib/lua/luci/controller/iotgoat/iotgoat.lua ] && echo "    luci controller ok"

echo "[*] done. $(find rootfs -type f | wc -l) files in rootfs/"
