# Shaders de vehículo

Qué shader debe usar cada parte de un vehículo. Relevante para el problema del tintado (ver [flags-y-cristal.md](flags-y-cristal.md)).

Fuente: <https://www.modding-forum.com/guide/14-materials-and-shaders/> (guía comunitaria escrita para ZModeler 3; no es una referencia oficial, y la documentación oficial de Cfx no tiene página de shaders). Revisada el 2026-11-12.

## Shaders de uso común

| Shader                                  | Para qué                                                                                                                                                             | Texturas                                                 |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `vehicle_mesh`                          | Metal o plástico opaco. Partes exteriores en el juego base; muchos modders lo usan también en interiores                                                             | Diffuse, Normal, Dirt (UV 2), Specular, Environment      |
| `vehicle_vehglass`                      | Cristal transparente, capa **exterior**. Admite transparencia                                                                                                        | Diffuse, Dirt (UV 2), Specular, Environment              |
| `vehicle_vehglass_inner`                | Igual, capa **interior**. Una ventana tiene dos capas                                                                                                                | Diffuse, Dirt (UV 2), Specular, Environment              |
| `vehicle_lightsemissive`                | Partes emisivas transparentes u opacas: faros y luces traseras                                                                                                       | Diffuse, Dirt (UV 2), Specular, Environment              |
| `vehicle_tire`                          | Ruedas. Toda la malla de la rueda debe usarlo                                                                                                                        | Diffuse, Normal, Dirt, Specular, Environment             |
| `vehicle_licenseplate`                  | Patentes; cambia textura y texto en el juego                                                                                                                         | Diffuse, Normal, Dirt, Environment                       |
| `vehicle_badges`                        | Insignias. También sirve de overlay sobre materiales sin normal map, como vehglass                                                                                   | Diffuse, Normal, Burnt, Specular, Environment            |
| `vehicle_interior`, `vehicle_interior2` | Partes interiores del juego base                                                                                                                                     | Diffuse, Normal o Burnt, Specular                        |
| `vehicle_paint1`                        | Pintura opaca que toma el color del juego. Un diffuse transparente superpone una textura                                                                             | Diffuse, Dirt (UV 2), Specular, Environment              |
| `vehicle_paint3`                        | Igual, con soporte de liveries: el primer diffuse es el blanco `vehicle_generic_smallspecmap`, el segundo es la livery; los nombres terminan en `sign_1` a `sign_25` | Diffuse 1, Diffuse 2 (UV 2), Dirt, Specular, Environment |
| `vehicle_shuts`                         | Pintura sobre una textura opaca de carrocería interior. Siempre con pintura                                                                                          | Diffuse, Normal, Burnt, Specular                         |

Notas de la guía:

- El canal de textura es UV 1 salvo que se indique otra cosa. Los mapas de suciedad usan UV 2. Los mapas de entorno son "Auto Sphere" y no llevan UV.
- Colores de pintura del juego: el nombre del material termina en `[PAINT:X]` (normalmente 1 para el primario y 2 para el secundario). Los juegos de colores salen de `carvariations.meta`.
- `vehicle_paint1`, `vehicle_paint3` y `vehicle_shuts` deben usarse siempre con pintura.

## Qué sugiere esto sobre las luces teñidas (hipótesis, sin probar)

El color y el tintado del juego se aplican por shader. Una luz que queda teñida probablemente usa un shader de pintura, un nombre de material `[PAINT:X]` o `vehicle_vehglass` en vez de `vehicle_lightsemissive`; o comparte UV con una zona pintada. Verificarlo es barato: listar el shader de cada geometría del `.yft` y marcar las geometrías de luces o lentes que no usen `vehicle_lightsemissive`. Falta un vehículo donde pase para confirmarlo.

## Fuentes revisadas y no usadas

- <https://gtamods.com/wiki/Material_List_(RW_Section)>: lista de materiales de RenderWare (GTA III, Vice City, San Andreas) dentro de un DFF. Otro motor y otro formato que el RAGE de GTA V; nada de esto aplica.
- <https://gtaforums.com/topic/899267-entities-and-materials/>: no se leyó. El sitio respondió con un desafío de Cloudflare (HTTP 403).
