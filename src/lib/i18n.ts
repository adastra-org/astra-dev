// Textos de la interfaz en ES y EN. Un solo diccionario plano con claves `area.clave`; el valor
// puede llevar marcadores `{nombre}` que `t()` reemplaza. El contenido de los docs no está acá:
// cada doc trae su idioma y su traducción (ver lib/docs/types.ts).
export type UiLang = 'es' | 'en'

export const UI_LANGS: readonly UiLang[] = ['es', 'en']

const es = {
  'lang.name': 'Idioma',
  'lang.es': 'ES',
  'lang.en': 'EN',
  'lang.switchTo': 'Cambiar el idioma a {lang}',

  'shell.skip': 'Saltar al contenido',
  'shell.openMenu': 'Abrir menú',
  'shell.closeMenu': 'Cerrar menú',
  'shell.mainNav': 'Navegación principal',
  'shell.namespaces': 'Namespaces de natives',
  'shell.docs': 'Documentos',

  'nav.home': 'Inicio',
  'nav.home.desc':
    'Accesos a documentación, herramientas y estado del proyecto.',
  'nav.docs': 'Documentación',
  'nav.docs.desc': 'Sistemas, guías y manuales de FiveM, en español.',
  'nav.natives': 'Natives',
  'nav.natives.desc':
    'Referencia de natives de GTA V y de CFX, con las notas de Astra.',
  'nav.tools': 'Herramientas',
  'nav.tools.desc': 'Utilidades internas del equipo.',
  'nav.roadmap': 'Roadmap',
  'nav.roadmap.desc': 'Estado del proyecto: tareas, issues y evolución.',

  'crumbs.label': 'Migas de pan',
  'crumbs.up': 'Subir a {label}',
  'crumbs.notFound': 'Página no encontrada',
  'crumbs.docNotFound': 'Documento no encontrado',
  'crumbs.nsNotFound': 'Namespace no encontrado',

  'palette.title': 'Buscar en Astra Dev',
  'palette.search': 'Buscar',
  'palette.placeholder': 'Busca documentos, secciones y páginas',
  'palette.close': 'Cerrar búsqueda',
  'palette.results': 'Resultados',
  'palette.empty': 'Sin resultados para «{query}».',
  'palette.emptyHint': 'Prueba con otro término o con una parte del nombre.',
  'palette.noResults': 'Sin resultados',
  'palette.resultsCount': '{n} resultado',
  'palette.resultsPlural': '{n} resultados',
  'palette.navigate': 'navegar',
  'palette.jump': 'extremos',
  'palette.open': 'abrir',
  'palette.closeKey': 'cerrar',
  'palette.arrows': 'Flechas arriba y abajo',
  'palette.homeEnd': 'Inicio y Fin',
  'palette.enter': 'Intro',
  'palette.tags': 'Tags',
  'palette.section.recent': 'Recientes',
  'palette.section.headings': 'En esta página',
  'palette.section.nav': 'Ir a',
  'palette.section.docs': 'Documentación',
  'palette.section.natives': 'Natives',

  'home.eyebrow': 'Ad Astra',
  'home.lead':
    'Documentación, herramientas y sistemas para desarrollar el servidor de Ad Astra, en español y pensados para leerse rápido.',
  'home.open': 'Abrir',

  'docs.title': 'Documentación',
  'docs.lead':
    'Guías del proyecto y manuales de FiveM. Cada página abre con un resumen, sigue con el ejemplo mínimo y deja el detalle plegado. Los natives están en su propia sección.',
  'docs.filterLabel': 'Filtrar documentos por título o tag',
  'docs.filterPlaceholder': 'Filtrar por título o tag',
  'docs.countFiltered': '{shown} de {total} documentos',
  'docs.count': '{n} documentos',
  'docs.empty': 'Ningún documento coincide con «{query}».',
  'docs.clear': 'Borrar el filtro',
  'docs.fivem': 'Documentación de FiveM',
  'docs.fivemLead':
    'Manuales y referencia de la comunidad (citizenfx), importados con su enlace al original. Están en inglés; los que tienen traducción lo indican.',

  'doc.eyebrow': 'Documento',
  'doc.eyebrowFivem': 'Documentación de FiveM',
  'doc.since': 'Desde v{version}',
  'doc.related': 'Relacionados',
  'doc.usedBy': 'Usada por',
  'doc.history': 'Historial de cambios',
  'doc.historyCount': 'Historial de cambios ({n})',
  'doc.historyUnavailable':
    'El historial no está disponible en este build: no hay git o el clon es superficial.',
  'doc.historyEmpty': 'Este archivo todavía no tiene commits.',
  'doc.viewOnGithub': 'Ver el archivo en GitHub',
  'doc.loading': 'Cargando documento…',
  'doc.loadError': 'No se pudo cargar el documento. Recarga la página.',
  'doc.notFound.title': 'Documento no encontrado',
  'doc.notFound.lead': 'No hay un documento con la dirección',
  'doc.notFound.hint': 'Puede haberse renombrado o eliminado.',
  'doc.all': 'Ver todos los documentos',
  'doc.source': 'Fuente',
  'doc.sourceLead':
    'Contenido de la documentación pública de FiveM (citizenfx), importado sin cambios de fondo. Astra no es el autor del original.',
  'doc.sourcePage': 'Página original en docs.fivem.net',
  'doc.sourceRepo': 'Archivo en GitHub, en la versión importada',
  'doc.backToTop': 'Volver arriba',
  'doc.anchor': 'Enlace a {title}',
  'code.copy': 'Copiar',
  'code.copied': 'Copiado',
  'code.copiedStatus': 'Código copiado al portapapeles',
  'code.text': 'texto',

  'toc.thisPage': 'En esta página',
  'summary.title': 'Resumen',

  'translation.auto': 'Traducción automática',
  'translation.reviewed': 'Traducción revisada',
  'translation.note': 'Idioma del contenido',
  'translation.autoHint':
    '. Puede tener errores: ante la duda, revisa el original.',
  'translation.original': 'Estás viendo el',
  'translation.originalStrong': 'original en inglés',
  'translation.seeOriginal': 'Ver el original en inglés',
  'translation.seeTranslation': 'Ver la traducción',
  'translation.onlySpanish':
    'Esta página solo está en español: todavía no tiene traducción al inglés.',

  'natives.title': 'Natives',
  'natives.nativeEyebrow': 'Native',
  'natives.eyebrow': 'Referencia',
  'natives.lead':
    '{total} natives de GTA V y de CFX. Busca por nombre (SetVehicleDoorOpen o SET_VEHICLE_DOOR_OPEN) o por hash, o entra por un namespace.',
  'natives.filterLabel': 'Buscar un native por nombre o por hash',
  'natives.filterPlaceholder':
    'Nombre o hash, por ejemplo GetEntityCoords o 0xBB75D38B',
  'natives.loadError':
    'No se pudo cargar el índice de natives. Recarga la página.',
  'natives.loading': 'Cargando el índice…',
  'natives.empty': 'Ningún native coincide con «{query}».',
  'natives.count': '{n} resultados',
  'natives.gta': 'Natives del juego por namespace.',
  'natives.cfx':
    'Natives propios de FiveM, por entorno (cliente, servidor o ambos).',
  'natives.groupCount': '{n} natives.',
  'natives.groupFilter': 'Filtrar los natives de {group}',
  'natives.groupPlaceholder': 'Filtrar por nombre, hash o texto',
  'natives.groupLoading': 'Cargando…',
  'natives.groupFiltered': '{shown} de {total} natives',
  'natives.groupTotal': '{n} natives',
  'natives.nsNotFound': 'Namespace no encontrado',
  'natives.nsNotFoundLead': 'No hay un namespace con la dirección',
  'natives.allGroups': 'Ver todos los namespaces',
  'natives.nativeNotFound': 'Native no encontrado',
  'natives.nativeNotFoundLead': 'No hay un native con la dirección',
  'natives.nativeNotFoundHint':
    'Prueba con el buscador (Ctrl+K) por nombre o por hash.',
  'natives.all': 'Ver todos los natives',
  'natives.loadingNative': 'Cargando native…',
  'natives.nativeLoadError': 'No se pudo cargar el native. Recarga la página.',
  'natives.astraNotes': 'Con notas de Astra',
  'natives.noSummary':
    'Este native no tiene descripción en la fuente. La firma y los parámetros son lo único documentado.',
  'natives.mentionedIn': 'Mencionado en',
  'natives.sourceLead':
    'Referencia de la comunidad de FiveM (citizenfx), importada sin cambios de fondo.',
  'natives.sourceLeadNotes':
    ' Las notas de Astra son del equipo y van aparte del original.',
  'natives.sourceFile': 'Archivo original en GitHub',

  'tools.title': 'Herramientas',
  'tools.lead':
    'Utilidades del equipo: mapeo, vehículos y conversión de assets.',
  'tools.placeholderText':
    'El catálogo de herramientas y el sandbox de código llegan más adelante.',

  'roadmap.title': 'Roadmap',
  'roadmap.eyebrow': 'Proyecto',
  'roadmap.lead': 'Tareas, issues y evolución del desarrollo de Ad Astra.',
  'roadmap.placeholderText':
    'La integración con el checklist y GitHub Projects llega más adelante.',

  'notFound.eyebrow': 'Error 404',
  'notFound.title': 'Página no encontrada',
  'notFound.lead':
    'La dirección no existe o se movió. Vuelve al inicio o busca en la documentación.',
  'notFound.home': 'Ir al inicio',
  'notFound.title.short': 'No encontrada',
} as const

