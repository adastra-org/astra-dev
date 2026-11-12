// Capa propia de Astra sobre los natives: `content/overrides/natives/<Nombre>.md`. El cuerpo es la
// nota (Markdown); la fuente nunca se toca. El nombre puede ser `SetVehicleDoorOpen` o
// `SET_VEHICLE_DOOR_OPEN`.
import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { overrideKey } from './corpus.ts'

export async function loadOverrides(dir: string): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (!existsSync(dir)) return out
  for (const f of (await readdir(dir)).sort()) {
    if (!f.endsWith('.md')) continue
    const key = overrideKey(f.replace(/\.md$/, ''))
    if (out.has(key))
      throw new Error(`${join(dir, f)}: override repetido para ${key}`)
    const note = (await readFile(join(dir, f), 'utf8'))
      .replace(/^﻿/, '')
      .replace(/\r\n/g, '\n')
      .trim()
    if (note) out.set(key, note)
  }
  return out
}
