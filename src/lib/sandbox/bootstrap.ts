// Bootstrap de confianza que corre dentro de la VM antes del código del usuario. Es Lua escrito
// por nosotros; el snippet nunca lo ve ni lo modifica.
//
// Modelo: la VM nace SIN `io`, `os`, `package` (no se abren) y sin `require`. Se abren base,
// coroutine, table, string, utf8, math y debug; este script captura lo que necesita de ellas, deja
// `debug` en nil y construye un entorno nuevo con una lista blanca. El snippet corre con ese
// entorno (nunca con `_G` real), cargado solo como texto (`mode = "t"`: sin bytecode).
//
// Entrada (globals que se borran en la primera línea): `__emit` (JS, recibe una línea de stdout),
// `__code`, `__maxOut`, `__maxStr`, `__maxErr`.
// Salida: un string. "ok", "err\n<mensaje y traceback>" o "syntax\n<mensaje>".

export const BOOTSTRAP = String.raw`
local emit, code, maxOut, maxStr, maxErr = __emit, __code, __maxOut, __maxStr, __maxErr
__emit, __code, __maxOut, __maxStr, __maxErr = nil, nil, nil, nil, nil

-- Referencias privadas: el snippet puede reemplazar string.sub o table.concat en su propio
-- entorno; el bootstrap no depende de ellas (nada de métodos con ':').
local load, pcall, xpcall, tostring, type, select, error, pairs =
  load, pcall, xpcall, tostring, type, select, error, pairs
local rawget, setmetatable, getmetatable, _VERSION = rawget, setmetatable, getmetatable, _VERSION
local sub, rep, concat = string.sub, string.rep, table.concat
local gcount = collectgarbage
local traceback = debug.traceback
debug = nil

-- La tabla string también cuelga del metatable de los strings ("x"):dump(): se endurece en sitio.
string.dump = nil
string.rep = function(s, n, sep)
  s = tostring(s)
  sep = sep == nil and "" or tostring(sep)
  if type(n) ~= "number" then n = 0 end
  if n >= 1 and (#s + #sep) * n > maxStr then
    error("sandbox:memory", 0)
  end
  return rep(s, n, sep)
end

local function copy(t)
  local r = {}
  for k, v in pairs(t) do r[k] = v end
  return r
end

local env = {
  assert = assert, error = error, ipairs = ipairs, next = next, pairs = pairs,
  pcall = pcall, select = select, tonumber = tonumber, tostring = tostring,
  type = type, xpcall = xpcall, rawequal = rawequal, rawget = rawget,
  rawlen = rawlen, rawset = rawset, setmetatable = setmetatable,
  getmetatable = getmetatable, _VERSION = _VERSION,
  coroutine = copy(coroutine), table = copy(table), string = string,
  utf8 = copy(utf8), math = copy(math),
  -- Solo lectura de la pila: no da acceso a nada.
  debug = { traceback = traceback },
}
env._G = env

env.collectgarbage = function(opt)
  if opt == "count" then return gcount("count") end
  return 0
end

local outBytes = 0
env.print = function(...)
  local n = select("#", ...)
  local parts = {}
  for i = 1, n do parts[i] = tostring((select(i, ...))) end
  local line = concat(parts, "\t")
  outBytes = outBytes + #line + 1
  if outBytes > maxOut then error("sandbox:output", 0) end
  emit(line)
end

local function clip(s)
  if #s > maxErr then return sub(s, 1, maxErr) .. "..." end
  return s
end

local fn, cerr = load(code, "=snippet", "t", env)
if not fn then
  return "syntax\n" .. clip(tostring(cerr))
end

local ok, err = xpcall(fn, function(e)
  local t = type(e)
  local msg
  if t == "string" then msg = e
  elseif t == "number" then msg = tostring(e)
  else msg = "(error object is a " .. t .. " value)" end
  return traceback(clip(msg), 2)
end)

if ok then return "ok" end
return "err\n" .. clip(tostring(err))
`
