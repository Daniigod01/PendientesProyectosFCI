# Pendientes Tecnología — Rogerson

Tablero de pendientes de CRM/tecnología: vista Kanban, informes exportables,
y ahora también **ingesta automática desde Trello y Gmail**.

Viene precargado con los 11 pendientes de CRM confirmados (Ruta Mujer y
Nos mueve la ruta de oportunidades), ordenados por prioridad y fecha límite.

## Qué hace cada integración

- **Trello** (mesa de ayuda-FCI): **Por hacer se queda solo en Trello, no
  pasa a la app.** Cuando mueves una tarjeta a **En proceso-Roger**, aparece
  como "En curso"; cuando la mueves a **Hecho-Roger**, aparece como "Hecho".
  Las tarjetas de Javier se ignoran.
- **Gmail**: crea una carpeta/etiqueta en Gmail llamada
  **`PENDIENTES-PROYECTOS`**. Todo correo que muevas (o etiquetes) ahí se
  crea como pendiente en "Por hacer" — si el asunto o el cuerpo menciona
  alguno de tus proyectos (Ruta Mujer, Nos mueve la ruta, PXR, etc.) se lo
  asigna automático; si no lo detecta, igual se crea el pendiente pero con el
  proyecto en blanco para que tú lo completes. El resto de tu correo (fuera
  de esa carpeta) no se toca.
- Puedes **eliminar cualquier pendiente** (manual, de Trello o de Gmail) con
  el ícono de basurero en su tarjeta, sin importar de dónde haya llegado.

## Paso 1 — Base de datos compartida (Vercel Redis / Upstash)

Antes esto guardaba todo en el navegador (`localStorage`). Ahora, para que
Trello y Gmail puedan escribir pendientes sin que tú abras la app, necesita
una base de datos compartida:

1. En tu proyecto de Vercel, ve a **Storage → Create Database → Redis**
   (lo provee Upstash, aparece dentro del marketplace de Vercel).
2. Conéctala a este proyecto. Vercel agrega automáticamente las variables
   `KV_REST_API_URL` y `KV_REST_API_TOKEN` — no tienes que copiarlas a mano.

Si no configuras esto, la app sigue funcionando igual que antes con
`localStorage` (Trello/Gmail simplemente no tendrán dónde escribir).

## Paso 2 — Conectar Trello

1. Genera tu API Key y Token en <https://trello.com/power-ups/admin> (o
   más simple: <https://trello.com/app-key>, y desde ahí generas el Token).
2. Averigua el ID de tus listas **En proceso-Roger** y **Hecho-Roger**
   (la lista "Por hacer" no la necesitas — a propósito no sincroniza).
   Con el ID del tablero (se ve en la URL, o pídelo así):
   ```bash
   curl "https://api.trello.com/1/boards/BOARD_ID/lists?key=TU_KEY&token=TU_TOKEN"
   ```
   Copia el `id` de esas dos listas.
3. En Vercel → tu proyecto → **Settings → Environment Variables**, agrega:
   - `TRELLO_LIST_EN_PROCESO_ROGER_ID`
   - `TRELLO_LIST_HECHO_ROGER_ID`
4. Ya con el proyecto desplegado (necesitas la URL pública), registra el
   webhook una sola vez:
   ```bash
   curl -X POST "https://api.trello.com/1/webhooks/?key=TU_KEY&token=TU_TOKEN" \
     -d "description=Pendientes Tecnologia" \
     -d "callbackURL=https://TU-APP.vercel.app/api/trello-webhook" \
     -d "idModel=BOARD_ID"
   ```

## Paso 3 — Conectar Gmail

Primero, en tu Gmail normal (sin código): crea una etiqueta/carpeta llamada
**`PENDIENTES-PROYECTOS`** (Configuración → Etiquetas → Crear nueva). Puedes
moverle correos a mano, o crear un filtro que los mueva solo (por ejemplo,
por remitente). Solo lo que esté ahí se convierte en pendiente.

Luego, para que la app pueda leerla, requiere credenciales de Google Cloud
(una sola vez):

1. Ve a <https://console.cloud.google.com/> → crea un proyecto.
2. Activa la **Gmail API** (Library → busca "Gmail API" → Enable).
3. Configura la pantalla de consentimiento OAuth (tipo "Externo" está bien;
   no necesitas publicarla, solo agregarte a ti mismo como usuario de prueba).
4. Crea credenciales → **OAuth client ID** → tipo "Aplicación de escritorio".
   Copia el `Client ID` y `Client Secret`.
5. En tu computador (no en Vercel), corre el script incluido para obtener
   el refresh token:
   ```bash
   npm install googleapis --no-save
   GMAIL_CLIENT_ID=xxx GMAIL_CLIENT_SECRET=yyy node scripts/gmail-auth.mjs
   ```
   Abre la URL que imprime, inicia sesión con tu correo de la fundación,
   acepta el permiso de solo lectura de Gmail, y el script te imprime el
   `GMAIL_REFRESH_TOKEN`.
6. En Vercel, agrega las variables de entorno:
   - `GMAIL_CLIENT_ID`
   - `GMAIL_CLIENT_SECRET`
   - `GMAIL_REFRESH_TOKEN`

### ¿Cómo se dispara la sincronización?

- Hay un botón **"sincronizar_correo"** en la pestaña de Informes — lo puedes
  usar cuando quieras, sin esperar nada.
- También dejé un **cron job de Vercel** (`vercel.json`) corriendo **una vez
  al día a las 9am**. En el plan gratuito (Hobby), Vercel no deja programar
  crons más seguido que eso — si lo pones más frecuente, el deploy falla con
  un error de límite. Si quieres que revise más seguido sin pasarte a plan
  Pro, registra la URL
  `https://TU-APP.vercel.app/api/gmail-sync?secret=TU_SYNC_SECRET` (definiendo
  `SYNC_SECRET` como variable de entorno) en un cron externo gratuito como
  <https://cron-job.org>, con la frecuencia que quieras.

## Desplegar en Vercel

```bash
npm install -g vercel   # una sola vez
vercel                  # despliega y te da una URL de prueba
vercel --prod           # la deja como definitiva
```

O impórtalo desde GitHub en vercel.com → Add New → Project (detecta Vite
automáticamente).

## Estructura

- `src/App.jsx` — la app (tablero, formularios, informes, sonido).
- `shared/seedData.js` — los 11 pendientes precargados (úsalo también el backend).
- `shared/proyectos.js` — la lista de proyectos y sus alias, para que Gmail
  reconozca de cuál se trata aunque el correo no diga el nombre completo.
- `src/storage.js` — capa de guardado: usa el backend si existe, si no cae
  a `localStorage`.
- `api/board.js` — lee/escribe el tablero en la base de datos.
- `api/trello-webhook.js` — recibe eventos de Trello.
- `api/gmail-sync.js` — revisa Gmail y crea pendientes.
- `scripts/gmail-auth.mjs` — script de un solo uso para obtener el refresh token de Gmail.
