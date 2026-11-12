// Contexto del idioma de la interfaz y su hook. El proveedor vive en `i18n-context.tsx`.
import { createContext, useContext } from 'react'
import type { MessageKey, UiLang, Vars } from './i18n'

export interface LangValue {
  lang: UiLang
  setLang: (lang: UiLang) => void
  /** Traduce una clave del diccionario. */
  tr: (key: MessageKey, vars?: Vars) => string
}

export const LangContext = createContext<LangValue | null>(null)

export function useLang(): LangValue {
  const v = useContext(LangContext)
  if (!v) throw new Error('useLang fuera de <LangProvider>')
  return v
}
