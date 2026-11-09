/** Test-only encoders use arithmetic placement, independently of decoder extraction. */
export const encodeR = (
  major: number,
  f3: number,
  f7: number,
  rd: number,
  rs1: number,
  rs2: number,
): number =>
  (major + rd * 2 ** 7 + f3 * 2 ** 12 + rs1 * 2 ** 15 + rs2 * 2 ** 20 + f7 * 2 ** 25) >>> 0;
export const encodeI = (major: number, f3: number, rd: number, rs1: number, imm: number): number =>
  (major + rd * 2 ** 7 + f3 * 2 ** 12 + rs1 * 2 ** 15 + (imm & 0xfff) * 2 ** 20) >>> 0;
export const encodeS = (f3: number, rs1: number, rs2: number, imm: number): number =>
  encodeR(0x23, f3, (imm & 0xfff) >>> 5, imm & 31, rs1, rs2) >>> 0;
export const encodeB = (f3: number, rs1: number, rs2: number, imm: number): number => {
  const bits = imm & 0x1fff;
  return (
    (encodeR(0x63, f3, 0, 0, rs1, rs2) +
      ((bits >>> 12) & 1) * 2 ** 31 +
      ((bits >>> 11) & 1) * 2 ** 7 +
      ((bits >>> 5) & 63) * 2 ** 25 +
      ((bits >>> 1) & 15) * 2 ** 8) >>>
    0
  );
};
export const encodeU = (major: number, rd: number, imm: number): number =>
  (major + rd * 2 ** 7 + (imm >>> 12) * 2 ** 12) >>> 0;
export const encodeJ = (rd: number, imm: number): number => {
  const bits = imm & 0x1fffff;
  return (
    (0x6f +
      rd * 2 ** 7 +
      ((bits >>> 20) & 1) * 2 ** 31 +
      ((bits >>> 12) & 255) * 2 ** 12 +
      ((bits >>> 11) & 1) * 2 ** 20 +
      ((bits >>> 1) & 1023) * 2 ** 21) >>>
    0
  );
};
