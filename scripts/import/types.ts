// Formas normalizadas que produce el importador. Las consumen el índice del server, el sitio
// (fase 3) y el export a WeGraph (fase 5): son el contrato, no un detalle interno.

export type NativeSource = 'gta' | 'cfx'
export type NativeApiset = 'client' | 'server' | 'shared'

export interface NativeParam {
  name: string
  type: string
  description: string
}

export interface Native {
  /** `<source>:<NAME>`, único en todo el corpus. */
  id: string
  /** Slug de la página (`/natives/<slug>`). Único: si CFX redefine un native de GTA, ambos llevan sufijo. */
  slug: string
  source: NativeSource
  /** Nombre canónico: `SET_VEHICLE_DOOR_OPEN`. */
  name: string
  /** Nombre de la función en Lua/JS/C#: `SetVehicleDoorOpen` (nombre del archivo). */
  luaName: string
  /** Namespace: `VEHICLE`, `PED`, `CFX`... */
  ns: string
  /** Solo los natives de CFX lo declaran. */
  apiset: NativeApiset | null
  game: string | null
  /** Hashes `0x…` en mayúsculas, tal como salen en la firma (64 y 32 bits). */
  hashes: string[]
  signature: string
  returnType: string
  params: NativeParam[]
  /** Markdown: descripción previa a `## Parameters`. */
  description: string
  returns: string
  examples: string
  /** Secciones no reconocidas (`## Notes`, etc.) para no perder contenido de la fuente. */
  extra: { title: string; body: string }[]
  aliases: string[]
  /** Natives enlazados en el texto (`[X](#_0xHASH)`), resueltos a ids. */
  seeAlso: string[]
  /** Hashes enlazados que no corresponden a ningún native del corpus. */
  unresolved: string[]
  /** Nota propia de Astra (override), sin tocar la fuente. */
  astraNotes: string
  upstream: { source: string; path: string }
}

export interface GeneratedDoc {
  slug: string
  title: string
  summary: string
  tags: string[]
  since: string
  lang: 'en'
  /** Markdown ya convertido (sin shortcodes de Hugo, enlaces reescritos). */
  body: string
  /** Ids de los natives mencionados (`native_link`): aristas del grafo. */
  nativeRefs: string[]
  /** Slugs de otros docs enlazados en el cuerpo. */
  links: string[]
  /** Ruta de URL original en docs.fivem.net, sin barra final: `/docs/scripting-manual/...`. */
  url: string
  upstream: { source: string; path: string }
}

export class ImportError extends Error {
  readonly file: string
  constructor(file: string, message: string) {
    super(`${file}: ${message}`)
    this.name = 'ImportError'
    this.file = file
  }
}
