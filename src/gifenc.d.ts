declare module 'gifenc' {
  export type GIFPalette = number[][]

  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    options?: { format?: 'rgb565' | 'rgb444' | 'rgba4444' },
  ): GIFPalette

  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray,
    palette: GIFPalette,
    format?: 'rgb565' | 'rgb444' | 'rgba4444',
  ): Uint8Array

  export function GIFEncoder(options?: { initialCapacity?: number; auto?: boolean }): {
    writeFrame(
      index: Uint8Array,
      width: number,
      height: number,
      options?: { palette?: GIFPalette; delay?: number; repeat?: number },
    ): void
    finish(): void
    bytes(): Uint8Array
  }
}
