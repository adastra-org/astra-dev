// Estado del idioma de la interfaz (M2). Se guarda en `localStorage` y se aplica al `<html lang>`.
// Los textos salen de `lib/i18n.ts`; los componentes no escriben copy en español a mano.
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { readStoredLang, storeLang, t, type UiLang } from './i18n'
import { LangContext, type LangValue } from './use-lang'

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, set] = useState<UiLang>(readStoredLang)

  // `<html lang>` alimenta lectores de pantalla, guionado y el corrector del navegador.
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const setLang = useCallback((next: UiLang) => {
    set(next)
    storeLang(next)
  }, [])

  const value = useMemo<LangValue>(
    () => ({ lang, setLang, tr: (key, vars) => t(lang, key, vars) }),
    [lang, setLang],
  )

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>
}
