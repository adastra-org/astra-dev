Índices de `doorIndex` que usamos en los resources de Astra:

- `0`: puerta delantera izquierda. `1`: delantera derecha.
- `2`: trasera izquierda. `3`: trasera derecha.
- `4`: capó. `5`: maletero.
- `6` y `7`: portones o puertas adicionales, según el modelo.

Antes de abrir una puerta comprueba que el vehículo existe (`DoesEntityExist`). Para cerrarla usa `SetVehicleDoorShut` con el mismo índice.
