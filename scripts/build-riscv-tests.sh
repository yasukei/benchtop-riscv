#!/usr/bin/env bash
# Regenerate committed fixtures, never invoked by CI. See ADR 0005.
set -euo pipefail
export LC_ALL=C TZ=UTC
umask 022

base_image=debian@sha256:734a72b3d6142a71993b4bc580ca01d8ca687f77a2c422d96a961d3376b179bc
snapshot=20261109T000000Z
revision=3df703cd52d5f0d8224e3c50bf03c6cb70efff98
env_revision=6de71edb142be36319e380ce782c3d1830c65d68
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
output="$root/tests/fixtures/riscv-tests"

if [[ ${1:-} == --help ]]; then
  echo "Usage: $0 [rv32ui-p rv32um-p rv32ua-p rv32mi-p rv32si-p ...]"
  echo "Default: rv32ui-p. Replaces the output directory with exactly the requested suites."
  echo "Set CONTAINER_RUNTIME=docker or CONTAINER_RUNTIME=podman (default: docker)."
  exit 0
fi
if (( $# == 0 )); then set -- rv32ui-p; fi
for suite in "$@"; do
  case "$suite" in
    rv32ui-p|rv32um-p|rv32ua-p|rv32mi-p|rv32si-p) ;;
    *) echo "Unsupported suite: $suite (see --help)" >&2; exit 2 ;;
  esac
done
runtime=${CONTAINER_RUNTIME:-docker}
command -v "$runtime" >/dev/null
staging=$(mktemp -d)
source_tree="$staging/source"
artifacts="$staging/fixtures"
mkdir "$artifacts"
container_id=
cleanup() {
  if [[ -n $container_id ]]; then "$runtime" rm -f "$container_id" >/dev/null; fi
  rm -rf -- "$staging"
}
trap cleanup EXIT

# Fetch on the host so its normal HTTPS trust and Git configuration apply. The
# build container needs only HTTP access to the signed Debian package snapshots.
git init "$source_tree"
git -C "$source_tree" remote add origin https://github.com/riscv-software-src/riscv-tests.git
git -C "$source_tree" fetch --depth=1 origin "$revision"
git -C "$source_tree" checkout --detach FETCH_HEAD
git -C "$source_tree" submodule update --init --depth=1 env
test "$(git -C "$source_tree" rev-parse HEAD)" = "$revision"
test "$(git -C "$source_tree/env" rev-parse HEAD)" = "$env_revision"
source_date_epoch=$(git -C "$source_tree" show -s --format=%ct HEAD)

# Pass lowercase proxies explicitly: apt does not read HTTP_PROXY/HTTPS_PROXY.
container_id=$("$runtime" create --interactive --platform linux/amd64 \
  --mount "type=bind,src=$source_tree,dst=/upstream,readonly" \
  -e HTTP_PROXY -e HTTPS_PROXY -e NO_PROXY \
  -e "http_proxy=${http_proxy:-${HTTP_PROXY:-}}" \
  -e "https_proxy=${https_proxy:-${HTTPS_PROXY:-}}" \
  -e "no_proxy=${no_proxy:-${NO_PROXY:-}}" \
  -e "SOURCE_DATE_EPOCH=$source_date_epoch" -e "SNAPSHOT=$snapshot" \
  "$base_image" bash -s -- "$@")
"$runtime" start --attach --interactive "$container_id" <<'CONTAINER'
set -euo pipefail
export LC_ALL=C TZ=UTC DEBIAN_FRONTEND=noninteractive
umask 022
rm /etc/apt/sources.list.d/debian.sources
printf 'deb [check-valid-until=no] http://snapshot.debian.org/archive/debian/%s bookworm main\n' \
  "$SNAPSHOT" > /etc/apt/sources.list
printf 'deb [check-valid-until=no] http://snapshot.debian.org/archive/debian/%s bookworm-updates main\n' \
  "$SNAPSHOT" >> /etc/apt/sources.list
printf 'deb [check-valid-until=no] http://snapshot.debian.org/archive/debian-security/%s bookworm-security main\n' \
  "$SNAPSHOT" >> /etc/apt/sources.list
apt-get -o APT::Update::Error-Mode=any update
apt-get install -y --no-install-recommends make \
  gcc-riscv64-unknown-elf binutils-riscv64-unknown-elf

# Upstream make writes next to its sources. Build a private writable copy while
# the host checkout stays mounted read-only (no host .git data is needed).
mkdir /src
cp -R /upstream/isa /upstream/env /src/

# Check the exact ISA/ABI used below, including the CSR and fence.i extensions.
riscv64-unknown-elf-gcc -march=rv32g_zicsr_zifencei -mabi=ilp32 \
  -c -x assembler /dev/null -o /tmp/probe.o
mkdir /fixtures
cp /upstream/LICENSE /fixtures/LICENSE
dpkg-query -W -f='${Package} ${Version}\n' \
  gcc-riscv64-unknown-elf binutils-riscv64-unknown-elf > /fixtures/toolchain.txt
