/** Validate a nonempty region in the 32-bit physical address space without wrapping. */
export function validateRegion(base: number, size: number): void {
  if (
    !Number.isInteger(base) ||
    base < 0 ||
    base > 0xffff_ffff ||
    !Number.isInteger(size) ||
    size <= 0 ||
    base + size > 0x1_0000_0000
  ) {
    throw new RangeError("Region must fit in the 32-bit physical address space");
  }
}
