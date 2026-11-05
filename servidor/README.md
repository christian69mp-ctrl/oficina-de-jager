# Servidor de Gemini y ChatGPT

Con este servidor, en la versión del repositorio de la oficina:

- **Lía** (tendencias) y **Gema** (miniaturas) piensan con **Gemini**, y Gema genera **miniaturas reales**.
- **Rui** (CTR), **Tito** (títulos) y **Max** (ideas) piensan con **ChatGPT**.
- Jager y los trabajadores de Claude siguen con Claude.

Tus claves se guardan como secretos del servidor y nunca llegan al navegador.

## Qué necesitas

1. Una cuenta gratuita de [Cloudflare](https://dash.cloudflare.com/sign-up).
2. Una clave de Gemini: [Google AI Studio → Get API key](https://aistudio.google.com/apikey).
3. Una clave de OpenAI: [platform.openai.com → API keys](https://platform.openai.com/api-keys) (necesita saldo).
4. Node.js instalado en tu ordenador.

## Publicarlo (unos 5 minutos)

```bash
cd servidor
npx wrangler login
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put OFICINA_TOKEN   # una contraseña que te inventes
npx wrangler deploy
```

`wrangler deploy` te da una dirección como `https://oficina-jager.tu-cuenta.workers.dev`.

## Conectarlo a la oficina

1. Abre `index.html` del repositorio en Chrome.
2. En el panel, **Conexiones → Servidor de Gemini y ChatGPT**, pega la dirección y la contraseña (`OFICINA_TOKEN`) y pulsa **Guardar**.
3. Si sale «Conectado», ya está.

La versión publicada en claude.ai no puede llamar a otros servidores (el navegador lo bloquea por seguridad), así que allí Claude sigue haciendo el trabajo de Gemini y ChatGPT.

## Coste aproximado

Cloudflare Workers es gratis hasta 100.000 peticiones al día. Lo que pagas son las IAs: un vídeo completo hace unas 15 peticiones de texto y 3 imágenes. El precio exacto depende del modelo que elijas en `wrangler.toml`.
