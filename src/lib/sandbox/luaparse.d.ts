// luaparse no publica tipos: solo se declara lo que usa `lint.ts`.
declare module 'luaparse' {
  export function parse(
    code: string,
    options?: {
      luaVersion?: '5.1' | '5.2' | '5.3' | 'LuaJIT'
      locations?: boolean
      comments?: boolean
      scope?: boolean
    },
  ): unknown
}
