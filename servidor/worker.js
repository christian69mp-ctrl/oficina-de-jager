// Servidor de La oficina de Jager: llama a Claude, a Gemini, a ChatGPT y a la voz de Nyx (ElevenLabs u OpenAI) con tus claves.
// Se publica gratis en Cloudflare Workers (ver servidor/README.md).
// Las claves nunca llegan al navegador: se guardan como secretos del Worker.

import { WorkflowEntrypoint } from 'cloudflare:workers';
import { NonRetryableError } from 'cloudflare:workflows';

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
    if (path === '/salud') return json({ ok: true, claude: !!env.ANTHROPIC_API_KEY, gemini: !!env.GEMINI_API_KEY, openai: !!env.OPENAI_API_KEY, voz: env.ELEVENLABS_API_KEY ? 'elevenlabs' : env.OPENAI_API_KEY ? 'openai' : null, oir: !!env.ELEVENLABS_API_KEY, datos: !!env.DATOS, drive: !!env.DRIVE_SCRIPT_URL, youtube: !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET), vidiq: !!env.VIDIQ_API_KEY, web: !!env.ANTHROPIC_API_KEY, pedidos: !!(env.PEDIDO && env.DATOS), botrade: !!env.GITHUB_TOKEN });
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

    // Diagnóstico: prueba cada servicio con una petición mínima y devuelve el error exacto
    if (path === '/diagnostico') return json(await diagnostico(env, await req.json().catch(() => ({}))));
    // Pedidos en el servidor
    if (path.startsWith('/pedido/')) {
      const b = await req.json().catch(() => ({}));
      const fn = { '/pedido/guion': () => pedidoGuion(env, b), '/pedido/corregir': () => pedidoCorregir(env, b), '/pedido/iniciar': () => pedidoIniciar(env, b), '/pedido/estado': () => pedidoEstado(env, b), '/pedido/olvidar': () => pedidoOlvidar(env, b), '/pedido/imagen': () => pedidoImagen(env, b) }[path];
      if (!fn) return json({ error: 'Ruta desconocida' }, 404);
      try { return json(await fn()); } catch (e) { return json({ error: String(e.message || e) }, 502); }
    }
    // Vigilancia de las webs de los proyectos (solo dominios propios)
    if (path === '/web/estado') {
      const b = await req.json().catch(() => ({}));
      let u; try { u = new URL(b.url); } catch (e) { return json({ error: 'Dirección no válida' }, 400); }
      const permitidos = String(env.WEBS || 'laruletacaliente.com').split(',').map(x => x.trim()).filter(Boolean);
      if (!permitidos.some(d => u.hostname === d || u.hostname.endsWith('.' + d))) return json({ error: 'Web no permitida' }, 403);
      const t0 = Date.now();
      try { const r = await fetch(u.toString(), { method: 'GET', redirect: 'follow', headers: { 'User-Agent': 'OficinaJager/1.0 (vigilancia de disponibilidad)' } }); return json({ ok: r.ok, status: r.status, ms: Date.now() - t0 }); }
      catch (e) { return json({ ok: false, error: String(e.message || e), ms: Date.now() - t0 }); }
    }
    // BOTRADE: estado del bot (repositorio privado; necesita GITHUB_TOKEN de solo lectura)
    if (path === '/botrade') {
      if (!env.GITHUB_TOKEN) return json({ error: 'Falta GITHUB_TOKEN en el servidor' }, 400);
      const repo = env.BOTRADE_REPO || 'christian69mp-ctrl/botrade';
      const gh = async f => { const r = await fetch(`https://api.github.com/repos/${repo}/contents/${f}`, { headers: { Authorization: 'Bearer ' + env.GITHUB_TOKEN, Accept: 'application/vnd.github.raw+json', 'User-Agent': 'OficinaJager/1.0', 'X-GitHub-Api-Version': '2022-11-28' } }); if (!r.ok) throw new Error(f + ': GitHub respondió ' + r.status); return r.text(); };
      try {
        const [st, jr, rd] = await Promise.all([gh('paper/state.json'), gh('paper/journal.jsonl').catch(() => ''), gh('README.md').catch(() => '')]);
        const state = JSON.parse(st); state.fills = (state.fills || []).slice(-20); state.events = (state.events || []).slice(-10); delete state.last_snapshot;
        const journal = jr.trim().split('\n').filter(Boolean).slice(-5).map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);
        return json({ state, journal, readme: rd.slice(0, 6000), at: Date.now() });
      } catch (e) { return json({ error: String(e.message || e) }, 502); }
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
// top = el modelo más potente (Opus), solo para el guion; el resto usa Sonnet, mucho más barato y muy bueno
async function claude(env, prompt, rapido, buscar, o = {}) {
  if (!env.ANTHROPIC_API_KEY) throw new Error('Falta la clave ANTHROPIC_API_KEY en el servidor');
  const messages = [{ role: 'user', content: prompt }];
  const fuentes = new Map();
  // top: Opus (solo el guion) · mecanico: Haiku (cambios puntuales, JSON) · resto: Sonnet
  const modelo = o.top ? (env.CLAUDE_MODEL || 'claude-opus-5-5') : o.mecanico ? (env.CLAUDE_MODEL_RAPIDO || 'claude-haiku-5-5') : (env.CLAUDE_MODEL_LIGERO || 'claude-sonnet-5-5');
  // El pensamiento interno se paga como texto escrito: poco en tareas sencillas, el normal en el guion y la mesa
  const esfuerzo = rapido ? 'low' : o.esfuerzo || (o.mecanico ? 'low' : 'medium');
  for (let vuelta = 0; vuelta < 6; vuelta++) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2026-10-21' },
      body: JSON.stringify({
        model: modelo,
        max_tokens: rapido ? 2000 : 32000,
        output_config: { effort: esfuerzo },
        ...(buscar ? { tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: +(o.busquedas || env.MAX_BUSQUEDAS || 6) }] } : {}),
        messages,
      }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error('Claude: ' + (d.error?.message || r.status));
    sumarUso(o.uso, modelo, (d.usage?.input_tokens || 0) + (d.usage?.cache_read_input_tokens || 0) + (d.usage?.cache_creation_input_tokens || 0), d.usage?.output_tokens || 0, d.usage?.server_tool_use?.web_search_requests || 0);
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

