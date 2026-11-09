# riscv-tests fixtures

Prebuilt ELF32 RISC-V executables and objdump disassemblies (ADR 0005).
CI consumes the committed files and never invokes the build script.

## Provenance

- Upstream: https://github.com/riscv-software-src/riscv-tests
- Commit: `3df703cd52d5f0d8224e3c50bf03c6cb70efff98`
- env submodule: https://github.com/riscv/riscv-test-env
- env commit: `6de71edb142be36319e380ce782c3d1830c65d68`
- License: upstream BSD license, copied verbatim to `LICENSE`.
- Base image: `debian@sha256:734a72b3d6142a71993b4bc580ca01d8ca687f77a2c422d96a961d3376b179bc`
- Container platform: `linux/amd64` (also on ARM hosts, with emulation installed).
- Debian package snapshot: `20261109T000000Z`, using bookworm and bookworm-updates at
  http://snapshot.debian.org/archive/debian/ and bookworm-security at
  http://snapshot.debian.org/archive/debian-security/.
- Toolchain (also recorded in `toolchain.txt`):

```text
binutils-riscv64-unknown-elf 2.40-2+4+b1
gcc-riscv64-unknown-elf 12.2.0-14+deb12u1+11+b2
riscv64-unknown-elf-gcc (12.2.0-14+deb12u1+11+b2) 12.2.0
GNU objdump (2.40-2+4+b1) 2.40
```

## Regeneration

From the repository root, with Bash, Git and Docker, network access to the Debian
snapshot and GitHub, and no host RISC-V toolchain:

```sh
./scripts/build-riscv-tests.sh rv32ui-p
```

Omit arguments for `rv32ui-p`. Use `CONTAINER_RUNTIME=podman` for Podman.
The host fetches the pinned sources and env submodule and mounts them read-only
at `/upstream`. The container installs the toolchain from signed HTTP snapshots,
copies the sources into `/src`, and builds in the fixed `/src/isa` path. It needs
no HTTPS access or custom CA configuration. Both uppercase and lowercase proxy
variables are passed into the container. The container engine must be local so
it can bind-mount the host's temporary source directory.
Every invocation starts from the pinned base image and a fresh source checkout.
It replaces this directory only after the container build succeeds; pass all suites
to retain them, for example `./scripts/build-riscv-tests.sh rv32ui-p rv32um-p`.

The exact upstream make invocation is (TARGETS are the requested lists with `.dump`
appended, expanded from the copied upstream `*.Makefrag` files):

```sh
make --no-print-directory XLEN=32 RISCV_PREFIX=riscv64-unknown-elf- \
  'RISCV_GCC_OPTS=-static -mcmodel=medany -fvisibility=hidden -nostdlib -nostartfiles -march=rv32g_zicsr_zifencei -mabi=ilp32 -Wl,--build-id=none' \
  TARGETS
```

`SOURCE_DATE_EPOCH` is the upstream commit timestamp, `LC_ALL=C`, `TZ=UTC`.
Linker build IDs are disabled. ELF and dump content has no host paths or timestamps.

The pinned `rv32ui-p` list **includes `ma_data`**, which performs misaligned
accesses. Execution support and the conformance runner are separate work.

## Tests

Each name below has both an ELF file and a corresponding `.dump` disassembly.
The copied Makefrags preserve the upstream suite membership for offline checks.

- `rv32ui-p-add`
- `rv32ui-p-addi`
- `rv32ui-p-and`
- `rv32ui-p-andi`
- `rv32ui-p-auipc`
- `rv32ui-p-beq`
- `rv32ui-p-bge`
- `rv32ui-p-bgeu`
- `rv32ui-p-blt`
- `rv32ui-p-bltu`
- `rv32ui-p-bne`
- `rv32ui-p-fence_i`
- `rv32ui-p-jal`
- `rv32ui-p-jalr`
- `rv32ui-p-lb`
- `rv32ui-p-lbu`
- `rv32ui-p-ld_st`
- `rv32ui-p-lh`
- `rv32ui-p-lhu`
- `rv32ui-p-lui`
- `rv32ui-p-lw`
- `rv32ui-p-ma_data`
- `rv32ui-p-or`
- `rv32ui-p-ori`
- `rv32ui-p-sb`
- `rv32ui-p-sh`
- `rv32ui-p-simple`
- `rv32ui-p-sll`
- `rv32ui-p-slli`
- `rv32ui-p-slt`
- `rv32ui-p-slti`
- `rv32ui-p-sltiu`
- `rv32ui-p-sltu`
- `rv32ui-p-sra`
- `rv32ui-p-srai`
- `rv32ui-p-srl`
- `rv32ui-p-srli`
- `rv32ui-p-st_ld`
- `rv32ui-p-sub`
- `rv32ui-p-sw`
- `rv32ui-p-xor`
- `rv32ui-p-xori`
