// Tope duro de memoria: el wasm de wasmoon declara 2 GiB de máximo. Se reescribe el máximo de su
// sección de memoria a `maxPages`. Más allá, `memory.grow` falla, malloc devuelve NULL y Lua lanza
// "not enough memory" (o el runtime aborta), sin que el snippet pueda evitarlo.
//
// El máximo se escribe con un LEB128 de 3 bytes (relleno con ceros) para no cambiar el tamaño de
// la sección ni de ningún offset posterior.

const MAGIC = [0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]

function readLeb(b: Uint8Array, at: number): { value: number; next: number } {
  let value = 0
  let shift = 0
  let p = at
  for (;;) {
    const byte = b[p++]
    if (byte === undefined) throw new Error('wasm truncado')
    value += (byte & 0x7f) * 2 ** shift
    if ((byte & 0x80) === 0) break
    shift += 7
    if (shift > 35) throw new Error('LEB128 inválido')
  }
  return { value, next: p }
}

/** Devuelve una copia del wasm con el máximo de su memoria acotado. Falla si no reconoce el formato. */
export function capWasmMemory(
  wasm: Uint8Array<ArrayBufferLike>,
  maxPages: number,
): Uint8Array<ArrayBuffer> {
  if (maxPages < 1 || maxPages >= 1 << 21)
    throw new Error('maxPages fuera de rango')
  for (let i = 0; i < MAGIC.length; i++)
    if (wasm[i] !== MAGIC[i]) throw new Error('no es un módulo wasm')
  const out = wasm.slice()
  let p = 8
  while (p < out.length) {
    const id = out[p++]
    const size = readLeb(out, p)
    p = size.next
    if (id === 5) {
      const count = readLeb(out, p)
      if (count.value !== 1) throw new Error('se esperaba una sola memoria')
      let q = count.next
      const flags = out[q++]
      if (flags !== 1) throw new Error('la memoria no declara máximo')
      const min = readLeb(out, q)
      q = min.next
      const max = readLeb(out, q)
      if (max.next - q !== 3)
        throw new Error('el máximo de la memoria no ocupa 3 bytes')
      if (min.value > maxPages)
        throw new Error('la memoria inicial supera el tope')
      out[q] = (maxPages & 0x7f) | 0x80
      out[q + 1] = ((maxPages >> 7) & 0x7f) | 0x80
      out[q + 2] = (maxPages >> 14) & 0x7f
      return out
    }
    p += size.value
  }
  throw new Error('el módulo no tiene sección de memoria')
}

/** Lee el máximo de la memoria (para verificar el parche). */
export function wasmMemoryMax(wasm: Uint8Array): number | null {
  let p = 8
  while (p < wasm.length) {
    const id = wasm[p++]
    const size = readLeb(wasm, p)
    p = size.next
    if (id === 5) {
      const count = readLeb(wasm, p)
      let q = count.next
      const flags = wasm[q++]
      const min = readLeb(wasm, q)
      q = min.next
      return flags === 1 ? readLeb(wasm, q).value : null
    }
    p += size.value
  }
  return null
}
