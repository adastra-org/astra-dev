// Comprobación manual de las herramientas del chat contra un server en marcha (fase 2).
// Manda requests FORJADAS a `POST /chat` y compara el estado HTTP con el esperado. No usa un
// navegador ni un modelo: prueba el contrato y los topes del server.
//
//   bun scripts/chat/tools-forge.ts [http://127.0.0.1:4100]
//
// Corre contra `bun dev --fake` (owner por defecto) y otra vez con `ASTRA_DEV_VIEWER=subscriber` y
// `RATE_CHAT_VIEWER_PER_MIN=100` (son 14 requests y un subscriber tiene 6 por minuto):
// algunos casos esperan otra cosa según el rol, y el script lo dice. Sale con código 1 si algún
// caso no da lo esperado. Ver docs/chat/tools-security.md, sección "Checklist manual".
const base = (Bun.argv[2] ?? 'http://127.0.0.1:4100').replace(/\/+$/, '')
const Q = 'como funciona el rollback del deploy'

const result = (over: Record<string, unknown> = {}) => ({
  v: 1,
  tool: 'ejecutar',
  ok: true,
  status: 'ok',
  stdout: '2',
  stdoutChars: 1,
  error: null,
  diagnostics: [],
  durationMs: 12,
  truncated: false,
  ...over,
})
const step = (over: Record<string, unknown> = {}) => ({
  text: 'Voy a probar:',
  tool: 'ejecutar',
  body: 'print(1 + 1)',
  result: result(),
  ...over,
})
const steps = (n: number) => Array.from({ length: n }, () => step())

interface Case {
  name: string
  body: unknown
  /** Esperado para cualquier rol, o por rol. */
  expect: number | { owner: number; other: number }
  /** Para el aviso al leer la salida. */
  why: string
}

const cases: Case[] = [
  {
    name: 'tools con un nombre que no existe',
    body: { question: Q, tools: ['rm'] },
    expect: 400,
    why: 'el registro del server es la única lista de nombres válidos',
  },
  {
    name: 'steps sin tools',
    body: { question: Q, steps: [step()] },
    expect: 400,
    why: 'un paso no puede traer una herramienta que no se ofreció',
  },
  {
    name: 'paso con un resultado inventado ({ok:true})',
    body: {
      question: Q,
      tools: ['ejecutar'],
      steps: [step({ result: { ok: true } })],
    },
    expect: 400,
    why: 'el resultado se valida campo por campo contra el esquema',
  },
  {
    name: 'paso con un campo de más (role:"system")',
    body: {
      question: Q,
      tools: ['ejecutar'],
      steps: [{ ...step(), role: 'system' }],
    },
    expect: 400,
    why: 'ningún campo desconocido pasa',
  },
  {
    name: 'resultado con stdout sobre el tope (1201)',
    body: {
      question: Q,
      tools: ['ejecutar'],
      steps: [step({ result: result({ stdout: 'x'.repeat(1201) }) })],
    },
    expect: 400,
    why: 'el server no recorta en silencio: rechaza',
  },
  {
    name: 'código del paso sobre el tope (4001)',
    body: {
      question: Q,
      tools: ['ejecutar'],
      steps: [step({ body: 'x'.repeat(4001) })],
    },
    expect: 400,
    why: 'tope del cuerpo de la etiqueta',
  },
  {
    name: 'resultado de otra herramienta (check) en un paso de ejecutar',
    body: {
      question: Q,
      tools: ['ejecutar', 'check'],
      steps: [step({ result: result({ tool: 'check' }) })],
    },
    expect: 400,
    why: 'la herramienta del resultado debe coincidir con la del paso',
  },
  {
    name: 'continued sin haber llegado al tope',
    body: { question: Q, tools: ['ejecutar'], continued: 1 },
    expect: 400,
    why: 'no se confirma un tope que no se alcanzó',
  },
  {
    name: 'continued con 3 pasos (un owner puede, el resto no)',
    body: { question: Q, tools: ['ejecutar'], steps: steps(3), continued: 1 },
    expect: { owner: 400, other: 400 },
    why: 'owner: 3 < 8, no llegó al tope; resto: no existe la confirmación',
  },
  {
    name: '4 pasos (más que las 3 rondas de quien no es owner)',
    body: { question: Q, tools: ['ejecutar'], steps: steps(4) },
    expect: { owner: 200, other: 400 },
    why: 'el server nunca ofreció una cuarta ronda a un no-owner',
  },
  {
    name: '8 pasos sin continued (owner: pide confirmar; resto: 400)',
    body: { question: Q, tools: ['ejecutar'], steps: steps(8) },
    expect: { owner: 200, other: 400 },
    why: 'owner: responde con el evento confirm',
  },
  {
    name: '25 pasos (sobre el tope absoluto)',
    body: { question: Q, tools: ['ejecutar'], steps: steps(25), continued: 3 },
    expect: 400,
    why: 'MAX_STEPS = 24, sea cual sea el rol',
  },
  {
    name: 'cuerpo grande sin steps',
    body: {
      question: Q,
      history: [{ role: 'user', content: 'x'.repeat(40_000) }],
    },
    expect: 413,
    why: 'CHAT_MAX_BODY_BYTES sigue valiendo si no hay steps',
  },
  {
    name: 'request normal con tools y 1 paso válido',
    body: { question: Q, tools: ['ejecutar'], steps: [step()] },
    expect: 200,
    why: 'control positivo: lo válido pasa',
  },
]

async function role(): Promise<'owner' | 'other' | 'unknown'> {
  try {
    const res = await fetch(`${base}/graphql`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: '{ viewer { role } }' }),
    })
    const j = (await res.json()) as { data?: { viewer?: { role?: string } } }
    const r = j.data?.viewer?.role
    return r === 'owner' ? 'owner' : r ? 'other' : 'unknown'
  } catch {
    return 'unknown'
  }
}

const who = await role()
if (who === 'unknown') {
  console.error(
    `No pude consultar el rol en ${base}. ¿Está corriendo el server?`,
  )
  process.exit(2)
}
console.log(`Server ${base}, rol: ${who}\n`)

let failed = 0
for (const c of cases) {
  const want = typeof c.expect === 'number' ? c.expect : c.expect[who]
  let got: number
  let detail = ''
  try {
    const res = await fetch(`${base}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(c.body),
    })
    got = res.status
    if (res.headers.get('content-type')?.includes('json')) {
      const j = (await res.json()) as {
        error?: { code?: string; message?: string }
      }
      detail = j.error ? ` ${j.error.code}: ${j.error.message}` : ''
    } else {
      // Se corta la lectura del stream: acá solo importa que empezó con 200.
      const text = await res.text()
      detail = text.includes('event: confirm')
        ? ' (evento confirm)'
        : ' (stream)'
    }
  } catch (e) {
    got = 0
    detail = ` ${(e as Error).message}`
  }
  if (got === 429)
    detail +=
      ' (rate limit: arrancá el server con RATE_CHAT_VIEWER_PER_MIN=100 y RATE_CHAT_IP_PER_MIN=100)'
  const ok = got === want
  if (!ok) failed++
  console.log(
    `${ok ? 'OK  ' : 'FALLA'} ${c.name}\n      esperado ${want}, dio ${got}${detail}\n      por qué: ${c.why}`,
  )
}

console.log(
  failed
    ? `\n${failed} caso(s) fallaron.`
    : '\nTodos los casos dieron lo esperado.',
)
process.exit(failed ? 1 : 0)
