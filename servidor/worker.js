// Servidor de La oficina de Jager: llama a Gemini y a ChatGPT con tus claves.
// Se publica gratis en Cloudflare Workers (ver servidor/README.md).
// Las claves nunca llegan al navegador: se guardan como secretos del Worker.

export default {
  async fetch(req, env) {
    const cors = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
      'Access-Control-Allow-Headers': 'Content-Type, X-Oficina-Token',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    };
    const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

    // Clave de la oficina: evita que otra persona gaste tus créditos con tu servidor
    if (env.OFICINA_TOKEN && req.headers.get('X-Oficina-Token') !== env.OFICINA_TOKEN) return json({ error: 'Clave de la oficina incorrecta' }, 401);

    const path = new URL(req.url).pathname;
    if (path === '/salud') return json({ ok: true, gemini: !!env.GEMINI_API_KEY, openai: !!env.OPENAI_API_KEY });
    if (req.method !== 'POST') return json({ error: 'Usa POST' }, 405);

    const body = await req.json().catch(() => ({}));
    if (!body.prompt || typeof body.prompt !== 'string') return json({ error: 'Falta el texto de la petición (prompt)' }, 400);
    if (body.prompt.length > 30000) return json({ error: 'La petición es demasiado larga' }, 413);

    try {
      if (path === '/texto') {
        if (body.ia === 'gemini') return json({ texto: await gemini(env, body.prompt) });
        if (body.ia === 'chatgpt') return json({ texto: await chatgpt(env, body.prompt) });
        return json({ error: 'IA desconocida: usa gemini o chatgpt' }, 400);
      }
      if (path === '/imagen') return json(await geminiImage(env, body.prompt));
      return json({ error: 'Ruta desconocida' }, 404);
    } catch (e) {
      return json({ error: String(e.message || e) }, 502);
    }
  },
};

async function gemini(env, prompt) {
  if (!env.GEMINI_API_KEY) throw new Error('Falta la clave GEMINI_API_KEY en el servidor');
  const model = env.GEMINI_MODEL || 'gemini-2.5-flash';
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error('Gemini: ' + (d.error?.message || r.status));
  return (d.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim();
}

async function geminiImage(env, prompt) {
  if (!env.GEMINI_API_KEY) throw new Error('Falta la clave GEMINI_API_KEY en el servidor');
  const model = env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['IMAGE', 'TEXT'] } }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error('Gemini imagen: ' + (d.error?.message || r.status));
  const part = (d.candidates?.[0]?.content?.parts || []).find(p => p.inlineData || p.inline_data);
  const img = part?.inlineData || part?.inline_data;
  if (!img?.data) throw new Error('Gemini no ha devuelto ninguna imagen');
  return { mime: img.mimeType || img.mime_type || 'image/png', base64: img.data };
}

async function chatgpt(env, prompt) {
  if (!env.OPENAI_API_KEY) throw new Error('Falta la clave OPENAI_API_KEY en el servidor');
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: env.OPENAI_MODEL || 'gpt-4.1-mini', messages: [{ role: 'user', content: prompt }] }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error('ChatGPT: ' + (d.error?.message || r.status));
  return (d.choices?.[0]?.message?.content || '').trim();
}
