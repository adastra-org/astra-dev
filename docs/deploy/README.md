# Deploy — pasos manuales en el VPS

El deploy corre solo por `.github/workflows/deploy.yml` (push a `main`). Estos pasos se hacen **una vez**, antes del
primer merge a `main`. Hasta que estén hechos el workflow falla (por diseño, no hay deploy manual). Modelo y flujo:
[ARCHITECTURE.md](../../ARCHITECTURE.md#deploy).

Quién: Faku o Ether (Ether corre esto en el VPS). Claude no aplicó nada en el VPS ni usó SSH.

## Resumen

| #   | Paso                               | Dónde                     | Verificación                                |
| --- | ---------------------------------- | ------------------------- | ------------------------------------------- |
| 1   | DNS de `development.adastrarp.com` | Cloudflare                | `dig +short development.adastrarp.com`      |
| 2   | Runner accesible al repo           | GitHub, org `adastra-org` | Settings → Actions → Runners                |
| 3   | Docroot y env                      | VPS                       | `ls -la /var/www/development.adastrarp.com` |
| 4   | Certificado TLS                    | VPS                       | `sudo certbot certificates`                 |
| 5   | Vhost nginx                        | VPS                       | `sudo nginx -t`                             |
| 6   | Environment `development`          | GitHub, repo              | opcional, ver abajo                         |
| 7   | Primer deploy por el pipeline      | GitHub                    | `ready.json` con el sha                     |

## 1. DNS

En la zona `adastrarp.com` (Cloudflare), mismo modo de proxy que `adastrarp.com`:

| Tipo | Nombre        | Valor                     |
| ---- | ------------- | ------------------------- |
| A    | `development` | `167.114.2.210`           |
| AAAA | `development` | `2607:5300:205:200::716d` |

Los valores son los de las líneas `listen` de `adastra-site/nginx/adastrarp.conf`; confirmar con `dig adastrarp.com`.

## 2. Runner

El runner del org `adastra-org` (labels `self-hosted, linux, x64`) tiene que poder correr jobs de `astra-dev`. En
GitHub: org → Settings → Actions → Runner groups → el grupo del runner → permitir el repo `astra-dev` (si el grupo es
"Selected repositories"). El token usado por Claude no tiene `admin:org`, no pudo verificarlo.

## 3. Docroot y env

```bash
sudo install -d -o hermes -g hermes /var/www/development.adastrarp.com
install -d -m 700 ~/deploy/env
install -m 600 /dev/null ~/deploy/env/astra-dev.env
install -d /home/hermes/deploy
```

El script de deploy lo instala el propio workflow en `/home/hermes/deploy/astra-dev.sh`. `astra-dev.env` queda vacío
mientras el sitio sea estático.

El usuario del runner (`hermes`) ya necesita `sudo` sin password para `/usr/sbin/nginx -t` y
`/usr/bin/systemctl reload nginx`: `adastra-site` usa los mismos comandos. Verificar con
`sudo -n -l | grep -E 'nginx|systemctl'`.

## 4. Certificado

Primero ver si el cert de `adastrarp.com` ya cubre el subdominio (wildcard):

```bash
sudo certbot certificates
```

Si no lo cubre, emitir uno propio (DNS-01 con el token de Cloudflare de la zona, como el resto de los certs):

```bash
sudo certbot certonly --dns-cloudflare \
  --dns-cloudflare-credentials /etc/letsencrypt/cloudflare.ini \
  -d development.adastrarp.com
```

El vhost espera `/etc/letsencrypt/live/development.adastrarp.com/{fullchain,privkey}.pem`. Si el wildcard vive bajo otro
nombre (`live/adastrarp.com/`), cambiar las dos rutas `ssl_certificate*` en el vhost **en el repo** y no a mano.

## 5. Vhost nginx

Desde un clone del repo en el VPS (`/home/hermes/repos/astra-dev`, rama `main` o la del PR):

```bash
sudo install -m 644 deploy/nginx/development.adastrarp.com.conf /etc/nginx/sites-available/development.adastrarp.com
sudo ln -s /etc/nginx/sites-available/development.adastrarp.com /etc/nginx/sites-enabled/development.adastrarp.com
sudo /usr/sbin/nginx -t && sudo /usr/bin/systemctl reload nginx
```

Chequear antes que existan `/etc/nginx/snippets/security-headers.conf` y `wellknown.conf` (los usa `adastra-site`). Si
`nginx -t` se queja de `listen` duplicado, alinear las líneas `listen` con las del vhost vivo de `adastrarp.com`.

Antes del primer deploy `current` no existe, así que el sitio responde 404: es esperado.

## 6. Environment de GitHub (opcional)

El workflow usa `environment: development`. GitHub lo crea solo en el primer run, sin reglas. Si querés aprobación
manual o limitar a `main`, configurarlo en repo → Settings → Environments → `development`.

## 7. Primer deploy

1. Mergear (con review de Faku) el PR a `dev`, y luego `dev` → `main`.
2. El push a `main` dispara el workflow. Deben quedar verdes: _Install, check and build_, _Deploy to idle slot_,
   _Verify public domain_.
3. Verificar a mano:

```bash
curl -fsS https://development.adastrarp.com/ready.json
```

Debe devolver `{"ok":true,"app":"astra-dev","sha":"<sha del merge>",...}`.

## Operación

```bash
/home/hermes/deploy/astra-dev.sh status     # slot vivo y build de cada slot
/home/hermes/deploy/astra-dev.sh rollback   # volver al slot anterior (symlink, sin rebuild)
```

Un hotfix a mano en el VPS se commitea al repo el mismo día; si no, el próximo deploy lo borra.

## Branch protection

No está aplicada: los repos privados del plan actual de GitHub no la soportan (HTTP 403 "Upgrade to GitHub Pro or make
this repository public", igual en `adastra-site`). Alternativas: subir el plan del org, o hacer público el repo. Mientras
tanto, el review de Faku antes de mergear es por convención. Configuración a aplicar cuando se pueda (en `main` y
`dev`): PR obligatorio, checks requeridos (jobs `check` y `format`), sin pushes directos, sin force push.
