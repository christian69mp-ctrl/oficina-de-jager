# Servidor de la oficina (Claude, Gemini, ChatGPT y la voz de Nyx)

Con este servidor, en la versión del repositorio de la oficina:

- **Nyx** piensa con **Claude** todo lo que dice y lo dice con **su voz real de ElevenLabs**.
- **Lía** (tendencias) y **Gema** (miniaturas) piensan con **Gemini**, y Gema genera **miniaturas reales**.
- **Rui** (CTR), **Tito** (títulos) y **Max** (ideas) piensan con **ChatGPT**.
- El resto de trabajadores de Claude también usan Claude.

Tus claves se guardan como secretos del servidor y nunca llegan al navegador.

## Qué necesitas

1. Una cuenta gratuita de [Cloudflare](https://dash.cloudflare.com/sign-up).
2. Una clave de Claude: [platform.claude.com → API Keys](https://platform.claude.com/settings/keys) (necesita saldo).
3. Tu clave de ElevenLabs: **Profile → API Keys** en [elevenlabs.io](https://elevenlabs.io).
4. Opcional: clave de Gemini ([Google AI Studio](https://aistudio.google.com/apikey)) y de OpenAI ([platform.openai.com](https://platform.openai.com/api-keys)).
5. Node.js instalado en tu ordenador.

## Publicarlo (unos 5 minutos)

```bash
cd servidor
npx wrangler login
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put ELEVENLABS_API_KEY
npx wrangler secret put ELEVENLABS_VOICE_NYX   # pega: hVs5Yo3kZC1Otdy7udrk
npx wrangler secret put GEMINI_API_KEY         # opcional
npx wrangler secret put OPENAI_API_KEY         # opcional
npx wrangler secret put OFICINA_TOKEN          # una contraseña que te inventes
npx wrangler deploy
```

`wrangler deploy` te da una dirección como `https://oficina-jager.tu-cuenta.workers.dev`.

`hVs5Yo3kZC1Otdy7udrk` es el ID de la voz de Nyx que guardaste en ElevenLabs.

## Conectarlo a la oficina

1. Abre `index.html` del repositorio en Chrome.
2. En el panel, **Conexiones → Servidor**, pega la dirección y la contraseña (`OFICINA_TOKEN`) y pulsa **Guardar**.
3. Si sale «Conectado · Claude sí · Voz ElevenLabs», ya está. Abre el ventilador y háblale a Nyx.

La versión publicada en claude.ai no puede llamar a otros servidores (el navegador lo bloquea por seguridad): allí Nyx piensa con Claude igualmente, pero habla con la voz del dispositivo.

## Voz de Nyx

Solo habla Nyx; el resto del equipo trabaja en silencio. Con `ELEVENLABS_API_KEY` y `ELEVENLABS_VOICE_NYX`, todo lo que Nyx piensa lo dice con su voz real. Si no tienes ElevenLabs pero sí `OPENAI_API_KEY`, usa una voz de OpenAI con su personalidad.

Mientras habla, el holograma se llena de interferencias azules que siguen el volumen real de su voz.

## Hablarle con el micrófono (también desde el móvil)

Con el servidor conectado, al tocar el micro la oficina graba tu voz y el servidor la convierte en texto con ElevenLabs. Funciona en iPhone, Android y ordenador. Se para sola cuando dejas de hablar, o tocando otra vez el micro.

Necesita que tu clave de ElevenLabs tenga activado el permiso **«De voz a texto»** (además de «De texto a voz»).

## Compartir datos entre el móvil y el ordenador

El servidor puede guardar tus canales, vídeos, métricas y el manual de cada canal, para que el móvil y el ordenador vean lo mismo. Se guarda gratis en Cloudflare (KV).

```bash
cd servidor
npx wrangler kv namespace create DATOS   # si pregunta si lo añade a wrangler.toml, responde y
npx wrangler deploy
```

En **Conexiones → Servidor** saldrá «Sincronizado». Cada dispositivo envía sus cambios al momento y recoge los de los demás cada minuto y al volver a abrir la oficina.

## Entrega a Pixelido en Drive

Con esto, cuando apruebas un vídeo, Paco guarda el paquete (guion, títulos, miniaturas y acuerdo de la mesa) en la carpeta de tu Drive que compartes con Pixelido. No hace falta ninguna clave de Google: usa un pequeño script en tu propia cuenta.

1. Entra en [script.google.com](https://script.google.com) con tu cuenta de Google y pulsa **Nuevo proyecto**.
2. Borra lo que hay, pega todo el contenido de `servidor/drive-script.gs` y cambia `CAMBIA_ESTA_CLAVE` por una contraseña inventada.
3. Guarda (icono del disquete) y pulsa **Implementar → Nueva implementación**.
4. En el engranaje elige **Aplicación web**. En «Ejecutar como» deja **Yo** y en «Quién tiene acceso» elige **Cualquier usuario**.
5. Pulsa **Implementar**, autoriza el acceso a tu Drive y copia la **URL de la aplicación web** (acaba en `/exec`).
6. Guarda los dos secretos en el servidor y publícalo:

```bash
npx wrangler secret put DRIVE_SCRIPT_URL   # pega la URL que acaba en /exec
npx wrangler secret put DRIVE_CLAVE        # la misma contraseña del paso 2
npx wrangler deploy
```

7. En la oficina, **Conexiones → Entrega a Pixelido → Elegir carpeta** y elige la carpeta con «Pixelido» en el nombre.

## YouTube Studio (tus 5 canales)

Con esto la oficina lee de cada canal (solo lectura): suscriptores, vistas de los últimos 28 días, la lista de vídeos y las métricas de cada vídeo (vistas, retención a los 30 segundos, % medio visto, suscriptores ganados). Las impresiones y el CTR solo llegan si la API de YouTube los ofrece; si no, se copian de YouTube Studio.

1. En [console.cloud.google.com](https://console.cloud.google.com) elige el proyecto (puede ser el mismo de Gemini).
2. **APIs y servicios → Biblioteca**: activa **YouTube Data API v3** y **YouTube Analytics API**.
3. **Google Auth Platform** (pantalla de consentimiento): nombre «Oficina de Jager», público **Externo**. En **Público**, pulsa **Publicar aplicación** para que quede **En producción** (si se queda en «Prueba», el permiso caduca cada 7 días).
4. **Clientes → Crear cliente**: tipo **Aplicación web**. En **URI de redireccionamiento autorizados** añade `https://TU-SERVIDOR.workers.dev/youtube/callback`.
5. Copia el ID de cliente y el secreto y guárdalos en el servidor:

```bash
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler deploy
```

6. En la oficina, **Conexiones → YouTube Studio → Conectar** en cada canal. En Google elige la cuenta de ese canal (o su cuenta de marca). Como la app no está verificada por Google, saldrá un aviso: **Configuración avanzada → Ir a Oficina de Jager**. Es tu propia app y solo pide lectura.

## vidIQ (investigación en cada pedido)

En cada vídeo de un pedido, Lía hace 2 consultas a vidIQ (unos 10 créditos): palabras clave en España (volumen y competencia) y vídeos outlier en español sobre el tema. La mesa de análisis, Tito y Rui usan esos datos, y van en el paquete para Pixelido. Un pedido de 10 vídeos gasta unos 100 créditos (el plan gratuito da 150 al mes).

1. Crea una clave de API en vidiq.com/mcp (pestaña de un cliente como Cursor).
2. Guárdala en el servidor: `npx wrangler secret put VIDIQ_API_KEY`
3. En la oficina, **Conexiones → Servidor → Probar** debe decir «vidIQ sí».

## Búsqueda en internet para los guiones

Nora escribe cada guion con Claude y la búsqueda web de Anthropic: investiga el caso con fuentes fiables, marca [VERIFICAR] solo lo que no pudo confirmar y añade al final las fuentes consultadas con su enlace. Usa la misma clave ANTHROPIC_API_KEY (cada búsqueda tiene un coste pequeño aparte; MAX_BUSQUEDAS, por defecto 12, limita cuántas hace por guion). Si la búsqueda web no está activada en tu organización de la consola de Claude, actívala en Settings → Privacy/Features.

## Pedidos que siguen aunque cierres la oficina

Con el motor de pedidos (Cloudflare Workflows, incluido en el plan gratuito), cada vídeo de un pedido trabaja en el servidor: vidIQ, mesa de análisis, guion con búsqueda web, miniaturas, títulos, test de CTR y pedido para Pixelido. Puedes cerrar la oficina o apagar el ordenador; al volver, verás lo que lleven hecho y los vídeos listos para aprobar.

Añade al final de tu `wrangler.toml`:

```toml
[[workflows]]
name = "oficina-pedido"
binding = "PEDIDO"
class_name = "Pedido"
```

y publica con `npx wrangler deploy`. En la oficina, **Probar** activa los pedidos en el servidor automáticamente.

## Sala Cripto: BOTRADE (planta 2)

El repositorio `botrade` es privado, así que el servidor necesita una llave de GitHub **solo de lectura**:

1. En GitHub: *Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token*.
2. *Repository access*: **Only select repositories** → `christian69mp-ctrl/botrade`.
3. *Permissions → Repository permissions → Contents*: **Read-only** (nada más).
4. Guárdala en el servidor: `npx wrangler secret put GITHUB_TOKEN` y vuelve a publicar con `npx wrangler deploy`.

La oficina lee `paper/state.json`, el diario `paper/journal.jsonl` y el README. Los precios en directo salen de la API pública de Kraken (sin claves).

## Sala Ecommerce

Cuando tengas la tienda online, escribe su dirección en la tarjeta «Sala Ecommerce». Para que el servidor pueda comprobar si está en línea, añade su dominio a la variable `WEBS` (separados por comas) en `wrangler.toml`:

```toml
[vars]
WEBS = "laruletacaliente.com,tu-tienda.com"
```

## Coste aproximado

Cloudflare Workers es gratis hasta 100.000 peticiones al día. Lo que pagas son las IAs: un vídeo completo hace unas 15 peticiones de texto y 3 imágenes, y cada frase de Nyx es una petición corta a Claude más unos segundos de voz de ElevenLabs. El precio exacto depende de los modelos que elijas en `wrangler.toml`.
