// PreToolUse (Write|Edit|MultiEdit): rejects server-side FiveM code the docs mark as blocked or removed.
// Source: fivem-docs developers/sandbox, server-security, legacy-vs-enhanced (see AGENTS.md).
// Scope: .lua, .cfg and fxmanifest only; this repo's own TS/MD may name these APIs freely.

export type Rule = { re: RegExp; action: 'deny' | 'ask'; why: string }

const LUA: Rule[] = [
  {
    re: /\bos\.execute\b/,
    action: 'deny',
    why: 'os.execute is blocked by the server sandbox',
  },
  {
    re: /\bio\.tmpfile\b/,
    action: 'deny',
    why: 'io.tmpfile is blocked by the server sandbox',
  },
  {
    re: /\bio\.popen\b/,
    action: 'deny',
    why: 'io.popen only emulates `ls` and `dir` in the sandbox',
  },
  {
    re: /\b(?:i?pairs)\s*\(\s*io\.readdir/,
    action: 'deny',
    why: 'io.readdir returns a handle: iterate with handle:lines()',
  },
  {
    re: /\.\.[\/]/,
    action: 'ask',
    why: '`..` path traversal is rejected by the sandbox (SaveResourceFile / io.open)',
  },
]

const CFG: Rule[] = [
  {
    re: /\bsv_useAccurateSends\b/,
    action: 'deny',
    why: 'removed in Enhanced: use sv_syncTickRate',
  },
  { re: /\bsv_netHttp2\b/, action: 'deny', why: 'HTTP/2 removed in Enhanced' },
  {
    re: /\bsv_protectServerEntities\b/,
    action: 'deny',
    why: 'no effect in Enhanced: use sv_entityLockdown',
  },
  {
    re: /\bonesync_(?:automaticResend|enableBeyond)\b/,
    action: 'deny',
    why: 'removed or no-op in Enhanced',
  },
  {
    re: /\+set\s+moo\b/,
    action: 'deny',
    why: 'devmode in Enhanced is `sv_devMode true`',
  },
  { re: /(?:^|\s)-cl2\b/, action: 'deny', why: '-cl2 is deprecated' },
  {
    re: /\badd_(?:filesystem|unsafe_worker|unsafe_child_process)_permission\b/,
    action: 'ask',
    why: "widens the sandbox: only for a fully trusted resource, with Faku's OK",
  },
]

export function check(
  path: string,
  text: string,
): { action: 'deny' | 'ask'; reason: string } | undefined {
  const p = path.split(String.fromCharCode(92)).join('/').toLowerCase()
  const rules = p.endsWith('.lua') ? LUA : p.endsWith('.cfg') ? CFG : []
  for (const r of rules) {
    const m = text.match(r.re)
    if (m)
      return {
        action: r.action,
        reason: `server-guard: \`${m[0].trim()}\`: ${r.why}. See AGENTS.md.`,
      }
  }
}

if (import.meta.main) {
  const input = JSON.parse((await Bun.stdin.text()) || '{}')
  const ti = input.tool_input ?? {}
  const text = [
    ti.content,
    ti.new_string,
    ...(ti.edits ?? []).map((e: { new_string?: string }) => e.new_string),
  ]
    .filter((s): s is string => typeof s === 'string')
    .join('\n')
  const hit = check(String(ti.file_path ?? ''), text)
  if (hit) {
    console.log(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: hit.action,
          permissionDecisionReason: hit.reason,
        },
      }),
    )
  }
}