// Modelos de Gemini: Google retira versiones; si la configurada ya no existe, se busca la más reciente que tu clave pueda usar
const modelosGemini = {};
const modeloRetirado = (r, d) => r.status === 404 || /no longer available|not found|is not supported|deprecated/i.test(d?.error?.message || '');
async function mejorModeloGemini(env, tipo) {
  if (modelosGemini[tipo]) return modelosGemini[tipo];
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', { headers: { 'x-goog-api-key': env.GEMINI_API_KEY } });
  const d = await r.json().catch(() => ({}));
  const ver = n => (n.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1] * 1 || 0;
  const lista = (d.models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent')).map(m => m.name.replace(/^models\//, ''));
  const ok = tipo === 'imagen' ? lista.filter(n => /^gemini-[\d.]+-flash.*image/.test(n)) : lista.filter(n => /^gemini-[\d.]+-flash(-latest)?$/.test(n));
  const estables = ok.filter(n => !/preview|exp/.test(n));
  const elegido = (estables.length ? estables : ok).sort((a, b) => ver(b) - ver(a))[0];
  if (!elegido) throw new Error(`Gemini: no hay ningún modelo ${tipo === 'imagen' ? 'de imágenes' : 'de texto'} disponible para tu clave`);
  return (modelosGemini[tipo] = elegido);
}
async function geminiPost(env, tipo, body) {
  const pedir = m => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY }, body: JSON.stringify(body) });
  let model = modelosGemini[tipo] || (tipo === 'imagen' ? env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image' : env.GEMINI_MODEL || 'gemini-2.5-flash');
  let r = await pedir(model), d = await r.json().catch(() => ({}));
  if (!r.ok && modeloRetirado(r, d)) { delete modelosGemini[tipo]; model = await mejorModeloGemini(env, tipo); r = await pedir(model); d = await r.json().catch(() => ({})); }
  // Saturación momentánea de Google (503 «high demand» / «overloaded»): se espera y se reintenta
  for (const espera of [4000, 12000, 30000]) {
    if (r.ok || !(r.status === 503 || /high demand|overloaded|try again later|UNAVAILABLE/i.test(d?.error?.message || ''))) break;
    await new Promise(ok => setTimeout(ok, espera));
    r = await pedir(model); d = await r.json().catch(() => ({}));
  }
  return { r, d, model };
}
// Consumo de cada vídeo: tokens por modelo, búsquedas e imágenes (se ve en la ficha del encargo)
function sumarUso(uso, modelo, entrada, salida, busquedas = 0) {
  if (!uso) return;
  const m = uso[modelo] || (uso[modelo] = { entrada: 0, salida: 0, busquedas: 0, llamadas: 0 });
  m.entrada += entrada; m.salida += salida; m.busquedas += busquedas; m.llamadas++;
}
// buscar = Gemini investiga con la Búsqueda de Google (mucho más barato que la búsqueda web de Claude)
async function gemini(env, prompt, o = {}) {
  if (!env.GEMINI_API_KEY) throw new Error('Falta la clave GEMINI_API_KEY en el servidor');
  const { r, d, model } = await geminiPost(env, 'texto', { contents: [{ parts: [{ text: prompt }] }], ...(o.buscar ? { tools: [{ google_search: {} }] } : {}) });
  if (!r.ok) throw new Error('Gemini: ' + (d.error?.message || r.status));
  const cand = d.candidates?.[0] || {};
  const meta = cand.groundingMetadata || {};
  sumarUso(o.uso, model, d.usageMetadata?.promptTokenCount || 0, (d.usageMetadata?.candidatesTokenCount || 0) + (d.usageMetadata?.thoughtsTokenCount || 0), (meta.webSearchQueries || []).length);
  let texto = (cand.content?.parts || []).map(p => p.text || '').join('').trim();
  const fuentes = (meta.groundingChunks || []).map(x => x.web).filter(Boolean);
  if (o.buscar && fuentes.length && !/FUENTES CONSULTADAS/.test(texto)) texto += '\n\nFUENTES CONSULTADAS (Google)\n' + [...new Map(fuentes.map(w => [w.uri, w])).values()].slice(0, 40).map(w => `- ${w.title || 'fuente'}: ${w.uri}`).join('\n');
  return texto;
}
// Investigación con búsqueda: primero Gemini + Google; si no puede, Claude (Sonnet) con pocas búsquedas
async function investigar(env, prompt, uso, busquedas = 4) {
  try { const t = await gemini(env, prompt, { buscar: true, uso }); if (t && t.length > 300) return t; } catch (e) {}
  return claude(env, prompt, false, true, { busquedas, uso });
}

async function geminiImage(env, prompt) {
  if (!env.GEMINI_API_KEY) throw new Error('Falta la clave GEMINI_API_KEY en el servidor');
  // Formato miniatura de YouTube (16:9); si el modelo no admite el formato, se pide sin él y la oficina la recorta a 1280x720
  let { r, d } = await geminiPost(env, 'imagen', { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['IMAGE', 'TEXT'], imageConfig: { aspectRatio: '16:9' } } });
  if (!r.ok && r.status === 400) ({ r, d } = await geminiPost(env, 'imagen', { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['IMAGE', 'TEXT'] } }));
  if (!r.ok) throw new Error('Gemini imagen: ' + (d.error?.message || r.status));
  const part = (d.candidates?.[0]?.content?.parts || []).find(p => p.inlineData || p.inline_data);
  const img = part?.inlineData || part?.inline_data;
  if (!img?.data) throw new Error('Gemini no ha devuelto ninguna imagen');
  return { mime: img.mimeType || img.mime_type || 'image/png', base64: img.data };
}

async function chatgpt(env, prompt, uso) {
  if (!env.OPENAI_API_KEY) throw new Error('Falta la clave OPENAI_API_KEY en el servidor');
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: env.OPENAI_MODEL || 'gpt-4.1-mini', messages: [{ role: 'user', content: prompt }] }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error('ChatGPT: ' + (d.error?.message || r.status));
  sumarUso(uso, d.model || env.OPENAI_MODEL || 'gpt-4.1-mini', d.usage?.prompt_tokens || 0, d.usage?.completion_tokens || 0);
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

