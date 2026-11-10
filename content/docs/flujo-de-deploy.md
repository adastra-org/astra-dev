---
title: Flujo de deploy
summary: Un push a main dispara el workflow, que construye el sitio, lo copia al slot inactivo (blue o green), lo verifica con una petición real y recién entonces cambia el symlink. Si algo falla, el slot anterior sigue en pie.
tags: [proyecto, deploy]
related: [como-funciona-astra-dev, glosario]
since: 0.1.0
---

Nadie despliega a mano. El único camino a producción es: rama, pull request, revisión y merge a `main`. El merge dispara `.github/workflows/deploy.yml` en el runner self-hosted de la organización `adastra-org`.

## Ejemplo mínimo

Para saber qué versión está en producción, pide el archivo de identidad del build:

```bash
curl -s https://development.adastrarp.com/ready.json
```

Devuelve algo como `{"ok":true,"sha":"...","version":"...","slot":"blue"}`. Si el `sha` coincide con el último commit de `main`, el deploy llegó.

## Los pasos

1. El runner instala dependencias con `bun install --frozen-lockfile`, corre `bun run check` y `bun run build`.
2. El script `astra-dev.sh deploy` limpia el slot inactivo, copia `dist/` y escribe `ready.json` con el sha.
3. Se prueba el slot inactivo a través del vhost real de nginx. Un 200 no alcanza, porque la SPA responde 200 a cualquier ruta: `ready.json` debe contener el sha. Si falla acá, el slot en vivo no se tocó.
4. Se cambia el symlink `current` de forma atómica, se valida la configuración con `nginx -t` y se recarga nginx.
5. Se prueba `current` buscando el sha. Si falla, el script vuelve a apuntar `current` al slot anterior.
6. El workflow prueba `ready.json` por el DNS público. Si falla, ejecuta `astra-dev.sh rollback`.

## Rollback

Volver atrás es cambiar el symlink al otro slot, no reconstruir. El slot anterior conserva su último build hasta que el siguiente deploy lo sobrescriba, así que el rollback es inmediato.

## Estructura en el servidor

| Elemento        | Valor                                                    |
| --------------- | -------------------------------------------------------- |
| Docroot         | `/var/www/development.adastrarp.com/{blue,green}`        |
| Puntero en vivo | `current` (raíz de nginx)                                |
| Slot inactivo   | `next`                                                   |
| Caché de assets | `/assets/*` inmutable; `index.html` y `ready.json` nunca |

## Qué no hacer

No edites archivos en el servidor ni copies un build a mano: el siguiente deploy los borra. Si algo falla en el workflow, arregla el workflow. Un hotfix aplicado en el servidor debe volver al repo el mismo día.

Más contexto en [Cómo funciona Astra Dev](/docs/como-funciona-astra-dev); los términos están en el [Glosario](/docs/glosario).
