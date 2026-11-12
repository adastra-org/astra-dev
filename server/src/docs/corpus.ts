// The corpus the index is built from: hand-written docs plus the importer's output.
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { readNatives, type NativeRecord } from './natives.ts'
import { readDocs, type SourceDoc } from './source.ts'

export async function loadCorpus(dirs: {
  docsDir: string
  generatedDir: string
}): Promise<{ docs: SourceDoc[]; natives: NativeRecord[] }> {
  const docs = await readDocs(dirs.docsDir)
  const generatedDocsDir = join(dirs.generatedDir, 'docs')
  if (existsSync(generatedDocsDir)) {
    const taken = new Set(docs.map((d) => d.slug))
    for (const d of await readDocs(generatedDocsDir)) {
      if (taken.has(d.slug))
        throw new Error(
          `slug "${d.slug}" exists in content/docs and content/generated`,
        )
      docs.push(d)
    }
  }
  return { docs, natives: await readNatives(dirs.generatedDir) }
}
