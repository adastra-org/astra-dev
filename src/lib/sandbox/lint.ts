// Lint de un snippet de Lua. No existe un luacheck mantenido para JS/WASM, así que se arma con
// `luaparse` (parser puro en JS, unos 50 KB) más reglas propias. Corre en `tools.worker.ts`.
//
// Reglas:
//   - Error de sintaxis, con línea y columna (luaparse entiende hasta Lua 5.3; `<const>` y
//     `<close>` de 5.4 se tapan antes de analizar).
//   - Variable local sin usar (los nombres que empiezan con `_` se ignoran).
//   - Uso de un global que el sandbox no ofrece (`os`, `io`, `require`, `load`...).
//
// No avisa de globales no definidos: en FiveM casi todo son natives que el sandbox no conoce.
import { parse } from 'luaparse'

export interface Diagnostic {
  severity: 'error' | 'warning'
  line: number
  column: number
  /** Texto en español (tests y respaldo). La interfaz traduce por `code` y `name`. */
  message: string
  code?: 'unavailable' | 'unusedLocal'
  name?: string
}

/** Globals que existen en un resource de FiveM pero no en el sandbox. */
export const UNAVAILABLE = [
  'os',
  'io',
  'package',
  'require',
  'load',
  'loadstring',
  'loadfile',
  'dofile',
  'getfenv',
  'setfenv',
] as const

interface Loc {
  start: { line: number; column: number }
}
interface Node {
  type: string
  loc?: Loc
  [key: string]: unknown
}

interface Local {
  name: string
  line: number
  column: number
  used: boolean
  report: boolean
}

const isNode = (v: unknown): v is Node =>
  typeof v === 'object' && v !== null && typeof (v as Node).type === 'string'

/** Tapa `<const>` y `<close>` (Lua 5.4) con espacios para que luaparse no falle. */
export function blankAttribs(code: string): string {
  return code.replace(/<\s*(?:const|close)\s*>/g, (m) => ' '.repeat(m.length))
}

class Analyzer {
  scopes: Map<string, Local>[] = []
  all: Local[] = []
  out: Diagnostic[] = []

  push() {
    this.scopes.push(new Map())
  }
  pop() {
    this.scopes.pop()
  }
  declare(id: Node, report: boolean) {
    const name = String(id.name)
    const l: Local = {
      name,
      line: id.loc?.start.line ?? 1,
      column: (id.loc?.start.column ?? 0) + 1,
      used: false,
      report: report && !name.startsWith('_'),
    }
    this.scopes.at(-1)?.set(name, l)
    this.all.push(l)
  }
  find(name: string): Local | undefined {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const l = this.scopes[i]?.get(name)
      if (l) return l
    }
    return undefined
  }
  /** Uso (lectura) de un nombre. */
  use(id: Node) {
    const name = String(id.name)
    const l = this.find(name)
    if (l) {
      l.used = true
      return
    }
    if ((UNAVAILABLE as readonly string[]).includes(name))
      this.out.push({
        severity: 'warning',
        line: id.loc?.start.line ?? 1,
        column: (id.loc?.start.column ?? 0) + 1,
        message: `«${name}» no está disponible en el sandbox`,
        code: 'unavailable',
        name,
      })
  }
  /** Escritura: no cuenta como uso del local. */
  write(target: unknown) {
    if (isNode(target) && target.type === 'Identifier') return
    this.visit(target)
  }

  visitAll(list: unknown) {
    if (Array.isArray(list)) for (const n of list) this.visit(n)
  }
  block(list: unknown) {
    this.push()
    this.visitAll(list)
    this.pop()
  }

  visit(n: unknown) {
    if (!isNode(n)) return
    switch (n.type) {
      case 'Identifier':
        this.use(n)
        return
      case 'LocalStatement': {
        this.visitAll(n.init)
        for (const v of n.variables as Node[]) this.declare(v, true)
        return
      }
      case 'AssignmentStatement':
        this.visitAll(n.init)
        for (const t of n.variables as unknown[]) this.write(t)
        return
      case 'FunctionDeclaration': {
        const id = n.identifier
        this.push()
        if (isNode(id) && n.isLocal) {
          // `local function f`: el nombre vive en el scope de afuera y dentro de f (recursión).
          this.scopes.at(-2)?.set(String(id.name), {
            name: String(id.name),
            line: id.loc?.start.line ?? 1,
            column: (id.loc?.start.column ?? 0) + 1,
            used: false,
            report: !String(id.name).startsWith('_'),
          })
          const l = this.scopes.at(-2)?.get(String(id.name))
          if (l) this.all.push(l)
        } else if (isNode(id)) {
          this.write(id)
          if (id.type === 'MemberExpression') this.visit(id)
        }
        for (const p of n.parameters as Node[]) {
          if (p.type === 'Identifier') this.declare(p, false)
        }
        this.visitAll(n.body)
        this.pop()
        return
      }
      case 'ForNumericStatement':
        this.visit(n.start)
        this.visit(n.end)
        this.visit(n.step)
        this.push()
        this.declare(n.variable as Node, false)
        this.visitAll(n.body)
        this.pop()
        return
      case 'ForGenericStatement':
        this.visitAll(n.iterators)
        this.push()
        for (const v of n.variables as Node[]) this.declare(v, false)
        this.visitAll(n.body)
        this.pop()
        return
      case 'RepeatStatement':
        // La condición ve los locales del cuerpo.
        this.push()
        this.visitAll(n.body)
        this.visit(n.condition)
        this.pop()
        return
      case 'DoStatement':
      case 'WhileStatement':
      case 'IfClause':
      case 'ElseifClause':
      case 'ElseClause':
        this.visit(n.condition)
        this.block(n.body)
        return
      case 'MemberExpression':
        // `a.b` y `a:b`: solo `a` es una lectura; `b` es un nombre de campo.
        this.visit(n.base)
        return
      case 'TableKeyString':
        // `{ nombre = v }`: la clave es un nombre de campo, no una lectura.
        this.visit(n.value)
        return
      case 'LabelStatement':
      case 'GotoStatement':
      case 'BreakStatement':
        return
      default:
        for (const value of Object.values(n)) {
          if (Array.isArray(value)) this.visitAll(value)
          else if (isNode(value)) this.visit(value)
        }
    }
  }
}

/** Mensajes de luaparse: "[3:7] mensaje". */
function syntaxError(e: unknown): Diagnostic {
  const err = e as { message?: string; line?: number; column?: number }
  const message = String(err.message ?? 'error de sintaxis').replace(
    /^\[\d+:\d+\]\s*/,
    '',
  )
  return {
    severity: 'error',
    line: typeof err.line === 'number' ? err.line : 1,
    column: typeof err.column === 'number' ? err.column + 1 : 1,
    message,
  }
}

export function lintLua(code: string): Diagnostic[] {
  let ast: Node
  try {
    ast = parse(blankAttribs(code), {
      luaVersion: '5.3',
      locations: true,
      comments: false,
    }) as unknown as Node
  } catch (e) {
    return [syntaxError(e)]
  }
  const a = new Analyzer()
  a.push()
  a.visitAll(ast.body)
  a.pop()
  for (const l of a.all)
    if (!l.used && l.report)
      a.out.push({
        severity: 'warning',
        line: l.line,
        column: l.column,
        message: `variable local «${l.name}» sin usar`,
        code: 'unusedLocal',
        name: l.name,
      })
  return a.out.sort((x, y) => x.line - y.line || x.column - y.column)
}