// ---------- PEDIDOS EN EL SERVIDOR (Cloudflare Workflows) ----------
// Cada vídeo de un pedido es un trabajo que avanza paso a paso en el servidor, aunque la oficina esté cerrada.
// La oficina manda el contexto de cada vídeo (ficha del canal, normas, formación…) y aquí se hacen los pasos.
// El progreso se guarda en el almacén DATOS (claves «pv:…») y la oficina lo consulta para enseñarlo.
const jsonDe = t => { if (!t) return null; t = String(t).replace(/```(?:json)?/g, ''); const a = t.indexOf('{'), b = t.lastIndexOf('}'); if (a < 0 || b <= a) return null; try { return JSON.parse(t.slice(a, b + 1)); } catch (e) { return null; } };
const corta = (t, n) => { t = String(t || '').trim(); return t.length > n ? t.slice(0, n).trimEnd() + '\n…(recortado)' : t; };
// Cada puesto con su IA; si falta la clave, lo hace Claude
async function pensar(env, ia, prompt, o = {}) {
  const extra = o.json ? '\n\nResponde solo con el JSON, sin texto alrededor.' : '';
  try {
    if (ia === 'gemini' && env.GEMINI_API_KEY) return await gemini(env, prompt + extra, { uso: o.uso });
    if (ia === 'chatgpt' && env.OPENAI_API_KEY) return await chatgpt(env, prompt + extra, o.uso);
  } catch (e) {
    // Sin saldo, sin cuota o modelo retirado: Claude ocupa su puesto para que el pedido no se quede a medias
    if (!env.ANTHROPIC_API_KEY || o.sinSustituto) throw e;
  }
  return claude(env, prompt + extra, !!o.rapido, !!o.buscar, { uso: o.uso });
}
const P = {
  vidiqTxt: out => out.vidiq ? `\nDATOS REALES DE vidIQ (úsalos: palabras con volumen y poca competencia, y patrones de los outliers):\n${corta(out.vidiq, 5000)}\n` : '',
  mesaBase: (job, c, out) => `Tema que propone el jefe: «${job.topic}».${P.vidiqTxt(out)}\n${c.normas}\n${c.canal}\n${c.mesa}\nManual del canal:\n${c.lessons}\nHistorial de vídeos:\n${c.history}`,
  propuesta: (job, c, out, id, otros) => `Estás en una reunión de "La oficina de Jager" con tus compañeros ${otros} para decidir ${c.goal}. Eres ${c.persona[id]}
${P.mesaBase(job, c, out)}
Ronda 1: da tu propuesta concreta desde tu especialidad.
Habla en primera persona, en español de España, con tono de reunión y frases cortas. Máximo 70 palabras. Escribe solo tu intervención, sin tu nombre delante.`,
  acuerdo: (job, c, out, debate) => `Eres la secretaria de la reunión de análisis de "La oficina de Jager". Lee las propuestas de Lía (tendencias, Gemini), Rui (CTR, ChatGPT) y Sam (retención y rentabilidad, Claude) y redacta el acuerdo final para decidir ${c.goal}. Quédate con la opción más viral y rentable en la que coincidan o que mejor hayan defendido, y refleja el voto real de cada uno.
${P.mesaBase(job, c, out)}
Propuestas:
${debate}
OBJETIVOS OBLIGATORIOS DEL JEFE: CTR estimado de al menos el 5 % y retención a los 30 segundos de al menos el 60 %. En el JSON, ctr_estimado y retencion_30s van en porcentaje real de YouTube (un CTR normal está entre el 2 y el 10 %; la retención a los 30 s, entre el 50 y el 80 %). Si con el enfoque elegido no se llega, cambia el ángulo, el gancho o la promesa hasta llegar. No infles las cifras: tienen que ser creíbles.
Devuelve SOLO JSON: ${c.schema}`,
  dossier: (job, c, out) => `Eres Iris, documentalista e investigadora del estudio. Investiga con la Búsqueda de Google el caso «${out.tema}» para un documental en español de unos 22 minutos.
Enfoque acordado por la mesa: ${String(out.estudioTxt || '').slice(0, 1500)}
Entrega un DOSIER en texto plano, sin markdown, con estos apartados:
CRONOLOGÍA: fecha · hecho · [n] (número de la fuente).
PERSONAS: nombre, papel y situación judicial EXACTA (investigado, acusado, condenado, absuelto, archivado), con fuente.
CIFRAS CLAVE: cada cifra con su fuente; si dos fuentes no coinciden, da las dos.
CITAS TEXTUALES: solo citas literales con su fuente.
LO QUE NO ESTÁ PROBADO: rumores, atribuciones de prensa y acusaciones sin sentencia.
DETALLES PARA EL GUION: escenas, lugares, ambientes y anécdotas verificadas que den ritmo y tensión.
FUENTES: lista numerada [n] título · medio u organismo · enlace. Prioriza fuentes oficiales (policía, juzgados, ministerios, OFAC/Tesoro, Europol) y prensa de referencia.
Solo hechos comprobables. Sé exhaustiva: este dosier es la única base del guion.`,
  guion: (job, c, out) => `${c.formacion.nora}
DOSIER DE INVESTIGACIÓN (la base de todos los datos del guion; usa SOLO estos hechos y cifras; lo que no esté aquí no lo inventes: cuéntalo de forma general o márcalo [VERIFICAR]):
${corta(out.dossier, 22000)}
${c.normas}
${c.canal}
${c.guion}
Vídeo: «${out.tema}».
Acuerdo de la mesa de análisis (enfoque, gancho, promesa y público):
${out.estudioTxt || '(sin estudio)'}
Lecciones del manual de la oficina (aplícalas):
${c.lessons}
El jefe pide este formato y esta extensión: si las reglas del estudio dicen otra cosa, manda esto.
Escribe el GUION completo del vídeo, listo para locutar y para que Pixelido lo edite sin dudas. Extensión: unas 3.500 palabras de locución (entre 3.300 y 3.800, unos 22-24 minutos). Si faltan datos verificados, completa con contexto, recapitulaciones, transiciones, cliffhangers y pasajes de tono, nunca con datos inventados.
Empieza directamente por «1. GUION DE EDICIÓN»: sin notas, recomendaciones ni comentarios previos, y sin mencionar archivos ni nombres de fichero.
Entrega en texto plano, sin markdown, con estas partes y estos títulos exactos:
1. GUION DE EDICIÓN — el vídeo completo de principio a fin, dividido en bloques de 30 a 90 segundos. Cada bloque empieza con una línea así: [B1 · 0:00–0:40 · GANCHO] y debajo, siempre en este orden y con estas etiquetas:
LOCUCIÓN: el texto exacto que se lee en voz alta en ese bloque, en párrafos completos (aquí va TODO el texto locutado del vídeo, sin notas).
IMAGEN: qué se ve (archivo, foto, mapa, documento, metraje, recreación 3D marcada como recreación) y cómo se monta (ritmo, zoom, transición).
TEXTO EN PANTALLA: cada rótulo exacto entre comillas «…» y cuándo aparece (cita la frase de la locución que lo dispara: fecha, lugar, nombre con cargo, cifra clave, cita textual), o «ninguno».
SONIDO: música o efecto (tensión, silencio, golpe, cambio de tema) o «sigue».
2. FUENTES — informes oficiales, sentencias, libros o artículos que respaldan los datos; si no estás seguro de una, márcala [VERIFICAR].
3. AFIRMACIONES A VERIFICAR — lista de cada dato que hay que comprobar antes de locutar.
RETENCIÓN (objetivo del jefe: que al menos el 60 % siga viendo a los 30 segundos y que la retención media sea la máxima posible): empieza en los primeros 15 segundos con la escena de mayor tensión del caso, deja clara la promesa del vídeo antes del segundo 30, abre una pregunta o bucle nuevo cada 2-3 minutos y ciérralo más adelante, cambia de ritmo a menudo, nada de introducciones lentas ni saludos, y avanza de los hechos menores al clímax.`,
  verifica: (job, c, out) => `${c.formacion.iris}
Tienes la Búsqueda de Google: comprueba las afirmaciones clave del guion (fechas, cifras, nombres, cargos, situación judicial) contra fuentes fiables y contra el dosier de investigación.
Dosier de investigación:
${corta(out.dossier, 8000)}
${c.normas}
${c.canal}
Vídeo: «${out.tema}».
Guion de Nora:
${out.guion || ''}
Entrega en texto plano, sin markdown:
VEREDICTO: «LISTO PARA LOCUTAR» o «NECESITA CORRECCIONES».
DATOS COMPROBADOS: lista de afirmaciones clave confirmadas, cada una con su fuente (título y enlace).
CORRECCIONES: cada dato erróneo o dudoso, con el texto original, el texto corregido exacto y la fuente.
SIN CONFIRMAR: lo que no hayas podido verificar y que hay que quitar o suavizar antes de locutar.
SENSIBILIDAD: algo que pueda afectar a víctimas, familias o a la monetización y cómo suavizarlo.`,
  miniaturas: (job, c, out) => `${c.formacion.gema}
${c.normas}
${c.canal}
${c.miniatura}
Vídeo: «${out.tema}».
Acuerdo de la mesa: ${String(out.estudioTxt || '').split('\n').slice(0, 10).join(' ')}
Diseña 3 conceptos de miniatura realmente distintos (ángulo distinto, no un adjetivo distinto) que sigan la identidad visual del canal.
Devuelve SOLO JSON: {"conceptos":[{"texto":"0-4 palabras exactas o vacío","escena":"composición, sujeto principal, fondo y colocación del texto","emocion":"qué siente quien la ve","colores":"colores e iluminación","excluir":"lo que no debe aparecer","prompt_imagen":"prompt para Gemini en español, listo para copiar, 16:9"}]}`,
  titulos: (job, c, out) => `${c.formacion.tito}
${c.normas}
${c.canal}
${c.titulos}
Vídeo: «${out.tema}».${P.vidiqTxt(out)}
Guion (inicio): ${String(out.guion || '').slice(0, 2500)}
Escribe 8 títulos muy distintos entre sí, la descripción natural del vídeo (2 primeras líneas que enganchen, resumen, capítulos con los minutos de las indicaciones visuales, fuentes si corresponde y 2-3 hashtags relevantes) y un comentario fijado que abra una conversación concreta.
Devuelve SOLO JSON: {"titulos":["..."],"descripcion":"...","hashtags":["#..."],"comentario_fijado":"..."}`,
  pretest: (job, c, out) => `${c.formacion.rui}
${c.canal}
${c.titulos}
Vídeo: «${out.tema}». Cierra la versión definitiva de título y miniatura.${P.vidiqTxt(out)}
Títulos de Tito:
${(out.titulos?.titulos || []).map((t, i) => `${i + 1}. ${t}`).join('\n')}
Conceptos de miniatura de Gema:
${(out.miniaturas?.conceptos || []).map((x, i) => `${'ABC'[i]}: texto «${x.texto}» · ${x.escena} · ${x.emocion} · prompt: ${x.prompt_imagen || ''}`).join('\n') || '(sin conceptos de miniatura)'}
Historial de la oficina (previsto y real): ${c.history}
Elige o mejora la mejor combinación (puedes ajustar el título o el prompt) y estima su CTR de forma orientativa. Explica las 2 alternativas descartadas en una frase. OBJETIVO OBLIGATORIO DEL JEFE: CTR estimado de al menos el 5 % (porcentaje real de YouTube; sé creíble, sin clickbait engañoso). Entrega además los 3 TÍTULOS FINALES para el jefe: el ganador primero y dos alternativas fuertes y distintas entre sí, listos para copiar.
Devuelve SOLO JSON: {"titulos_finales":["título ganador","alternativa 2","alternativa 3"],"promesa":"promesa central del vídeo","ganador":{"titulo":"título final","miniatura":"A|B|C","texto_miniatura":"texto exacto","prompt_gemini":"prompt final para copiar","ctr_estimado":número},"como_funcionan_juntos":"...","riesgo":"riesgo principal de interpretación","checklist":["¿Se entiende a 160 px?","..."],"descartadas":["..."]}`,
  brief: (job, c, out) => { const g = String(out.guion || ''); const i = g.search(/GUION DE EDICI[ÓO]N|INDICACIONES VISUALES/i); return `${c.formacion.paco}
${c.normas}
${c.canal}
${c.pixelido}
Prepara el pedido para Pixelido del vídeo «${out.tema}» (pedido ${job.pedido}, ${c.hoy}).
Acuerdo de la mesa:
${out.estudioTxt || ''}
Guion de edición de Nora (inicio):
${i >= 0 ? g.slice(i, i + 9000) : g.slice(0, 6000)}
Versión definitiva de título y miniatura de Rui: ${JSON.stringify(out.pretest || {})}
Informe de verificación de Iris (aplica sus correcciones en DATOS A VERIFICAR):
${corta(out.verifica, 5000)}
En texto plano, sin markdown, con estos apartados y en este orden: TEMA · GUION (escribe solo «Ver GUION DE EDICIÓN y LOCUCIÓN LIMPIA del paquete»; van aparte) · DESCRIPCIÓN DE EDICIÓN (estilo del canal, ritmo, tipografía y estilo de los textos en pantalla, música; no repitas los bloques, ya están en el guion de edición) · OBSERVACIONES (voz asignada a este canal según PIXELIDO, cambios de tono, límites, pantalla final) · MINIATURA (texto exacto + descripción visual igual al prompt de Gemini) · DATOS A VERIFICAR ANTES DE LOCUTAR. Máximo 650 palabras.`; },
};

// Nora aplica las correcciones de Iris al guion completo, con el mismo formato y extensión
async function corregirGuion(env, c, tema, guion, verifica, nota = async () => {}, uso) {
  if (!guion || !/NECESITA CORRECCIONES|CORRECCIONES\s*:?\s*\n\s*\S|SIN CONFIRMAR\s*:?\s*\n\s*\S/i.test(verifica || '')) return guion;
  await nota('Nora aplica las correcciones de Iris al guion');
  const d = jsonDe(await claude(env, `${c.formacion?.nora || 'Eres Nora, guionista de documentales del estudio.'}
Vas a aplicar al guion de «${tema}» el informe de verificación de Iris con cambios puntuales.
Reglas:
- Aplica TODAS las CORRECCIONES con el texto corregido exacto.
- Lo que esté SIN CONFIRMAR, quítalo o suavízalo («según la prensa irlandesa…», «se le atribuye…»), sin inventar nada.
- Distingue siempre investigado, acusado y condenado. Aplica las recomendaciones de SENSIBILIDAD.
- Corrige también los rótulos de TEXTO EN PANTALLA afectados.
- Cada cambio: "original" es un fragmento copiado EXACTAMENTE del guion (mínimo 6 palabras, tal cual, con sus signos), y "nuevo" el texto que lo sustituye.
Devuelve SOLO JSON: {"cambios":[{"original":"...","nuevo":"..."}],"pendiente":["lo que no se ha podido corregir con cambios puntuales"]}

INFORME DE IRIS:
${corta(verifica, 12000)}

GUION:
${guion}`, false, false, { uso, mecanico: true }));
  let t = guion, n = 0;
  for (const ch of d?.cambios || []) if (ch?.original && ch.original.length >= 12 && t.includes(ch.original)) { t = t.replace(ch.original, String(ch.nuevo ?? '')); n++; }
  await nota(`Nora ha aplicado ${n} correcciones de Iris`);
  return n ? t : guion;
}

// Locución limpia: todo lo que va detrás de «LOCUCIÓN:» en el guion de edición
function locucionLimpia(g) {
  const partes = []; let cur = null;
  for (const linea of String(g || '').split('\n')) {
    if (/^\s*LOCUCI[ÓO]N\s*:/i.test(linea)) { cur = [linea.replace(/^\s*LOCUCI[ÓO]N\s*:\s*/i, '')]; partes.push(cur); continue; }
    if (/^\s*(IMAGEN|TEXTO EN PANTALLA|SONIDO)\s*:/i.test(linea) || /^\s*\[B\d+/i.test(linea) || /^\s*(\d\.\s*)?(FUENTES|AFIRMACIONES A VERIFICAR)\b/i.test(linea)) { cur = null; continue; }
    if (cur) cur.push(linea);
  }
  return partes.map(p => p.join('\n').trim()).filter(Boolean).join('\n\n');
}
const palabras = t => (String(t || '').match(/\S+/g) || []).length;

// Gema: instrucción para que Gemini cree cada miniatura (16:9, lista para YouTube)
function promptMiniatura(out, x) {
  // Sin el título del vídeo en la petición: Gemini tiende a escribirlo en la imagen y con faltas
  const t = String(x.texto || '').trim();
  return `Imagen horizontal 16:9 para la miniatura de YouTube de un documental de true crime. Fotografía cinematográfica realista de alta calidad. ${x.prompt_imagen ? x.prompt_imagen + ' ' : ''}Escena: ${x.escena || ''}. Emoción: ${x.emocion || ''}.${x.colores ? ' Colores: ' + x.colores + '.' : ''} ${t ? `El ÚNICO texto de toda la imagen es «${t}», escrito exactamente así, letra por letra y con sus tildes (${[...t].join(' ')}), en mayúsculas grandes, gruesas y muy legibles. No añadas ningún otro texto, subtítulo, título, fecha ni letra.` : 'Sin ningún texto ni letras.'} Un único punto de atención, alto contraste, que se entienda en un móvil. Sin logotipos ni marcas de agua. Sin rostros reconocibles de personas reales.`;
}

export class Pedido extends WorkflowEntrypoint {
  async run(event, step) {
    const env = this.env;
    const { key, job, ctx: c } = event.payload;
    const out = { tema: job.topic };
    // auto = la oficina escribe el guion con la API · preparar = se para con el encargo para tu plan de Claude · completar = sigue con tu guion
    const modo = event.payload.modo || 'auto';
    const guardar = async (paso, cambios = {}) => {
      const cur = JSON.parse((await env.DATOS.get(key)) || '{}');
      cur.out = { ...(cur.out || {}), ...cambios }; cur.paso = paso; cur.estado = paso === 'listo' ? 'listo' : 'en curso'; cur.upd = Date.now();
      delete cur.aviso; cur.nota = null;
      await env.DATOS.put(key, JSON.stringify(cur));
    };
    // Lo que está haciendo ahora mismo (se ve en la ficha del encargo) y el error si un paso falla y se reintenta
    const nota = async (texto, aviso) => { try { const cur = JSON.parse((await env.DATOS.get(key)) || '{}'); cur.nota = texto; if (aviso) cur.aviso = aviso; cur.upd = Date.now(); await env.DATOS.put(key, JSON.stringify(cur)); } catch (e) {} };
    // Consumo del paso en curso: se suma al del vídeo al terminar cada paso
    const U = {};
    const anotarUso = async () => { if (!Object.keys(U).length) return; try { const cur = JSON.parse((await env.DATOS.get(key)) || '{}'); const t = cur.uso || {}; for (const [m, v] of Object.entries(U)) { const a = t[m] || (t[m] = { entrada: 0, salida: 0, busquedas: 0, llamadas: 0 }); for (const k of Object.keys(a)) a[k] += v[k] || 0; } cur.uso = t; await env.DATOS.put(key, JSON.stringify(cur)); } catch (e) {} for (const k of Object.keys(U)) delete U[k]; };
    const sd = (nombre, cfg, fn) => step.do(nombre, cfg, async () => {
      try { const v = await fn(); await anotarUso(); return v; }
      catch (e) {
        await anotarUso();
        const msg = String(e?.message || e);
        await nota(null, { paso: nombre, error: msg.slice(0, 300), at: Date.now() });
        // Sin saldo o clave incorrecta: reintentar no sirve y solo gasta; se para y se avisa
        if (/credit balance|insufficient_quota|no credits|invalid x-api-key|authentication_error|API key not valid|PERMISSION_DENIED/i.test(msg)) throw new NonRetryableError(msg);
        throw e;
      }
    });
    const R = { retries: { limit: 2, delay: '1 minute', backoff: 'exponential' }, timeout: '30 minutes' };
    try {
      let mesa;
      if (modo === 'completar') {
        const rec = JSON.parse((await env.DATOS.get(key)) || '{}');
        Object.assign(out, { vidiq: rec.out?.vidiq || null, dossier: rec.out?.dossier || '', guion: rec.out?.guion || '' });
        mesa = rec.out?.estudio || { result: { tema_final: job.topic, acuerdo: '' } };
      } else {
      // 1. Lía: investigación con vidIQ (si falla, se sigue sin ella)
      out.vidiq = await sd('vidiq', { retries: { limit: 1, delay: '10 seconds' } }, async () => {
        let txt = null;
        if (env.VIDIQ_API_KEY) try {
          const tema = String(job.topic).slice(0, 140);
          const kw = await vidiq(env, { tool: 'vidiq_keyword_research', args: { mode: 'research', keyword: tema, country: 'ES', limit: 15, userGoal: 'choose keywords and angle for a Spanish long-form documentary video' } });
          const ol = await vidiq(env, { tool: 'vidiq_outliers', args: { keyword: tema, language: 'es', contentType: 'long', limit: 10, userGoal: 'find overperforming Spanish long-form videos on this topic as title and thumbnail references' } }).catch(e => ({ texto: 'No se pudieron leer los outliers: ' + e.message }));
          txt = `PALABRAS CLAVE EN ESPAÑA (vidIQ · ${c.hoy})\n${corta(kw.texto, 6000)}\n\nVÍDEOS OUTLIER EN ESPAÑOL SOBRE EL TEMA (vidIQ)\n${corta(ol.texto, 6000)}`;
        } catch (e) { txt = null; }
        await guardar('estudio', { vidiq: txt });
        return txt;
      });
      // 2. Mesa de análisis: propuesta de cada analista con su IA y acuerdo final
      mesa = await sd('estudio', R, async () => {
        const quien = { lia: 'gemini', rui: 'chatgpt', sam: 'claude' };
        const nombres = { lia: 'Lía', rui: 'Rui', sam: 'Sam' };
        const transcript = [];
        for (const id of ['lia', 'rui', 'sam']) {
          const otros = Object.keys(nombres).filter(x => x !== id).map(x => nombres[x]).join(' y ');
          // Hasta 3 intentos con su IA (los límites de Gemini y ChatGPT suelen ser momentáneos); si no, Claude ocupa su puesto y se guarda el motivo
          const pr = P.propuesta(job, c, out, id, otros);
          await nota(`${nombres[id]} prepara su propuesta con ${({ gemini: 'Gemini', chatgpt: 'ChatGPT', claude: 'Claude' })[quien[id]]}`);
          let t = null, via = quien[id], error = null;
          for (let k = 0; k < 3 && !t; k++) {
            try { t = await pensar(env, quien[id], pr, { rapido: true, sinSustituto: true, uso: U }); } catch (e) { error = String(e.message || e).slice(0, 240); }
            if (!t && k < 2) { await nota(`${nombres[id]}: su IA no responde (${error || 'sin respuesta'}). Reintento ${k + 2} de 3…`); await new Promise(r => setTimeout(r, k ? 25000 : 8000)); }
          }
          if (!t && quien[id] !== 'claude') { t = await claude(env, pr, true, false, { uso: U }).catch(() => null); if (t) via = 'claude'; }
          transcript.push({ who: id, round: 1, text: String(t || `(${nombres[id]} no ha podido conectar con su IA.)`).trim().replace(/^(Lía|Rui|Sam)\s*:\s*/i, ''), via: t ? via : 'error', error: via !== quien[id] || !t ? error : null });
        }
        const debate = transcript.map(m => `${nombres[m.who]}: ${m.text}`).join('\n');
        await nota('Sam redacta el acuerdo de la mesa');
        let result = jsonDe(await claude(env, P.acuerdo(job, c, out, debate), false, false, { uso: U })) || { acuerdo: 'La mesa no ha podido cerrar un acuerdo. Seguimos con el tema tal cual.', tema_final: job.topic };
        // Si el acuerdo no llega a los objetivos del jefe (CTR ≥ 5 %, retención a los 30 s ≥ 60 %), la mesa lo replantea (hasta 2 veces)
        const bajo = x => { const p = x?.puntuaciones || {}; return (+p.ctr_estimado || 0) < 5 || (+p.retencion_30s || 0) < 60; };
        for (let k = 0; k < 1 && bajo(result); k++) {
          const p = result.puntuaciones || {};
          await nota(`La mesa replantea el enfoque: CTR estimado ${p.ctr_estimado ?? '?'} % y retención ${p.retencion_30s ?? '?'} %; el objetivo es 5 % y 60 %`);
          const otra = jsonDe(await claude(env, P.acuerdo(job, c, out, debate) + `\n\nTu acuerdo anterior se quedó en CTR ${p.ctr_estimado ?? '?'} % y retención a los 30 s ${p.retencion_30s ?? '?'} %, por debajo del objetivo. Acuerdo anterior: ${JSON.stringify(result).slice(0, 3000)}\nReplantea el ángulo, el gancho y la promesa para superar los objetivos de verdad.`, false, false).catch(() => null));
          if (otra?.acuerdo) result = otra; else break;
        }
        const r = { transcript, result };
        await guardar('guion', { estudio: r });
        return r;
      });
      }
      out.tema = mesa.result.tema_final || job.topic;
      const pz = mesa.result.puntuaciones || {};
      out.estudioTxt = `ACUERDO: ${mesa.result.acuerdo}\nTema final: ${out.tema}\nÁngulo: ${mesa.result.angulo || ''}\nGancho: ${mesa.result.gancho || ''}\nPromesa: ${mesa.result.promesa || ''}\nPúblico: ${mesa.result.publico || ''}\nDuración ideal: ${mesa.result.duracion_ideal || ''}\nViral ${pz.viral ?? '?'}/100 · Rentabilidad ${pz.rentabilidad ?? '?'}/100`;
      // Iris investiga con la Búsqueda de Google y prepara el dosier del que sale el guion
      if (modo !== 'completar') out.dossier = await sd('investiga', R, async () => {
        await nota('Iris investiga el caso con la Búsqueda de Google');
        const t = await investigar(env, P.dossier(job, c, out), U, 5);
        if (!t || t.length < 800) throw new Error('Dosier de investigación demasiado corto');
        await guardar('guion', { dossier: t });
        return t;
      });
      // Modo suscripción: aquí se para con el encargo listo para pegar en la app de Claude
      if (modo === 'preparar') {
        await sd('encargo', R, async () => {
          const encargo = P.guion(job, c, out) + '\n\nEscribe ahora el guion completo, siguiendo exactamente ese formato. Texto plano, sin markdown: sin asteriscos, sin almohadillas y sin negritas.';
          const cur = JSON.parse((await env.DATOS.get(key)) || '{}');
          cur.out = { ...(cur.out || {}), encargoGuion: encargo }; cur.estado = 'esperando_guion'; cur.paso = 'guion'; cur.nota = 'Esperando tu guion escrito con tu plan de Claude'; delete cur.aviso; cur.upd = Date.now();
          await env.DATOS.put(key, JSON.stringify(cur));
          return true;
        });
        return;
      }
      if (modo === 'auto') {
      // 3. Nora: guion completo con Claude e investigación en internet
      out.guion = await sd('guion', R, async () => {
        await nota('Nora escribe el guion a partir del dosier de Iris (el paso más largo)');
        let t = await claude(env, P.guion(job, c, out), false, false, { top: true, uso: U });
        if (!t || t.length < 500) throw new Error('Guion demasiado corto');
        // La locución debe rondar las 3.500 palabras: si se queda corta, Nora amplía el guion (hasta 2 veces)
        for (let k = 0; k < 1 && palabras(locucionLimpia(t)) < 3200; k++) {
          const n = palabras(locucionLimpia(t));
          await nota(`Nora amplía el guion: tiene ${n} palabras y hacen falta unas 3.500`);
          const mas = await claude(env, `${c.formacion.nora}\n${c.normas}\n${c.canal}\nEste guion de «${out.tema}» tiene ${n} palabras de locución y necesita unas 3.500 (entre 3.300 y 3.800). Reescríbelo COMPLETO con exactamente el mismo formato (GUION DE EDICIÓN por bloques con LOCUCIÓN, IMAGEN, TEXTO EN PANTALLA y SONIDO; después FUENTES y AFIRMACIONES A VERIFICAR). Amplía los bloques más flojos con contexto verificado, detalle, tensión y transiciones; añade bloques si hace falta y recalcula los minutos. No inventes datos ni cambies los hechos.\n\nGUION ACTUAL:\n${t}`, false, false, { top: true, uso: U }).catch(() => null);
          if (mas && palabras(locucionLimpia(mas)) > n) t = mas; else break;
        }
        await guardar('verifica', { guion: t });
        return t;
      });
      }
      // Iris: verificación de datos con búsqueda en internet
      out.verifica = await sd('verifica', R, async () => { const t = c.formacion.iris ? await investigar(env, P.verifica(job, c, out), U, 4) : ''; await guardar('miniaturas', { verifica: t }); return t; });
      // Nora aplica al guion las correcciones de Iris (si las hay): el guion que llega al jefe ya está corregido
      out.guion = await sd('corregir', R, async () => {
        const t = await corregirGuion(env, c, out.tema, out.guion, out.verifica, nota, U);
        if (t !== out.guion) await guardar('miniaturas', { guion: t, corregido: true });
        return t;
      });
      // 4. Gema: ideas de miniatura y después las 3 imágenes con Gemini
      out.miniaturas = await sd('miniaturas', R, async () => { const d = jsonDe(await pensar(env, 'gemini', P.miniaturas(job, c, out), { json: true, uso: U })); if (!d?.conceptos) throw new Error('Miniaturas sin formato'); await guardar('titulos', { miniaturas: d }); return d; });
      out.imagenes = await sd('imagenes', { retries: { limit: 1, delay: '20 seconds' }, timeout: '10 minutes' }, async () => {
        const res = { ok: [], error: null };
        for (const [i, x] of (out.miniaturas.conceptos || []).slice(0, 3).entries()) {
          try {
            const img = await geminiImage(env, promptMiniatura(out, x)); U.imagenes = U.imagenes || { entrada: 0, salida: 0, busquedas: 0, llamadas: 0 }; U.imagenes.llamadas++;
            await env.DATOS.put(`img:${key}:${i}`, JSON.stringify(img), { expirationTtl: 60 * 86400 });
            res.ok[i] = true;
          } catch (e) { res.ok[i] = false; res.error = String(e.message || e).slice(0, 300); }
        }
        await guardar('titulos', { imagenes: res });
        return res;
      });
      // 5. Tito: títulos y SEO
      out.titulos = await sd('titulos', R, async () => { const d = jsonDe(await pensar(env, 'chatgpt', P.titulos(job, c, out), { json: true, uso: U })); if (!d?.titulos) throw new Error('Títulos sin formato'); await guardar('pretest', { titulos: d }); return d; });
      // 6. Rui: versión definitiva de título y miniatura
      out.pretest = await sd('pretest', R, async () => { let d = jsonDe(await pensar(env, 'chatgpt', P.pretest(job, c, out), { json: true, uso: U })); if (!d?.ganador) throw new Error('Test de CTR sin formato');
        for (let k = 0; k < 2 && (+d.ganador.ctr_estimado || 0) < 5; k++) {
          await nota(`Rui mejora título y miniatura: CTR estimado ${d.ganador.ctr_estimado ?? '?'} %, el objetivo es 5 %`);
          const otra = jsonDe(await pensar(env, 'chatgpt', P.pretest(job, c, out) + `\n\nTu propuesta anterior estimaba un CTR del ${d.ganador.ctr_estimado ?? '?'} %: no llega al 5 %. Propuesta anterior: ${JSON.stringify(d).slice(0, 2500)}\nMejora el título y el concepto de miniatura (más contraste, curiosidad concreta, emoción) hasta superar el 5 % de forma creíble.`, { json: true, uso: U }).catch(() => null));
          if (otra?.ganador) d = otra; else break;
        } await guardar('brief', { pretest: d }); return d; });
      // 7. Paco: pedido para Pixelido
      await sd('brief', R, async () => { const t = await claude(env, P.brief(job, c, out), false, false, { uso: U, esfuerzo: 'low' }); await guardar('listo', { brief: t }); return true; });
    } catch (e) {
      const cur = JSON.parse((await env.DATOS.get(key)) || '{}');
      cur.estado = 'error'; cur.error = String(e.message || e).slice(0, 300); cur.upd = Date.now();
      await env.DATOS.put(key, JSON.stringify(cur));
      throw e;
    }
  }
}

async function pedidoIniciar(env, b) {
  if (!env.PEDIDO) throw new Error('Falta el motor de pedidos (PEDIDO) en wrangler.toml');
  if (!env.DATOS) throw new Error('Falta el almacén DATOS');
  const code = String(b.pedido || 'PX').replace(/[^A-Za-z0-9-]/g, '').slice(0, 20) || 'PX';
  const res = [];
  for (const [i, v] of (b.videos || []).slice(0, 20).entries()) {
    const key = `pv:${code}:${Date.now().toString(36)}${i}`;
    const job = { topic: String(v.topic || '').slice(0, 300), channelId: v.channelId, pedido: code };
    const modo = b.modo === 'suscripcion' ? 'suscripcion' : 'auto';
    await env.DATOS.put(key, JSON.stringify({ key, job, modo, estado: 'en cola', paso: 'vidiq', out: {}, creado: Date.now(), upd: Date.now() }));
    await env.PEDIDO.create({ id: key.replace(/:/g, '-'), params: { key, job, ctx: v.ctx, modo: modo === 'suscripcion' ? 'preparar' : 'auto' } });
    res.push(key);
  }
  return { claves: res };
}
async function pedidoEstado(env, b) {
  if (!env.DATOS) return { videos: [] };
  const conocidos = b.conocidos || {}, videos = [];
  let cursor;
  do {
    const l = await env.DATOS.list({ prefix: 'pv:', cursor });
    for (const k of l.keys) {
      const r = JSON.parse((await env.DATOS.get(k.name)) || 'null'); if (!r) continue;
      if (r.estado !== 'listo' && r.estado !== 'error' && r.estado !== 'esperando_guion' && env.PEDIDO && Date.now() - (r.upd || 0) > 120000) {
        try {
          const st = await (await env.PEDIDO.get(k.name.replace(/:/g, '-'))).status();
          if (['errored', 'terminated'].includes(st.status)) { r.estado = 'error'; r.error = String(st.error?.message || st.error || st.status).slice(0, 300); r.upd = Date.now(); await env.DATOS.put(k.name, JSON.stringify(r)); }
        } catch (e) {}
      }
      videos.push(conocidos[k.name] === r.upd ? { key: k.name, upd: r.upd, igual: true } : r);
    }
    cursor = l.list_complete ? null : l.cursor;
  } while (cursor);
  return { videos };
}
async function pedidoOlvidar(env, b) { if (env.DATOS && String(b.key || '').startsWith('pv:')) { await env.DATOS.delete(b.key); for (const i of [0, 1, 2]) await env.DATOS.delete(`img:${b.key}:${i}`); } return { ok: true }; }
// Diagnóstico completo de la oficina
async function diagnostico(env, b) {
  const prueba = async (fn) => { const t0 = Date.now(); try { const r = await fn(); return { ok: true, ms: Date.now() - t0, detalle: String(r ?? '').slice(0, 160) }; } catch (e) { return { ok: false, ms: Date.now() - t0, error: String(e.message || e).slice(0, 400) }; } };
  const res = {};
  const tareas = {
    claude: () => claude(env, 'Responde solo: OK', true, false),
    claude_busqueda: () => claude(env, 'Busca en internet la fecha de hoy y responde en una frase.', true, true),
    gemini_busqueda: async () => { const t = await gemini(env, 'Busca en Google la fecha de hoy y responde en una frase.', { buscar: true }); if (!/FUENTES CONSULTADAS/.test(t)) throw new Error('Gemini respondió sin usar la Búsqueda de Google'); return t.slice(0, 120); },
    gemini: async () => { const t = await gemini(env, 'Responde solo: OK'); return `${t} · modelo ${modelosGemini.texto || env.GEMINI_MODEL || 'gemini-2.5-flash'}`; },
    chatgpt: () => chatgpt(env, 'Responde solo: OK'),
    vidiq: async () => { const r = await vidiq(env, { tool: 'vidiq_balance', args: {} }); return r.texto; },
    drive: async () => {
      if (!env.DRIVE_SCRIPT_URL) throw new Error('Falta DRIVE_SCRIPT_URL en el servidor');
      const r = await fetch(env.DRIVE_SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ accion: 'carpetas', buscar: 'Oficina Jager', clave: env.DRIVE_CLAVE || '' }), redirect: 'follow' });
      const d = await r.json().catch(() => null); if (!d) throw new Error('El script de Drive no responde con JSON'); if (d.error) throw new Error(d.error); return (d.carpetas || []).length + ' carpetas';
    },
    botrade: async () => {
      if (!env.GITHUB_TOKEN) throw new Error('Falta GITHUB_TOKEN');
      const r = await fetch(`https://api.github.com/repos/${env.BOTRADE_REPO || 'christian69mp-ctrl/botrade'}`, { headers: { Authorization: 'Bearer ' + env.GITHUB_TOKEN, 'User-Agent': 'OficinaJager/1.0' } });
      if (!r.ok) throw new Error('GitHub respondió ' + r.status); return 'acceso correcto';
    },
  };
  if (b.imagen) tareas.gemini_imagen = async () => { const i = await geminiImage(env, 'Un círculo dorado sobre fondo negro, sin texto'); return i.mime + ' ' + Math.round(i.base64.length * 0.75 / 1024) + ' KB · modelo ' + (modelosGemini.imagen || env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image'); };
  await Promise.all(Object.entries(tareas).map(async ([k, fn]) => { res[k] = await prueba(fn); }));
  res.pedidos = env.PEDIDO && env.DATOS ? { ok: true, detalle: 'motor de pedidos activo' } : { ok: false, error: !env.DATOS ? 'Falta el almacén DATOS en wrangler.toml' : 'Falta el bloque [[workflows]] (binding PEDIDO) en wrangler.toml: los pedidos se hacen en el navegador' };
  for (const k of ['gemini', 'gemini_imagen', 'chatgpt']) if (res[k] && !res[k].ok && /high demand|overloaded|try again later|UNAVAILABLE|503/i.test(res[k].error || '')) res[k].temporal = true;
  res.modelos = { ok: true, detalle: `Claude ${env.CLAUDE_MODEL || 'claude-opus-5-5'} (guion), ${env.CLAUDE_MODEL_LIGERO || 'claude-sonnet-5-5'} (mesa, Paco, Nyx) y ${env.CLAUDE_MODEL_RAPIDO || 'claude-haiku-5-5'} (correcciones) · Gemini ${modelosGemini.texto || env.GEMINI_MODEL || 'gemini-2.5-flash'} · imagen ${modelosGemini.imagen || env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image'} · ChatGPT ${env.OPENAI_MODEL || 'gpt-4.1-mini'}` };
  return res;
}
// Modo suscripción: llega el guion que el jefe ha escrito con su plan de Claude y el pedido sigue en el servidor
function normalizarGuion(t) {
  return String(t || '').replace(/\r/g, '').replace(/\*\*|__/g, '').replace(/^\s*#{1,6}\s*/gm, '').replace(/^\s*>\s?/gm, '')
    .replace(/^\s*[-*•]\s*(?=(LOCUCI[ÓO]N|IMAGEN|TEXTO EN PANTALLA|SONIDO)\s*:)/gim, '').trim();
}
async function pedidoGuion(env, b) {
  if (!env.DATOS || !env.PEDIDO || !String(b.key || '').startsWith('pv:')) throw new Error('Pedido desconocido');
  const rec = JSON.parse((await env.DATOS.get(b.key)) || 'null'); if (!rec) throw new Error('Pedido desconocido');
  if (rec.estado !== 'esperando_guion' && rec.estado !== 'error') throw new Error('Este vídeo no está esperando un guion');
  const g = normalizarGuion(b.guion), n = palabras(locucionLimpia(g));
  if (n < 500) throw new Error('No encuentro la locución: el guion debe venir por bloques con «LOCUCIÓN:», «IMAGEN:», «TEXTO EN PANTALLA:» y «SONIDO:». Pide a Claude que respete el formato del encargo.');
  rec.out = { ...(rec.out || {}), guion: g }; rec.estado = 'en curso'; rec.paso = 'verifica'; rec.nota = 'Iris verifica tu guion'; delete rec.aviso; delete rec.error; rec.upd = Date.now();
  await env.DATOS.put(b.key, JSON.stringify(rec));
  await env.PEDIDO.create({ id: b.key.replace(/:/g, '-') + '-c' + Date.now().toString(36), params: { key: b.key, job: rec.job, ctx: b.ctx, modo: 'completar' } });
  return { ok: true, palabras: n };
}
// Aplica las correcciones de Iris a un vídeo ya terminado (pedidos anteriores a este paso)
async function pedidoCorregir(env, b) {
  if (!env.DATOS || !String(b.key || '').startsWith('pv:')) throw new Error('Pedido desconocido');
  const rec = JSON.parse((await env.DATOS.get(b.key)) || 'null'); if (!rec?.out?.guion) throw new Error('Ese vídeo no tiene guion');
  const uso = {}; const t = await corregirGuion(env, b.ctx || {}, rec.out.estudio?.result?.tema_final || rec.job.topic, rec.out.guion, rec.out.verifica, undefined, uso);
  const cambiado = t !== rec.out.guion;
  if (cambiado) { const cur = JSON.parse((await env.DATOS.get(b.key)) || '{}'); cur.out.guion = t; cur.out.corregido = true; cur.upd = Date.now(); await env.DATOS.put(b.key, JSON.stringify(cur)); }
  return { ok: true, cambiado, palabras: palabras(locucionLimpia(t)), uso };
}
// Miniatura creada por Gema en un pedido del servidor
async function pedidoImagen(env, b) {
  if (!env.DATOS || !String(b.key || '').startsWith('pv:')) throw new Error('Pedido desconocido');
  const img = JSON.parse((await env.DATOS.get(`img:${b.key}:${Number(b.i) || 0}`)) || 'null');
  if (!img) throw new Error('Miniatura no encontrada');
  return img;
}
