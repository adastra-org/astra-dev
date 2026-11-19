// Hash de nombres de natives. Jenkins one-at-a-time sobre el nombre en minúsculas: es el hash de 32
// bits que usan los enlaces `#_0xFF7F66AB` de CFX y el segundo hash de la firma de los natives de GTA.

/** `0x…` en mayúsculas y sin ceros a la izquierda: clave de comparación entre fuentes. */
export const normalizeHash = (h: string): string =>
  `0x${h
    .replace(/^0x/i, '')
    .replace(/^0+(?=.)/, '')
    .toUpperCase()}`

export function joaat(input: string): string {
  let h = 0
  for (const ch of input.toLowerCase()) {
    h = (h + ch.charCodeAt(0)) >>> 0
    h = (h + (h << 10)) >>> 0
    h = (h ^ (h >>> 6)) >>> 0
  }
  h = (h + (h << 3)) >>> 0
  h = (h ^ (h >>> 11)) >>> 0
  h = (h + (h << 15)) >>> 0
  return normalizeHash(h.toString(16))
}
