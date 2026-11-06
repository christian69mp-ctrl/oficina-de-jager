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

## Coste aproximado

Cloudflare Workers es gratis hasta 100.000 peticiones al día. Lo que pagas son las IAs: un vídeo completo hace unas 15 peticiones de texto y 3 imágenes, y cada frase de Nyx es una petición corta a Claude más unos segundos de voz de ElevenLabs. El precio exacto depende de los modelos que elijas en `wrangler.toml`.
