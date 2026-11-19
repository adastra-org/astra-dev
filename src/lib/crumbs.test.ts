import { describe, expect, test } from 'bun:test'
import { crumbsFor } from './crumbs'

const titles: Record<string, string> = { glosario: 'Glosario' }
const labels = (path: string) =>
  crumbsFor(path, (s) => titles[s]).map((c) => c.label)

describe('crumbsFor', () => {
  test('portada: solo Inicio', () => {
    expect(labels('/')).toEqual(['Inicio'])
  })

  test('secciones: Inicio / sección', () => {
    expect(labels('/docs')).toEqual(['Inicio', 'Documentación'])
    expect(labels('/tools')).toEqual(['Inicio', 'Herramientas'])
    expect(labels('/roadmap/')).toEqual(['Inicio', 'Roadmap'])
  })

  test('documento: usa el título, con la ruta propia en la última miga', () => {
    expect(crumbsFor('/docs/glosario', (s) => titles[s])).toEqual([
      { label: 'Inicio', to: '/' },
      { label: 'Documentación', to: '/docs' },
      { label: 'Glosario', to: '/docs/glosario' },
    ])
  })

  test('documento inexistente y rutas que no existen', () => {
    expect(labels('/docs/nada')).toEqual([
      'Inicio',
      'Documentación',
      'Documento no encontrado',
    ])
    expect(labels('/docs/a/b')).toEqual([
      'Inicio',
      'Documentación',
      'Página no encontrada',
    ])
    expect(labels('/tools/x')).toEqual([
      'Inicio',
      'Herramientas',
      'Página no encontrada',
    ])
    expect(labels('/docsx')).toEqual(['Inicio', 'Página no encontrada'])
    expect(labels('/docs/%E0%A4%A')).toEqual([
      'Inicio',
      'Documentación',
      'Documento no encontrado',
    ])
  })
})
