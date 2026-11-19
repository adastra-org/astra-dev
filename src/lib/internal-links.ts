import { type RefObject, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

/**
 * Los enlaces del Markdown (`/docs/otro`, `/natives/x`) son `<a>` planos: se navegan sin recargar
 * la página. Delegación en el contenedor por listener nativo: el elemento no es interactivo, el
 * clic es de los enlaces que contiene (que ya son operables con teclado).
 */
export function useInternalLinks(ref: RefObject<HTMLElement | null>) {
  const navigate = useNavigate()
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as HTMLElement).closest('a')
      const href = a?.getAttribute('href')
      if (
        !a ||
        !href ||
        a.target ||
        !href.startsWith('/') ||
        href.startsWith('//')
      )
        return
      e.preventDefault()
      void navigate(href)
    }
    el.addEventListener('click', onClick)
    return () => el.removeEventListener('click', onClick)
  }, [navigate, ref])
}
