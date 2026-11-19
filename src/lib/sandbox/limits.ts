// Límites del sandbox de Lua. Un solo lugar: el worker, el cliente y los docs leen de acá.

export const LIMITS = {
  /** Tiempo de ejecución del snippet. Lo corta el hook (limpio) y, si el worker no responde, el cliente. */
  timeoutMs: 3000,
  /** Gracia extra antes de matar el worker: una llamada C (patrón de `string.find`) no ve el hook. */
  killGraceMs: 1000,
  /** Máximo de instrucciones de la VM. Un hook de conteo suma `hookEvery` cada vez. */
  maxInstructions: 50_000_000,
  hookEvery: 1000,
  /** Páginas wasm (64 KiB) como tope duro de la memoria de la VM: 2048 = 128 MiB. */
  memoryPages: 2048,
  /** Bytes de stdout que se aceptan (se cuenta cada línea más su salto). */
  maxOutputBytes: 64 * 1024,
  /** Largo máximo de una sola línea de salida que el cliente muestra. */
  maxLineChars: 4000,
  /** Tamaño máximo del resultado de `string.rep` (evita una sola instrucción que pida GB). */
  maxStringBytes: 8 * 1024 * 1024,
  /** Tamaño máximo del código fuente que se envía al worker. */
  maxCodeBytes: 32 * 1024,
  /** Máximo de caracteres de un mensaje de error. */
  maxErrorChars: 2000,
  /** Espera máxima a que el worker cargue el runtime. */
  startupMs: 10_000,
} as const

/** Marcas que el hook y el bootstrap ponen en `error()` para distinguir un límite de un error normal. */
export const LIMIT_TAG = 'sandbox:'
export type LimitReason = 'time' | 'instructions' | 'memory' | 'output'
