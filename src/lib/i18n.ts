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

  'ask.name': 'Ask Ether',
  'ask.trigger': 'Preguntar a Ether',
  'ask.close': 'Cerrar Ask Ether',
  'ask.newChat': 'Nueva conversación',
  'ask.conversation': 'Conversación',
  'ask.questionLabel': 'Tu pregunta',
  'ask.placeholder': 'Haz una pregunta',
  'ask.stop': 'Detener la respuesta',
  'ask.send': 'Enviar pregunta',
  'ask.keys': 'Intro envía · Mayús + Intro salto de línea',
  'ask.suggestions': 'Ejemplos de preguntas',
  'ask.suggestion1':
    '¿Cómo funciona el deploy blue/green y cómo hago rollback?',
  'ask.suggestion2': '¿Cómo dibujo texto en pantalla?',
  'ask.suggestion3': '¿Qué es un native y cómo se llama desde Lua?',
  'ask.status.waiting': 'Buscando en la documentación',
  'ask.status.streaming': 'Ether está respondiendo',
  'ask.status.stopped': 'Respuesta detenida',
  'ask.status.done': 'Respuesta lista',
  'ask.status.doneOne': 'Respuesta lista, 1 fuente citada',
  'ask.status.doneMany': 'Respuesta lista, {n} fuentes citadas',
  'ask.searching': 'Buscando en la documentación…',
  'ask.gated.title': 'Ask Ether es para suscriptores y staff.',
  'ask.gated.body':
    'Inicia sesión con una cuenta suscrita para preguntar. La búsqueda con Ctrl+K sigue disponible para todos.',
  'ask.empty.title': 'Pregunta en lenguaje natural',
  'ask.empty.body':
    'Ether responde solo con lo que dice la documentación de Astra Dev y cita las páginas. Si no lo encuentra, te lo dice.',
  'ask.privacy':
    'Tu pregunta y extractos de la documentación se envían al modelo de lenguaje (DeepSeek). El servidor no guarda preguntas ni respuestas; reutiliza respuestas repetidas durante una hora.',
  'ask.refused.lead':
    'Ask Ether solo responde con lo que hay en la documentación. Prueba con otras palabras o',
  'ask.refused.link': 'explora los documentos',
  'ask.retry': 'Reintentar',
  'ask.sources': 'Fuentes',
  'ask.sourcesCited': 'Fuentes citadas',
  'ask.note.stopped': 'Respuesta detenida.',
  'ask.note.truncated': 'La respuesta se cortó por longitud.',
  'ask.note.degraded':
    'Búsqueda por palabras clave: el índice semántico no está disponible.',
  'ask.note.cached': 'Respuesta reutilizada, sin consultar al modelo.',
  'ask.palette.group': 'Preguntar a Ether',
  'ask.palette.ask': 'Preguntar: «{q}»',
  'ask.palette.askHint':
    'Ether responde con lo que dice la documentación y cita las páginas',
  'ask.palette.open': 'Abrir Ask Ether',
  'ask.palette.openHint': 'Pregunta en lenguaje natural sobre la documentación',
  'ask.err.unauthenticated': 'Inicia sesión para usar Ask Ether.',
  'ask.err.unauthenticated.hint':
    'La búsqueda en Ctrl+K sigue disponible sin cuenta.',
  'ask.err.subscription': 'Ask Ether es para suscriptores y staff de Ad Astra.',
  'ask.err.subscription.hint': 'Tu cuenta no tiene una suscripción activa.',
  'ask.err.rate': 'Hiciste demasiadas preguntas seguidas.',
  'ask.err.rate.wait': 'Espera un momento y vuelve a intentar.',
  'ask.err.rate.in': 'Puedes volver a intentar en {wait}.',
  'ask.err.budget': 'Se alcanzó el límite diario de Ask Ether.',
  'ask.err.budget.reset': 'Se restablece a las 00:00 UTC.',
  'ask.err.budget.resetIn': 'Se restablece a las 00:00 UTC, en {wait}.',
  'ask.err.llm': 'No se pudo generar la respuesta (el modelo no responde).',
  'ask.err.llm.hint':
    'Las fuentes de la documentación sí se encontraron. Reintenta en unos segundos.',
  'ask.err.viewer':
    'No se pudo verificar tu sesión (el servicio de cuentas no responde).',
  'ask.err.viewer.hint': 'Reintenta en unos minutos.',
  'ask.err.index': 'El índice de la documentación no está disponible.',
  'ask.err.index.hint': 'Reintenta más tarde.',
  'ask.err.network': 'No se pudo conectar con el servidor de Ask Ether.',
  'ask.err.network.hint': 'Revisa tu conexión y reintenta.',
  'ask.err.stream': 'La respuesta se cortó antes de terminar.',
  'ask.err.stream.hint': 'Reintenta para obtenerla completa.',
  'ask.err.request': 'No se pudo enviar la pregunta.',
  'ask.err.request.hint': 'Prueba con una pregunta más corta.',
  'ask.err.other': 'Algo falló en el servidor de Ask Ether.',
  'ask.err.other.hint': 'Reintenta en unos segundos.',
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

  'ask.name': 'Ask Ether',
  'ask.trigger': 'Ask Ether',
  'ask.close': 'Close Ask Ether',
  'ask.newChat': 'New conversation',
  'ask.conversation': 'Conversation',
  'ask.questionLabel': 'Your question',
  'ask.placeholder': 'Ask a question',
  'ask.stop': 'Stop the answer',
  'ask.send': 'Send question',
  'ask.keys': 'Enter sends · Shift + Enter for a new line',
  'ask.suggestions': 'Example questions',
  'ask.suggestion1':
    'How does the blue/green deploy work and how do I roll back?',
  'ask.suggestion2': 'How do I draw text on screen?',
  'ask.suggestion3': 'What is a native and how is it called from Lua?',
  'ask.status.waiting': 'Searching the documentation',
  'ask.status.streaming': 'Ether is answering',
  'ask.status.stopped': 'Answer stopped',
  'ask.status.done': 'Answer ready',
  'ask.status.doneOne': 'Answer ready, 1 source cited',
  'ask.status.doneMany': 'Answer ready, {n} sources cited',
  'ask.searching': 'Searching the documentation…',
  'ask.gated.title': 'Ask Ether is for subscribers and staff.',
  'ask.gated.body':
    'Sign in with a subscribed account to ask. Search with Ctrl+K stays available to everyone.',
  'ask.empty.title': 'Ask in natural language',
  'ask.empty.body':
    'Ether answers only with what the Astra Dev documentation says and cites the pages. If it cannot find it, it tells you.',
  'ask.privacy':
    'Your question and excerpts of the documentation are sent to the language model (DeepSeek). The server does not store questions or answers; it reuses repeated answers for one hour.',
  'ask.refused.lead':
    'Ask Ether only answers with what is in the documentation. Try other words or',
  'ask.refused.link': 'browse the documents',
  'ask.retry': 'Retry',
  'ask.sources': 'Sources',
  'ask.sourcesCited': 'Cited sources',
  'ask.note.stopped': 'Answer stopped.',
  'ask.note.truncated': 'The answer was cut for length.',
  'ask.note.degraded': 'Keyword search: the semantic index is not available.',
  'ask.note.cached': 'Reused answer, the model was not queried.',
  'ask.palette.group': 'Ask Ether',
  'ask.palette.ask': 'Ask: “{q}”',
  'ask.palette.askHint':
    'Ether answers with what the documentation says and cites the pages',
  'ask.palette.open': 'Open Ask Ether',
  'ask.palette.openHint': 'Ask in natural language about the documentation',
  'ask.err.unauthenticated': 'Sign in to use Ask Ether.',
  'ask.err.unauthenticated.hint':
    'Search with Ctrl+K stays available without an account.',
  'ask.err.subscription': 'Ask Ether is for Ad Astra subscribers and staff.',
  'ask.err.subscription.hint': 'Your account has no active subscription.',
  'ask.err.rate': 'You asked too many questions in a row.',
  'ask.err.rate.wait': 'Wait a moment and try again.',
  'ask.err.rate.in': 'You can try again in {wait}.',
  'ask.err.budget': 'The daily Ask Ether limit was reached.',
  'ask.err.budget.reset': 'It resets at 00:00 UTC.',
  'ask.err.budget.resetIn': 'It resets at 00:00 UTC, in {wait}.',
  'ask.err.llm':
    'The answer could not be generated (the model is not responding).',
  'ask.err.llm.hint':
    'The documentation sources were found. Retry in a few seconds.',
  'ask.err.viewer':
    'Your session could not be verified (the accounts service is not responding).',
  'ask.err.viewer.hint': 'Retry in a few minutes.',
  'ask.err.index': 'The documentation index is not available.',
  'ask.err.index.hint': 'Retry later.',
  'ask.err.network': 'Could not reach the Ask Ether server.',
  'ask.err.network.hint': 'Check your connection and retry.',
  'ask.err.stream': 'The answer was cut off before it finished.',
  'ask.err.stream.hint': 'Retry to get the full answer.',
  'ask.err.request': 'The question could not be sent.',
  'ask.err.request.hint': 'Try a shorter question.',
  'ask.err.other': 'Something failed on the Ask Ether server.',
  'ask.err.other.hint': 'Retry in a few seconds.',
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
