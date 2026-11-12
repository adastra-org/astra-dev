import { useEffect, useRef, useState } from 'react'
import { formatTick } from '@/lib/project/series'

export interface Category {
  key: string
  /** Texto completo (tooltip y tabla). */
  label: string
  /** Texto corto bajo el eje. */
  axis: string
}

export interface Series {
  id: string
  label: string
  /** Variable CSS del color (`var(--chart-1)`). */
  color: string
  values: number[]
  /** Línea de referencia (trazo cortado, color neutro). */
  dashed?: boolean
}

/** Ancho en px del contenedor, siguiendo el redimensionado. */
export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(Math.round(el.clientWidth))
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w !== undefined) setWidth(Math.round(w))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}

export const MARGIN = { top: 8, right: 10, bottom: 26 }

/** Ancho del margen izquierdo según el rótulo más largo del eje Y. */
export function leftMargin(ticks: readonly number[], compactAxis: boolean) {
  const longest = Math.max(
    ...ticks.map((t) => formatTick(t, compactAxis).length),
  )
  return Math.max(28, longest * 7 + 12)
}
