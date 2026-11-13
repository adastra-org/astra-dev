// Spanish -> English vocabulary for native names. The natives are indexed in English
// (`GET_VEHICLE_CLASS`) and the embedder is weak across languages on identifiers, so a question
// like "cómo obtengo la velocidad de un vehículo" is expanded with `get`, `vehicle`, `speed`
// before it is matched against the words of native names. General vocabulary only: verbs that
// natives start with, and the nouns they are built from. Never a per-question patch.

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Same normalisation as `tokenize` in search.ts (accent-free, plural `s` stripped). */
const norm = (w: string): string => {
  const t = fold(w)
  return t.length > 3 && t.endsWith('s') ? t.slice(0, -1) : t
}

// English word -> Spanish surface forms (any conjugation worth catching).
const ENTRIES: Record<string, string> = {
  // verbs natives start with
  get: 'obtener obtengo obtiene obtenes conseguir consigo conseguis leer leo lee averiguar saber',
  set: 'cambiar cambio cambia cambias setear seteo seteas establecer establezco establece poner pongo pone modificar modifico asignar asigno asigna definir defino',
  create: 'crear creo crea creas spawnear spawneo generar genero',
  delete: 'eliminar elimino elimina borrar borro borra destruir destruyo',
  remove: 'eliminar elimino elimina remover quitar quito quita sacar',
  open: 'abrir abro abre',
  close: 'cerrar cierro cierra',
  is: 'verificar verifico chequear chequeo comprobar compruebo',
  start: 'iniciar inicio inicia empezar empiezo comenzar arrancar arranco',
  stop: 'detener detengo detiene parar paro frenar freno',
  give: 'dar doy da darle',
  attach: 'adjuntar enganchar',
  freeze: 'congelar congelo',
  // drawing, text and screen: verbs and nouns of the DRAW_*, SET_TEXT_*, *_TEXT_COMMAND_* natives
  draw: 'dibujar dibujo dibuja dibujas dibujado pintar pinto pinta trazar traza',
  display: 'mostrar muestro muestra mostras desplegar visualizar',
  show: 'mostrar muestro muestra mostras',
  print: 'imprimir imprimo escribir escribo escribe escribis',
  rect: 'rectangulo cuadro',
  box: 'caja cubo',
  line: 'linea trazo',
  sprite: 'sprite imagen icono',
  subtitle: 'subtitulo',
  message: 'mensaje',
  notification: 'notificacion aviso',
  help: 'ayuda',
  screen: 'pantalla',
  scaleform: 'scaleform',
  font: 'fuente tipografia letra',
  scale: 'escala',
  size: 'tamano',
  outline: 'contorno borde',
  shadow: 'sombra',
  origin: 'origen',
  minimap: 'minimapa',
  hud: 'hud interfaz',
  menu: 'menu',
  button: 'boton',
  mouse: 'raton mouse',
  cursor: 'cursor puntero',
  world: 'mundo',
  // nouns
  vehicle: 'vehiculo auto coche carro',
  class: 'clase',
  type: 'tipo',
  plate: 'matricula patente placa',
  number: 'numero',
  color: 'color colores',
  colour: 'color colores pintura',
  paint: 'pintura pintar',
  speed: 'velocidad',
  health: 'salud vida',
  engine: 'motor',
  door: 'puerta',
  window: 'ventana ventanilla',
  wheel: 'rueda neumatico llanta',
  tyre: 'neumatico llanta',
  player: 'jugador',
  ped: 'personaje peaton npc',
  coords: 'coordenada posicion ubicacion',
  position: 'posicion ubicacion',
  rotation: 'rotacion',
  heading: 'direccion orientacion',
  model: 'modelo',
  entity: 'entidad',
  object: 'objeto',
  weapon: 'arma',
  ammo: 'municion balas',
  light: 'luz luces faro',
  siren: 'sirena',
  horn: 'bocina claxon',
  fuel: 'combustible nafta gasolina',
  blip: 'blip mapa',
  marker: 'marcador',
  cam: 'camara',
  sound: 'sonido',
  audio: 'audio sonido',
  anim: 'animacion',
  task: 'tarea',
  time: 'hora tiempo',
  weather: 'clima',
  name: 'nombre',
  text: 'texto',
  distance: 'distancia',
  height: 'altura',
  owner: 'dueno propietario',
  driver: 'conductor',
  passenger: 'pasajero',
  seat: 'asiento',
  roof: 'techo',
  trunk: 'baul maletero',
  bonnet: 'capo',
  smoke: 'humo',
  fire: 'fuego incendio',
  explosion: 'explosion',
  invincible: 'invencible',
  visible: 'visible invisible',
  alpha: 'transparencia opacidad',
  network: 'red',
  control: 'control',
  stat: 'estadistica',
  interior: 'interior',
  room: 'sala habitacion',
  bone: 'hueso',
  skin: 'piel',
  component: 'componente',
  mod: 'mod modificacion tuning',
  livery: 'livery diseno',
  extra: 'extra',
  alarm: 'alarma',
  lock: 'bloqueo bloquear',
  radio: 'radio',
  gear: 'marcha cambio',
  rpm: 'rpm revoluciones',
  boat: 'bote barco',
  heli: 'helicoptero',
  plane: 'avion',
  bike: 'bicicleta moto',
  train: 'tren',
  hash: 'hash',
}

const BY_ES = new Map<string, Set<string>>()
const add = (k: string, en: string) => {
  const set = BY_ES.get(k) ?? new Set<string>()
  set.add(en)
  BY_ES.set(k, set)
}
for (const [en, es] of Object.entries(ENTRIES))
  for (const w of es.split(' ')) add(norm(w), en)
// Same spelling in both languages, or English written by the asker: the word itself counts.
for (const en of Object.keys(ENTRIES)) add(norm(en), en)

/** English words a normalised query token stands for (empty = not in the glossary). */
export const translate = (token: string): readonly string[] => [
  ...(BY_ES.get(token) ?? []),
]
