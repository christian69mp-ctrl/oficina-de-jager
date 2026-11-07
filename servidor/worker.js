// Servidor de La oficina de Jager: llama a Claude, a Gemini, a ChatGPT y a la voz de Nyx (ElevenLabs u OpenAI) con tus claves.
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

    // Google vuelve aquí al conectar un canal de YouTube (va protegido con una firma, no con la clave)
    if (new URL(req.url).pathname === '/youtube/callback') return ytCallback(env, req);
    // Clave de la oficina: evita que otra persona gaste tus créditos con tu servidor
    if (env.OFICINA_TOKEN && req.headers.get('X-Oficina-Token') !== env.OFICINA_TOKEN) return json({ error: 'Clave de la oficina incorrecta' }, 401);

    const path = new URL(req.url).pathname;
    if (path === '/salud') return json({ ok: true, claude: !!env.ANTHROPIC_API_KEY, gemini: !!env.GEMINI_API_KEY, openai: !!env.OPENAI_API_KEY, voz: env.ELEVENLABS_API_KEY ? 'elevenlabs' : env.OPENAI_API_KEY ? 'openai' : null, oir: !!env.ELEVENLABS_API_KEY, datos: !!env.DATOS, drive: !!env.DRIVE_SCRIPT_URL, youtube: !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET), vidiq: !!env.VIDIQ_API_KEY, web: !!env.ANTHROPIC_API_KEY });
    // Datos compartidos entre el móvil y el ordenador (canales, vídeos, métricas y manual)
    if (path === '/datos') {
      if (!env.DATOS) return json({ error: 'Falta el almacén DATOS en el servidor (ver servidor/README.md)' }, 400);
      const guardado = JSON.parse((await env.DATOS.get('estado')) || '{}');
      if (req.method === 'GET') return json(guardado);
      const entra = await req.json().catch(() => null);
      if (!entra || typeof entra !== 'object') return json({ error: 'Datos no válidos' }, 400);
      const unido = { ...mezclar(guardado, entra), updatedAt: Date.now() };
      const txt = JSON.stringify(unido);
      if (txt.length > 20_000_000) return json({ error: 'Hay demasiados datos guardados' }, 413);
      await env.DATOS.put('estado', txt);
      return json(unido);
    }
    if (req.method !== 'POST') return json({ error: 'Usa POST' }, 405);
    // Entrega a Pixelido: el script de Google (Apps Script) de tu cuenta guarda los paquetes en tu Drive
    if (path === '/drive') {
      if (!env.DRIVE_SCRIPT_URL) return json({ error: 'Falta DRIVE_SCRIPT_URL en el servidor' }, 400);
      const entra = await req.json().catch(() => ({}));
      const r = await fetch(env.DRIVE_SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ ...entra, clave: env.DRIVE_CLAVE || '' }), redirect: 'follow' });
      const d = await r.json().catch(() => null);
      if (!d) return json({ error: 'El script de Drive no responde bien: revisa que esté implementado con acceso «Cualquier usuario»' }, 502);
      return json(d, d.error ? 502 : 200);
    }

    // vidIQ
    if (path === '/vidiq') { try { return json(await vidiq(env, await req.json().catch(() => ({})))); } catch (e) { return json({ error: String(e.message || e) }, 502); } }
    // YouTube Studio
    if (path.startsWith('/youtube/')) {
      const b = await req.json().catch(() => ({}));
      const fn = { '/youtube/enlace': () => ytEnlace(env, req, b), '/youtube/estado': () => ytEstado(env), '/youtube/canal': () => ytCanal(env, b), '/youtube/videos': () => ytVideos(env, b), '/youtube/metricas': () => ytMetricas(env, b) }[path];
      if (!fn) return json({ error: 'Ruta desconocida' }, 404);
      try { return json(await fn()); } catch (e) { return json({ error: String(e.message || e) }, 502); }
    }
    if (path === '/oir') { try { return json(await oir(env, req)); } catch (e) { return json({ error: String(e.message || e) }, 502); } }
    const body = await req.json().catch(() => ({}));
    if (!body.prompt || typeof body.prompt !== 'string') return json({ error: 'Falta el texto de la petición (prompt)' }, 400);
    if (body.prompt.length > 150000) return json({ error: 'La petición es demasiado larga' }, 413);

    try {
      if (path === '/texto') {
        if (body.ia === 'claude') return json({ texto: await claude(env, body.prompt, !!body.rapido, !!body.buscar) });
        if (body.ia === 'gemini') return json({ texto: await gemini(env, body.prompt) });
        if (body.ia === 'chatgpt') return json({ texto: await chatgpt(env, body.prompt) });
        return json({ error: 'IA desconocida: usa claude, gemini o chatgpt' }, 400);
      }
      if (path === '/imagen') return json(await geminiImage(env, body.prompt));
      if (path === '/voz') { if (body.prompt.length > 1500) return json({ error: 'Texto demasiado largo para la voz' }, 413); return await voz(env, body.prompt, cors); }
      return json({ error: 'Ruta desconocida' }, 404);
    } catch (e) {
      return json({ error: String(e.message || e) }, 502);
    }
  },
};

