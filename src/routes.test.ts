import { describe, expect, test } from 'bun:test'
import { matchRoutes } from 'react-router-dom'
import { NAV, navFor } from './config/nav'
import { routes } from './routes'

/** Path del último match (la hoja) para una URL. */
const leaf = (pathname: string) =>
  matchRoutes(routes, pathname)?.at(-1)?.route.path

describe('rutas', () => {
  test('cada ítem de navegación resuelve a una ruta propia (no al 404)', () => {
    for (const n of NAV) {
      expect(leaf(n.to)).toBe(n.to)
    }
  })

  test('/docs/:slug captura el slug', () => {
    const m = matchRoutes(routes, '/docs/native-draw-text')?.at(-1)
    expect(m?.route.path).toBe('/docs/:slug')
    expect(m?.params.slug).toBe('native-draw-text')
  })

  test('una ruta desconocida cae en el 404', () => {
    expect(leaf('/no-existe')).toBe('*')
  })
})

describe('navegación', () => {
  test('rutas y etiquetas únicas', () => {
    expect(new Set(NAV.map((n) => n.to)).size).toBe(NAV.length)
    expect(new Set(NAV.map((n) => n.label)).size).toBe(NAV.length)
  })

  test('solo la portada usa coincidencia exacta', () => {
    expect(NAV.filter((n) => n.end).map((n) => n.to)).toEqual(['/'])
  })

  test('navFor devuelve la sección que contiene la ruta', () => {
    expect(navFor('/')?.to).toBe('/')
    expect(navFor('/docs')?.to).toBe('/docs')
    expect(navFor('/docs/algo')?.to).toBe('/docs')
    expect(navFor('/docsx')).toBeUndefined()
    expect(navFor('/no-existe')).toBeUndefined()
  })
})

describe('docs reales', () => {
  test('cada doc de content/docs tiene su ruta /docs/:slug', async () => {
    const { docs } = await import('virtual:astra-docs')
    expect(docs.length).toBeGreaterThanOrEqual(4)
    for (const d of docs) expect(leaf(`/docs/${d.slug}`)).toBe('/docs/:slug')
  })
})