export type MessageKey = keyof typeof es

const en: Record<MessageKey, string> = {
  'lang.name': 'Language',
  'lang.es': 'ES',
  'lang.en': 'EN',
  'lang.switchTo': 'Switch the language to {lang}',

  'shell.skip': 'Skip to content',
  'shell.openMenu': 'Open menu',
  'shell.closeMenu': 'Close menu',
  'shell.mainNav': 'Main navigation',
  'shell.namespaces': 'Native namespaces',
  'shell.docs': 'Documents',

  'nav.home': 'Home',
  'nav.home.desc': 'Shortcuts to documentation, tools and project status.',
  'nav.docs': 'Documentation',
  'nav.docs.desc': 'FiveM systems, guides and manuals, in Spanish.',
  'nav.natives': 'Natives',
  'nav.natives.desc': 'GTA V and CFX native reference, with Astra notes.',
  'nav.tools': 'Tools',
  'nav.tools.desc': 'Internal team utilities.',
  'nav.roadmap': 'Roadmap',
  'nav.roadmap.desc': 'Project status: tasks, issues and evolution.',

  'crumbs.label': 'Breadcrumbs',
  'crumbs.up': 'Up to {label}',
  'crumbs.notFound': 'Page not found',
  'crumbs.docNotFound': 'Document not found',
  'crumbs.nsNotFound': 'Namespace not found',

  'palette.title': 'Search Astra Dev',
  'palette.search': 'Search',
  'palette.placeholder': 'Search documents, sections and pages',
  'palette.close': 'Close search',
  'palette.results': 'Results',
  'palette.empty': 'No results for “{query}”.',
  'palette.emptyHint': 'Try another term or part of the name.',
  'palette.noResults': 'No results',
  'palette.resultsCount': '{n} result',
  'palette.resultsPlural': '{n} results',
  'palette.navigate': 'navigate',
  'palette.jump': 'jump',
  'palette.open': 'open',
  'palette.closeKey': 'close',
  'palette.arrows': 'Arrow up and down',
  'palette.homeEnd': 'Home and End',
  'palette.enter': 'Enter',
  'palette.tags': 'Tags',
  'palette.section.recent': 'Recent',
  'palette.section.headings': 'On this page',
  'palette.section.nav': 'Go to',
  'palette.section.docs': 'Documentation',
  'palette.section.natives': 'Natives',

  'home.eyebrow': 'Ad Astra',
  'home.lead':
    'Documentation, tools and systems to build the Ad Astra server: in Spanish and made to be read fast.',
  'home.open': 'Open',

  'docs.title': 'Documentation',
  'docs.lead':
    'Project guides and FiveM manuals. Every page opens with a summary, then the smallest working example, and leaves the detail collapsed. Natives have their own section.',
  'docs.filterLabel': 'Filter documents by title or tag',
  'docs.filterPlaceholder': 'Filter by title or tag',
  'docs.countFiltered': '{shown} of {total} documents',
  'docs.count': '{n} documents',
  'docs.empty': 'No document matches “{query}”.',
  'docs.clear': 'Clear the filter',
  'docs.fivem': 'FiveM documentation',
  'docs.fivemLead':
    'Community manuals and reference (citizenfx), imported with a link to the original. They are in English; translated pages say so.',

  'doc.eyebrow': 'Document',
  'doc.eyebrowFivem': 'FiveM documentation',
  'doc.since': 'Since v{version}',
  'doc.related': 'Related',
  'doc.usedBy': 'Used by',
  'doc.history': 'Change history',
  'doc.historyCount': 'Change history ({n})',
  'doc.historyUnavailable':
    'History is not available in this build: there is no git or the clone is shallow.',
  'doc.historyEmpty': 'This file has no commits yet.',
  'doc.viewOnGithub': 'View the file on GitHub',
  'doc.loading': 'Loading document…',
  'doc.loadError': 'The document could not be loaded. Reload the page.',
  'doc.notFound.title': 'Document not found',
  'doc.notFound.lead': 'There is no document at the address',
  'doc.notFound.hint': 'It may have been renamed or removed.',
  'doc.all': 'See all documents',
  'doc.source': 'Source',
  'doc.sourceLead':
    'Content from the public FiveM documentation (citizenfx), imported as-is. Astra is not the author of the original.',
  'doc.sourcePage': 'Original page on docs.fivem.net',
  'doc.sourceRepo': 'File on GitHub, at the imported version',
  'doc.backToTop': 'Back to top',
  'doc.anchor': 'Link to {title}',
  'code.copy': 'Copy',
  'code.copied': 'Copied',
  'code.copiedStatus': 'Code copied to the clipboard',
  'code.text': 'text',

  'toc.thisPage': 'On this page',
  'summary.title': 'Summary',

  'translation.auto': 'Automatic translation',
  'translation.reviewed': 'Reviewed translation',
  'translation.note': 'Content language',
  'translation.autoHint':
    '. It may contain errors: when in doubt, check the original.',
  'translation.original': 'You are reading the',
  'translation.originalStrong': 'English original',
  'translation.seeOriginal': 'See the English original',
  'translation.seeTranslation': 'See the translation',
  'translation.onlySpanish':
    'This page is only available in Spanish: there is no English translation yet.',

  'natives.title': 'Natives',
  'natives.nativeEyebrow': 'Native',
  'natives.eyebrow': 'Reference',
  'natives.lead':
    '{total} GTA V and CFX natives. Search by name (SetVehicleDoorOpen or SET_VEHICLE_DOOR_OPEN) or by hash, or browse a namespace.',
  'natives.filterLabel': 'Search a native by name or hash',
  'natives.filterPlaceholder':
    'Name or hash, for example GetEntityCoords or 0xBB75D38B',
  'natives.loadError': 'The native index could not be loaded. Reload the page.',
  'natives.loading': 'Loading the index…',
  'natives.empty': 'No native matches “{query}”.',
  'natives.count': '{n} results',
  'natives.gta': 'Game natives by namespace.',
  'natives.cfx': 'FiveM natives, by environment (client, server or both).',
  'natives.groupCount': '{n} natives.',
  'natives.groupFilter': 'Filter the natives of {group}',
  'natives.groupPlaceholder': 'Filter by name, hash or text',
  'natives.groupLoading': 'Loading…',
  'natives.groupFiltered': '{shown} of {total} natives',
  'natives.groupTotal': '{n} natives',
  'natives.nsNotFound': 'Namespace not found',
  'natives.nsNotFoundLead': 'There is no namespace at the address',
  'natives.allGroups': 'See all namespaces',
  'natives.nativeNotFound': 'Native not found',
  'natives.nativeNotFoundLead': 'There is no native at the address',
  'natives.nativeNotFoundHint': 'Try the search (Ctrl+K) by name or hash.',
  'natives.all': 'See all natives',
  'natives.loadingNative': 'Loading native…',
  'natives.nativeLoadError': 'The native could not be loaded. Reload the page.',
  'natives.astraNotes': 'With Astra notes',
  'natives.noSummary':
    'This native has no description in the source. The signature and parameters are all that is documented.',
  'natives.mentionedIn': 'Mentioned in',
  'natives.sourceLead':
    'FiveM community reference (citizenfx), imported as-is.',
  'natives.sourceLeadNotes':
    ' Astra notes are written by the team and kept apart from the original.',
  'natives.sourceFile': 'Original file on GitHub',

  'tools.title': 'Tools',
  'tools.lead': 'Team utilities: mapping, vehicles and asset conversion.',
  'tools.placeholderText':
    'The tools catalog and the code sandbox are coming later.',

  'roadmap.title': 'Roadmap',
  'roadmap.eyebrow': 'Project',
  'roadmap.lead': 'Tasks, issues and evolution of Ad Astra development.',
  'roadmap.placeholderText':
    'The checklist and GitHub Projects integration is coming later.',

  'notFound.eyebrow': 'Error 404',
  'notFound.title': 'Page not found',
  'notFound.lead':
    'The address does not exist or was moved. Go back home or search the documentation.',
  'notFound.home': 'Go home',
  'notFound.title.short': 'Not found',
}

export const MESSAGES: Record<UiLang, Record<MessageKey, string>> = { es, en }

export type Vars = Record<string, string | number>

/** Texto para `lang`. Reemplaza `{nombre}` con `vars`; un marcador sin valor queda tal cual. */
export function t(lang: UiLang, key: MessageKey, vars?: Vars): string {
  const raw = MESSAGES[lang]?.[key] ?? MESSAGES.es[key] ?? key
  if (!vars) return raw
  return raw.replace(/\{(\w+)\}/g, (m, name: string) =>
    name in vars ? String(vars[name]) : m,
  )
}

const STORAGE_KEY = 'astra-dev:lang'

/** Idioma guardado; `es` si no hay, si el valor no es válido o si el almacenamiento falla. */
export function readStoredLang(): UiLang {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === 'en' ? 'en' : 'es'
  } catch {
    return 'es'
  }
}

export function storeLang(lang: UiLang): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    // Modo privado o cuota llena: la elección dura lo que la pestaña.
  }
}

/** `?lang=en|es` manda; si no hay parámetro válido, el idioma de la interfaz. */
export function wantedLang(param: string | null, uiLang: UiLang): UiLang {
  return param === 'en' || param === 'es' ? param : uiLang
}