// Claude piensa lo que dice Nyx y hace el trabajo de los trabajadores de Claude.
// rapido = respuestas cortas de Nyx: menos esfuerzo para que conteste antes.
// buscar = Claude puede investigar en internet (búsqueda web de Anthropic) antes de responder.
async function claude(env, prompt, rapido, buscar) {
  if (!env.ANTHROPIC_API_KEY) throw new Error('Falta la clave ANTHROPIC_API_KEY en el servidor');
  const messages = [{ role: 'user', content: prompt }];
  const fuentes = new Map();
  for (let vuelta = 0; vuelta < 6; vuelta++) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2026-10-21' },
      body: JSON.stringify({
        model: env.CLAUDE_MODEL || 'claude-opus-5-5',
        max_tokens: rapido ? 2000 : 32000,
        ...(rapido ? { output_config: { effort: 'low' } } : {}),
        ...(buscar ? { tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: +(env.MAX_BUSQUEDAS || 12) }] } : {}),
        messages,
      }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error('Claude: ' + (d.error?.message || r.status));
    if (d.stop_reason === 'refusal') throw new Error('Claude ha preferido no responder a eso');
    for (const b of d.content || []) {
      if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) for (const x of b.content) if (x.url) fuentes.set(x.url, x.title || x.url);
      for (const c of b.citations || []) if (c.url) fuentes.set(c.url, c.title || c.url);
    }
    // La búsqueda se ha pausado a mitad: se reanuda con lo que ya lleva
    if (d.stop_reason === 'pause_turn') { messages.push({ role: 'assistant', content: d.content }); continue; }
    const texto = (d.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
    if (buscar && fuentes.size && !/FUENTES CONSULTADAS EN INTERNET/.test(texto)) return texto + '\n\nFUENTES CONSULTADAS EN INTERNET\n' + [...fuentes].slice(0, 40).map(([u, ti]) => `- ${ti}: ${u}`).join('\n');
    return texto;
  }
  throw new Error('Claude no terminó la investigación');
}

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

