# La oficina de Jager

Empresa virtual en 3D donde trabajadores IA se reparten el trabajo:

- **Jager** (Claude) es el director. Aparece en el ventilador holográfico con tu propio avatar, recibe tus órdenes, te responde y reparte el trabajo.
- **Sala Proyectos**: Max (ChatGPT) ordena la idea, Leo (Claude) programa y Vera (Claude) revisa el código. Si Vera pide cambios, se lo devuelve a Leo.
- **Sala YouTube**: Nora (Claude) escribe el guion, Gema (Gemini) hace las miniaturas, Tito (ChatGPT) los títulos y el SEO, y Paco (Claude) monta el paquete y se lo lleva a **Pixelido**, la agencia que hace los visuales.

Nada se envía sin tu aprobación.

## Cómo abrirla

Abre `index.html` en Chrome. No hace falta instalar nada.

Para que Jager use tu avatar, deja el archivo junto a `index.html` con el nombre `jager.mp4` (vídeo) o `jager.png` (imagen). Mejor con fondo negro, que en el ventilador se ve transparente.

## Ventilador holográfico

El ventilador no admite HDMI, así que no puede mostrar a Jager en directo. En **Ventilador de Jager** puedes grabar un clip de 10 s de cada estado (esperando, escuchando, hablando, trabajo listo) y subirlo con la app del ventilador.

## Estado actual

- Gemini y ChatGPT: resultados de ejemplo hasta conectar sus claves.
- Claude: responde de verdad en la versión publicada en claude.ai. En esta copia local va en modo simulación hasta montar el servidor.

## Siguientes pasos

1. Servidor pequeño (Node) que guarde las claves de API y llame a Claude, Gemini y ChatGPT.
2. Cambiar los resultados de ejemplo de `GEN` por llamadas reales.
3. Guardar encargos y resultados para no perderlos al cerrar.
