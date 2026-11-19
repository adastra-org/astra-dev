// Selección de texto dentro de las respuestas del chat: lee el fragmento y los `[n]` que lo
// acompañan, y entrega dónde mostrar la barra "Citar". El DOM se lee acá; armar la cita es
// `lib/ask/quote.ts` (puro, con tests).
import { useEffect, useRef, useState, type RefObject } from 'react'
import { makeQuote } from '@/lib/ask/quote'
import { askStore, type Turn } from '@/lib/ask/store'

export interface SelectionBar {
  turnId: number
  text: string
  cites: number[]
  /** Centro horizontal y borde superior/inferior del fragmento, en coordenadas de la ventana. */
  x: number
  top: number
  bottom: number
}

const BLOCK_TAGS = 'p, li, tr, td, th, br, div'

const citesIn = (el: ParentNode): number[] =>
  [...el.querySelectorAll<HTMLElement>('[data-cite]')]
    .map((c) => Number(c.dataset.cite))
    .filter((n) => Number.isInteger(n) && n > 0)

const elementOf = (node: Node): Element | null =>
  node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement

/**
 * Fragmento seleccionado dentro de una sola respuesta de `root`, o `null`. Las citas `[n]` salen del
 * propio fragmento; si no trae ninguna, de los párrafos o ítems donde empieza y termina.
 */
export function readSelection(root: HTMLElement): SelectionBar | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null
  const range = sel.getRangeAt(0)
  const common = elementOf(range.commonAncestorContainer)
  if (!common || !root.contains(common)) return null
  const answer = common.closest('[data-ask-answer]')
  if (!answer || !root.contains(answer)) return null
  const turnEl = answer.closest<HTMLElement>('[data-turn]')
  const turnId = Number(turnEl?.dataset.turn)
  if (!turnEl || !Number.isFinite(turnId)) return null

  const frag = range.cloneContents()
  let cites = citesIn(frag)
  if (!cites.length) {
    const ends = [range.startContainer, range.endContainer]
      .map((n) => elementOf(n)?.closest('[data-block]'))
      .filter((b): b is Element => !!b)
    cites = ends.flatMap((b) => citesIn(b))
  }
  for (const c of frag.querySelectorAll('[data-cite]')) c.remove()
  for (const b of frag.querySelectorAll(BLOCK_TAGS)) b.after(' ')
  const text = (frag.textContent ?? '').replace(/\s+/g, ' ').trim()
  if (!text) return null

  const rect = range.getBoundingClientRect()
  if (!rect.width && !rect.height) return null
  return {
    turnId,
    text,
    cites,
    x: rect.left + rect.width / 2,
    top: rect.top,
    bottom: rect.bottom,
  }
}

/**
 * Barra "Citar" para la selección de las respuestas de `rootRef`. Se actualiza al soltar el
 * puntero o al cambiar la selección con teclado, y se oculta al hacer scroll.
 */
export function useAnswerSelection(
  rootRef: RefObject<HTMLElement | null>,
  turns: readonly Turn[],
) {
  const [bar, setBar] = useState<SelectionBar | null>(null)
  const turnsRef = useRef(turns)
  useEffect(() => {
    turnsRef.current = turns
  })

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let down = false
    const update = () => {
      const root = rootRef.current
      setBar(root ? readSelection(root) : null)
    }
    const schedule = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        if (!down) update()
      }, 120)
    }
    const onDown = () => {
      down = true
    }
    const onUp = () => {
      down = false
      schedule()
    }
    const hide = () => setBar(null)
    document.addEventListener('selectionchange', schedule)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onUp)
    window.addEventListener('scroll', hide, true)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('selectionchange', schedule)
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onUp)
      window.removeEventListener('scroll', hide, true)
    }
  }, [rootRef])

  /** Agrega la selección a la próxima pregunta. `true` si quedó citada. */
  const quote = (): boolean => {
    if (!bar) return false
    const turn = turnsRef.current.find((t) => t.id === bar.turnId)
    const q = makeQuote(bar.text, bar.cites, turn?.sources ?? [])
    setBar(null)
    window.getSelection()?.removeAllRanges()
    if (!q) return false
    askStore.addQuote(q)
    return true
  }

  return { bar, quote, dismiss: () => setBar(null) }
}
