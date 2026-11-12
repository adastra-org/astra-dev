Devuelve un `vector3`. En Lua los vectores se operan directamente: `#(a - b)` es la distancia entre dos puntos y `a.x`, `a.y`, `a.z` son sus componentes.

Para saber si algo está cerca, compara la distancia con un valor fijo; no hace falta calcular raíces a mano.

```lua
local coords = GetEntityCoords(PlayerPedId())
local distancia = #(coords - vec3(215.0, -810.0, 30.7))

if distancia < 3.0 then
  -- el jugador está a menos de 3 metros del punto
end
```