riscv64-unknown-elf-gcc --version | head -n 1 >> /fixtures/toolchain.txt
riscv64-unknown-elf-objdump --version | head -n 1 >> /fixtures/toolchain.txt
cd /src/isa
for suite in "$@"; do
  family=${suite%-p}
  cp "$family/Makefrag" "/fixtures/$family.Makefrag"
  # Ask make to expand the upstream p list; do not maintain a parallel test list.
  make --no-print-directory -f - SUITE="$suite" <<'MAKE' > /tmp/tests
include $(subst -p,,$(SUITE))/Makefrag
.PHONY: list
list:
	@echo $(sort $($(subst -,_,$(SUITE))_tests))
MAKE
  read -r -a tests < /tmp/tests
  (( ${#tests[@]} > 0 ))
  dumps=("${tests[@]/%/.dump}")
  # Stable intermediate object names also stabilize STT_FILE symbol table entries.
  make --no-print-directory XLEN=32 RISCV_PREFIX=riscv64-unknown-elf- \
    'RISCV_GCC_OPTS=-static -mcmodel=medany -fvisibility=hidden -nostdlib -nostartfiles -march=rv32g_zicsr_zifencei -mabi=ilp32 -save-temps=obj -Wl,--build-id=none' \
    "${dumps[@]}"
  cp "${tests[@]}" "${dumps[@]}" /fixtures/
done
CONTAINER
test "$("$runtime" inspect --format '{{.State.ExitCode}}' "$container_id")" = 0
"$runtime" cp "$container_id:/fixtures/." "$artifacts/"

cat > "$artifacts/README.md" <<README
# riscv-tests fixtures

Prebuilt ELF32 RISC-V executables and objdump disassemblies (ADR 0005).
CI consumes the committed files and never invokes the build script.

## Provenance

- Upstream: https://github.com/riscv-software-src/riscv-tests
- Commit: \`$revision\`
- env submodule: https://github.com/riscv/riscv-test-env
- env commit: \`$env_revision\`
- License: upstream BSD license, copied verbatim to \`LICENSE\`.
- Base image: \`$base_image\`
- Container platform: \`linux/amd64\` (also on ARM hosts, with emulation installed).
- Debian package snapshot: \`$snapshot\`, using bookworm and bookworm-updates at
  http://snapshot.debian.org/archive/debian/ and bookworm-security at
  http://snapshot.debian.org/archive/debian-security/.
- Toolchain (also recorded in \`toolchain.txt\`):

\`\`\`text
$(cat "$artifacts/toolchain.txt")
\`\`\`

## Regeneration

From the repository root, with Bash, Git and Docker, network access to the Debian
snapshot and GitHub, and no host RISC-V toolchain:

\`\`\`sh
./scripts/build-riscv-tests.sh $*
\`\`\`

Omit arguments for \`rv32ui-p\`. Use \`CONTAINER_RUNTIME=podman\` for Podman.
The host fetches the pinned sources and env submodule and mounts them read-only
at \`/upstream\`. The container installs the toolchain from signed HTTP snapshots,
copies the sources into \`/src\`, and builds in the fixed \`/src/isa\` path. It needs
no HTTPS access or custom CA configuration. Both uppercase and lowercase proxy
variables are passed into the container. The container engine must be local so
it can bind-mount the host's temporary source directory.
Every invocation starts from the pinned base image and a fresh source checkout.
It replaces this directory only after the container build succeeds; pass all suites
to retain them, for example \`./scripts/build-riscv-tests.sh rv32ui-p rv32um-p\`.

The exact upstream make invocation is (TARGETS are the requested lists with \`.dump\`
appended, expanded from the copied upstream \`*.Makefrag\` files):

\`\`\`sh
make --no-print-directory XLEN=32 RISCV_PREFIX=riscv64-unknown-elf- \\
  'RISCV_GCC_OPTS=-static -mcmodel=medany -fvisibility=hidden -nostdlib -nostartfiles -march=rv32g_zicsr_zifencei -mabi=ilp32 -save-temps=obj -Wl,--build-id=none' \\
  TARGETS
\`\`\`

\`SOURCE_DATE_EPOCH\` is the upstream commit timestamp, \`LC_ALL=C\`, \`TZ=UTC\`.
Linker build IDs are disabled. \`-save-temps=obj\` gives intermediate objects stable
names, preventing random GCC temporary filenames in the ELF symbol table while
retaining symbols. ELF and dump content has no host paths or timestamps.

The pinned \`rv32ui-p\` list **includes \`ma_data\`**, which performs misaligned
accesses. Execution support and the conformance runner are separate work.

## Tests

Each name below has both an ELF file and a corresponding \`.dump\` disassembly.
The copied Makefrags preserve the upstream suite membership for offline checks.

README
for binary in "$artifacts"/rv32*-p-*; do
  [[ $binary == *.dump ]] || printf -- '- `%s`\n' "${binary##*/}" >> "$artifacts/README.md"
done
mkdir -p -- "$output"
# Only generated files live here. A failed container build leaves existing fixtures intact.
rm -rf -- "$output"
mkdir -p -- "$output"
cp -R "$artifacts/." "$output/"
echo "Fixtures written to $output"