// ---------- Voz de Nyx ----------
// Solo Nyx habla. Con ElevenLabs usa la voz del secreto ELEVENLABS_VOICE_NYX;
// sin ElevenLabs, una voz de OpenAI con su personalidad.
const NYX_OPENAI = { voice: 'shimmer', instructions: 'Eres Nyx, una hacker de película de unos 30 años que dirige una oficina. Habla en español de España con voz sensual, segura y un poco grave, chula y con descaro, como alguien invencible. Ritmo pausado y seguro, con sonrisa en la voz cuando bromea o coquetea con su jefe.' };
async function voz(env, text, cors) {
  let r;
  if (env.ELEVENLABS_API_KEY) {
    const id = env.ELEVENLABS_VOICE_NYX;
    if (!id) throw new Error('Falta ELEVENLABS_VOICE_NYX con el ID de la voz de Nyx');
    r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(id)}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: env.ELEVENLABS_MODEL || 'eleven_multilingual_v2', voice_settings: { stability: 0.4, similarity_boost: 0.8, style: 0.45, use_speaker_boost: true } }),
    });
  } else if (env.OPENAI_API_KEY) {
    r = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts', voice: NYX_OPENAI.voice, input: text, instructions: NYX_OPENAI.instructions, response_format: 'mp3' }),
    });
  } else throw new Error('No hay clave de voz: añade ELEVENLABS_API_KEY u OPENAI_API_KEY');
  if (!r.ok) { const t = await r.text().catch(() => ''); throw new Error('Voz: ' + (t.slice(0, 200) || r.status)); }
  return new Response(r.body, { headers: { ...cors, 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' } });
}

// ---------- Oído de Nyx: tu voz a texto (ElevenLabs) ----------
// Necesita que la clave de ElevenLabs tenga activado el permiso «De voz a texto».
async function oir(env, req) {
  if (!env.ELEVENLABS_API_KEY) throw new Error('Falta ELEVENLABS_API_KEY en el servidor');
  const audio = await req.arrayBuffer();
  if (!audio.byteLength) throw new Error('No ha llegado audio');
  if (audio.byteLength > 10_000_000) throw new Error('El audio es demasiado largo');
  const type = (req.headers.get('Content-Type') || 'audio/webm').split(';')[0];
  const ext = type.includes('mp4') ? 'mp4' : type.includes('ogg') ? 'ogg' : type.includes('wav') ? 'wav' : 'webm';
  const send = conClaves => {
    const fd = new FormData();
    fd.append('model_id', env.ELEVENLABS_STT_MODEL || 'scribe_v1');
    fd.append('language_code', 'es');
    // Palabras que debe reconocer bien: su nombre y el saludo del jefe
    if (conClaves) for (const k of ['Nyx', 'Qué pasa Nyx', 'Jager', 'Pixelido']) fd.append('keyterms', k);
    fd.append('file', new Blob([audio], { type }), 'voz.' + ext);
    return fetch('https://api.elevenlabs.io/v1/speech-to-text', { method: 'POST', headers: { 'xi-api-key': env.ELEVENLABS_API_KEY }, body: fd });
  };
  let r = await send(true);
  if (r.status === 400 || r.status === 422) r = await send(false); // si el modelo no admite palabras clave, sin ellas
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = typeof d.detail === 'string' ? d.detail : d.detail?.message || d.detail?.status || String(r.status);
    if (r.status === 401 || r.status === 403 || /permission|missing_permissions/i.test(msg)) throw new Error('la clave de ElevenLabs no tiene el permiso «De voz a texto»: actívalo en ElevenLabs');
    throw new Error('ElevenLabs: ' + msg);
  }
  return { texto: (d.text || '').trim() };
}

// ---------- Datos compartidos ----------
// De cada canal y cada vídeo se queda la versión más reciente (campo upd), así no se pisan los cambios.
function mezclar(a = {}, b = {}) {
  const t = x => x?.upd || x?.createdAt || 0;
  const porId = (xs, ys) => { const m = new Map(); for (const x of xs || []) if (x?.id) m.set(x.id, x); for (const y of ys || []) if (y?.id) m.set(y.id, !m.has(y.id) || t(y) >= t(m.get(y.id)) ? y : m.get(y.id)); return [...m.values()]; };
  const bd = (b.driveUpd || 0) >= (a.driveUpd || 0);
  return { channels: porId(a.channels, b.channels), videos: porId(a.videos, b.videos).filter(v => !v.demo).sort((x, y) => (x.createdAt || 0) - (y.createdAt || 0)), drive: (bd ? b.drive : a.drive) || null, driveUpd: Math.max(a.driveUpd || 0, b.driveUpd || 0) };
}

// ---------- YouTube Studio: tus canales conectados con permiso de solo lectura ----------
// Necesita GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET (ver README) y el almacén DATOS para guardar el permiso de cada canal.
const YT_SCOPES = 'https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly';
const enc = t => new TextEncoder().encode(t);
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)));
async function firmar(env, txt) {
  const k = await crypto.subtle.importKey('raw', enc((env.OFICINA_TOKEN || '') + '|youtube|' + (env.GOOGLE_CLIENT_SECRET || '')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64u(await crypto.subtle.sign('HMAC', k, enc(txt)));
}
const ytRedirect = req => new URL(req.url).origin + '/youtube/callback';
function ytListo(env) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) throw new Error('Faltan GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en el servidor');
  if (!env.DATOS) throw new Error('Falta el almacén DATOS en el servidor');
}
// 1. La oficina pide el enlace de Google para conectar un canal
async function ytEnlace(env, req, b) {
  ytListo(env);
  if (!b.canal) throw new Error('Falta el canal');
  const payload = b64u(enc(JSON.stringify({ canal: String(b.canal), nombre: String(b.nombre || ''), exp: Date.now() + 20 * 60e3 })));
  const state = payload + '.' + await firmar(env, payload);
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  u.search = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, redirect_uri: ytRedirect(req), response_type: 'code', scope: YT_SCOPES, access_type: 'offline', prompt: 'consent select_account', state }).toString();
  return { url: u.toString() };
}
// 2. Google vuelve aquí: se guarda el permiso del canal elegido
async function ytCallback(env, req) {
  const page = (titulo, texto, ok) => new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${titulo}</title><body style="font-family:system-ui,sans-serif;background:#05070d;color:#eef2ff;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px"><div style="max-width:440px;text-align:center"><h1 style="color:${ok ? '#4ade80' : '#f87171'}">${titulo}</h1><p style="line-height:1.5">${texto}</p><p style="color:#9aa6c4">Ya puedes cerrar esta pestaña y volver a la oficina.</p></div></body>`, { status: ok ? 200 : 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  try {
    ytListo(env);
    const q = new URL(req.url).searchParams;
    if (q.get('error')) return page('No se ha conectado', 'Has cancelado el permiso o Google lo ha rechazado: ' + esc(q.get('error')), false);
    const [payload, sig] = String(q.get('state') || '').split('.');
    if (!payload || sig !== await firmar(env, payload)) return page('Enlace no válido', 'Vuelve a pulsar «Conectar» en la oficina.', false);
    const st = JSON.parse(unb64u(payload));
    if (Date.now() > st.exp) return page('Enlace caducado', 'Han pasado más de 20 minutos. Vuelve a pulsar «Conectar» en la oficina.', false);
    const tr = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code: q.get('code') || '', client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: ytRedirect(req), grant_type: 'authorization_code' }) });
    const tk = await tr.json();
    if (!tr.ok || !tk.refresh_token) return page('No se ha conectado', 'Google no ha dado el permiso: ' + esc(tk.error_description || tk.error || 'falta el permiso permanente'), false);
    const ch = await ytApi(tk.access_token, 'https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails,statistics&mine=true');
    const c = ch.items?.[0];
    if (!c) return page('Sin canal', 'Esa cuenta no tiene canal de YouTube. Vuelve a intentarlo y elige la cuenta del canal.', false);
    const rec = { refresh: tk.refresh_token, access: tk.access_token, exp: Date.now() + (tk.expires_in - 60) * 1000, channelId: c.id, title: c.snippet.title, uploads: c.contentDetails.relatedPlaylists.uploads, at: Date.now() };
    await env.DATOS.put('yt:' + st.canal, JSON.stringify(rec));
    return page('Canal conectado', `«${esc(c.snippet.title)}» está conectado a la ficha «${esc(st.nombre || st.canal)}» de la oficina.${st.nombre && st.nombre.toLowerCase() !== c.snippet.title.toLowerCase() ? '<br><br><b>Ojo:</b> los nombres no coinciden. Si te has equivocado de cuenta, vuelve a conectar y elige el canal correcto.' : ''}`, true);
  } catch (e) { return page('Error', esc(e.message || e), false); }
}
async function ytApi(token, url) {
  const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('YouTube: ' + (d.error?.message || r.status));
  return d;
}
async function ytToken(env, canal) {
  ytListo(env);
  const rec = JSON.parse((await env.DATOS.get('yt:' + canal)) || 'null');
  if (!rec) throw new Error('Este canal no está conectado a YouTube');
  if (rec.access && Date.now() < rec.exp) return rec;
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ refresh_token: rec.refresh, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, grant_type: 'refresh_token' }) });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error === 'invalid_grant' ? 'El permiso de YouTube ha caducado o se retiró: vuelve a conectar el canal' : 'Google: ' + (d.error_description || d.error));
  rec.access = d.access_token; rec.exp = Date.now() + (d.expires_in - 60) * 1000;
  await env.DATOS.put('yt:' + canal, JSON.stringify(rec));
  return rec;
}
async function ytEstado(env) {
  if (!env.DATOS) return { canales: {} };
  const l = await env.DATOS.list({ prefix: 'yt:' }); const out = {};
  for (const k of l.keys) { const r = JSON.parse((await env.DATOS.get(k.name)) || '{}'); out[k.name.slice(3)] = { title: r.title, channelId: r.channelId, at: r.at }; }
  return { canales: out };
}
const isoMin = d => { const m = String(d || '').match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/); if (!m) return 0; return ((+m[1] || 0) * 1440) + ((+m[2] || 0) * 60) + (+m[3] || 0) + (+m[4] || 0) / 60; };
const hoy = () => new Date().toISOString().slice(0, 10);
// Resumen del canal: totales y últimos 28 días
async function ytCanal(env, b) {
  const rec = await ytToken(env, b.canal);
  const ch = await ytApi(rec.access, `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${rec.channelId}`);
  const s = ch.items?.[0]?.statistics || {};
  const desde = new Date(Date.now() - 28 * 864e5).toISOString().slice(0, 10);
  let ult = null;
  try {
    const a = await ytApi(rec.access, `https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==MINE&startDate=${desde}&endDate=${hoy()}&metrics=views,estimatedMinutesWatched,averageViewPercentage,subscribersGained,subscribersLost`);
    const r = a.rows?.[0] || []; ult = { vistas: r[0] || 0, minutos: r[1] || 0, pctMedio: r[2] || 0, subsGanados: r[3] || 0, subsPerdidos: r[4] || 0 };
  } catch (e) { ult = { error: e.message }; }
  return { title: rec.title, suscriptores: +s.subscriberCount || 0, vistas: +s.viewCount || 0, videos: +s.videoCount || 0, ult28: ult };
}
// Últimos vídeos subidos (los de 3 minutos o menos se marcan como shorts)
async function ytVideos(env, b) {
  const rec = await ytToken(env, b.canal);
  const pl = await ytApi(rec.access, `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&maxResults=${Math.min(50, b.max || 30)}&playlistId=${rec.uploads}`);
  const ids = (pl.items || []).map(i => i.contentDetails.videoId);
  if (!ids.length) return { videos: [] };
  const vs = await ytApi(rec.access, `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics,status&id=${ids.join(',')}`);
  return { videos: (vs.items || []).map(v => ({ ytId: v.id, title: v.snippet.title, publishedAt: v.snippet.publishedAt, duracion: +isoMin(v.contentDetails.duration).toFixed(1), vistas: +v.statistics.viewCount || 0, likes: +v.statistics.likeCount || 0, comentarios: +v.statistics.commentCount || 0, privacidad: v.status?.privacyStatus, short: isoMin(v.contentDetails.duration) <= 3, miniatura: v.snippet.thumbnails?.medium?.url || '' })) };
}
// Métricas de un vídeo desde YouTube Analytics
async function ytMetricas(env, b) {
  const rec = await ytToken(env, b.canal);
  const v = (await ytApi(rec.access, `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${encodeURIComponent(b.ytId)}`)).items?.[0];
  if (!v) throw new Error('No encuentro ese vídeo en el canal');
  const desde = v.snippet.publishedAt.slice(0, 10), dur = isoMin(v.contentDetails.duration);
  const base = `https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==MINE&startDate=${desde}&endDate=${hoy()}&filters=video==${encodeURIComponent(b.ytId)}`;
  const a = await ytApi(rec.access, base + '&metrics=views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained');
  const r = a.rows?.[0] || [];
  const out = { vistas: r[0] ?? +v.statistics.viewCount ?? 0, minutos: r[1] ?? 0, duracionMedia: r[2] ?? 0, pct: r[3] != null ? +(+r[3]).toFixed(1) : null, subs: r[4] ?? 0, duracion: +dur.toFixed(1), desde, hasta: hoy() };
  // Retención a los 30 segundos (curva de audiencia)
  try {
    const ret = await ytApi(rec.access, base + '&dimensions=elapsedVideoTimeRatio&metrics=audienceWatchRatio&sort=elapsedVideoTimeRatio');
    const objetivo = dur > 0 ? Math.min(1, 0.5 / dur) : 0;
    let mejor = null; for (const row of ret.rows || []) if (!mejor || Math.abs(row[0] - objetivo) < Math.abs(mejor[0] - objetivo)) mejor = row;
    if (mejor) out.r30 = Math.min(100, +(mejor[1] * 100).toFixed(1));
  } catch (e) { out.r30Error = e.message; }
  // Impresiones y CTR: solo si la API de YouTube los ofrece; si no, se copian de Studio
  try {
    const im = await ytApi(rec.access, base + '&metrics=videoThumbnailImpressions,videoThumbnailImpressionsClickRate');
    const ri = im.rows?.[0]; if (ri) { out.impresiones = ri[0]; out.ctr = +(ri[1] < 1 ? ri[1] * 100 : ri[1]).toFixed(2); }
  } catch (e) { out.ctrError = 'La API de YouTube no da impresiones ni CTR para este vídeo'; }
  return out;
}

// ---------- vidIQ (servidor MCP de vidIQ con tu clave de API, solo lectura) ----------
// La oficina solo puede usar estas herramientas (para no gastar créditos en otras cosas)
const VIDIQ_TOOLS = ['vidiq_keyword_research', 'vidiq_outliers', 'vidiq_trending_videos', 'vidiq_balance'];
async function vidiq(env, b) {
  if (!env.VIDIQ_API_KEY) throw new Error('Falta VIDIQ_API_KEY en el servidor');
  if (!VIDIQ_TOOLS.includes(b.tool)) throw new Error('Herramienta de vidIQ no permitida');
  const url = env.VIDIQ_MCP_URL || 'https://mcp.vidiq.com/mcp';
  const head = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: 'Bearer ' + env.VIDIQ_API_KEY };
  const post = (body, sid) => fetch(url, { method: 'POST', headers: { ...head, ...(sid ? { 'Mcp-Session-Id': sid } : {}) }, body: JSON.stringify(body) });
  // Las respuestas llegan como JSON o como eventos (text/event-stream)
  const leer = async r => {
    const t = await r.text();
    if ((r.headers.get('content-type') || '').includes('text/event-stream')) {
      const datos = t.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).filter(Boolean).reverse();
      for (const l of datos) { try { const j = JSON.parse(l); if (j.id !== undefined) return j; } catch (e) {} }
      return null;
    }
    try { return JSON.parse(t); } catch (e) { return null; }
  };
  let r = await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'oficina-jager', version: '1.0' } } });
  if (!r.ok) throw new Error('vidIQ respondió ' + r.status + (r.status === 401 || r.status === 403 ? ' (revisa la clave VIDIQ_API_KEY)' : ''));
  const sid = r.headers.get('mcp-session-id') || undefined;
  await leer(r);
  await post({ jsonrpc: '2.0', method: 'notifications/initialized' }, sid).catch(() => {});
  r = await post({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: b.tool, arguments: b.args || {} } }, sid);
  const d = await leer(r);
  if (!d) throw new Error('vidIQ no ha devuelto una respuesta válida (' + r.status + ')');
  if (d.error) throw new Error('vidIQ: ' + (d.error.message || JSON.stringify(d.error)));
  const texto = (d.result?.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n').trim();
  if (d.result?.isError) throw new Error('vidIQ: ' + texto.slice(0, 300));
  return { texto };
}
