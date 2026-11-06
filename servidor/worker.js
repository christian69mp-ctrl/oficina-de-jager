// Servidor de La oficina de Jager: llama a Gemini, a ChatGPT y a la voz realista (ElevenLabs u OpenAI) con tus claves.
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
    if (path === '/salud') return json({ ok: true, gemini: !!env.GEMINI_API_KEY, openai: !!env.OPENAI_API_KEY, voz: env.ELEVENLABS_API_KEY ? 'elevenlabs' : env.OPENAI_API_KEY ? 'openai' : null });
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
      if (path === '/voz') { if (body.prompt.length > 1500) return json({ error: 'Texto demasiado largo para la voz' }, 413); return await voz(env, body.prompt, body.quien, cors); }
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

// ---------- Voz realista ----------
// Cada personaje tiene su voz. Con ElevenLabs, pon el ID de cada voz en los secretos
// ELEVENLABS_VOICE_NYX, ELEVENLABS_VOICE_LIA, ELEVENLABS_VOICE_RUI y ELEVENLABS_VOICE_SAM
// (si falta alguna, usa la de Nyx). Sin ElevenLabs, usa las voces de OpenAI con su personalidad.
const OPENAI_VOCES = {
  nyx: { voice: 'shimmer', instructions: 'Eres Nyx, una hacker de película de unos 30 años que dirige una oficina. Habla en español de España con voz sensual, segura y un poco grave, chula y con descaro, como alguien invencible. Ritmo pausado y seguro, con sonrisa en la voz cuando bromea o coquetea con su jefe.' },
  lia: { voice: 'coral', instructions: 'Eres Lía, analista de tendencias. Español de España, entusiasta, enérgica y curiosa.' },
  rui: { voice: 'ash', instructions: 'Eres Rui, analista de CTR. Español de España, directo, práctico y algo bromista.' },
  sam: { voice: 'sage', instructions: 'Eres Sam, analista de retención y rentabilidad. Español de España, calmado, reflexivo y convincente.' },
};
async function voz(env, text, quien = 'nyx', cors) {
  quien = OPENAI_VOCES[quien] ? quien : 'nyx';
  let r;
  if (env.ELEVENLABS_API_KEY) {
    const id = env['ELEVENLABS_VOICE_' + quien.toUpperCase()] || env.ELEVENLABS_VOICE_NYX;
    if (!id) throw new Error('Falta ELEVENLABS_VOICE_NYX con el ID de la voz de Nyx');
    r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(id)}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: env.ELEVENLABS_MODEL || 'eleven_multilingual_v2', voice_settings: { stability: 0.4, similarity_boost: 0.8, style: 0.45, use_speaker_boost: true } }),
    });
  } else if (env.OPENAI_API_KEY) {
    const v = OPENAI_VOCES[quien];
    r = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts', voice: v.voice, input: text, instructions: v.instructions, response_format: 'mp3' }),
    });
  } else throw new Error('No hay clave de voz: añade ELEVENLABS_API_KEY u OPENAI_API_KEY');
  if (!r.ok) { const t = await r.text().catch(() => ''); throw new Error('Voz: ' + (t.slice(0, 200) || r.status)); }
  return new Response(r.body, { headers: { ...cors, 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' } });
}
