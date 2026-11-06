# La oficina de Jager

Empresa virtual en 3D donde trabajadores IA se reparten el trabajo de tus canales de YouTube y de tus proyectos (como la Ruleta Caliente):

- **Nyx** (Claude) es la directora y la única que habla. Aparece en el ventilador holográfico con su avatar (`nyx.png`) como en una videollamada de hackers: nunca está quieta, gesticula (ladea la cabeza, se acerca, gira, asiente), parpadea y mueve la boca al ritmo de su voz, mientras la señal se llena de interferencias azules. No tiene frases fijas: todo lo que dice lo piensa Claude en el momento, responde a cualquier cosa que le preguntes y recuerda la conversación. Recibe las órdenes de Jager (el jefe) y reparte el trabajo. El resto del equipo trabaja en silencio.
- **Sala Proyectos**: Max (ChatGPT) ordena la idea, Leo (Claude) programa y Vera (Claude) revisa el código. Si Vera pide cambios, se lo devuelve a Leo.
- **Sala YouTube**: Nora (Claude) escribe el guion, Gema (Gemini) hace las miniaturas, Tito (ChatGPT) los títulos y el SEO, y Paco (Claude) monta el paquete y se lo lleva a **Pixelido**, la agencia que hace los visuales.
- **Sala de Análisis**: Lía (Gemini, tendencias y viralidad), Rui (ChatGPT, CTR y empaquetado) y Sam (Claude, retención y rentabilidad). Se reúnen en la **mesa de debate**: cada uno propone desde su especialidad, se responden en una segunda ronda y votan el acuerdo más viral y rentable. Debaten el enfoque de cada vídeo, qué tema viral producir y el plan de mejora tras ver las métricas.

## Ciclo de mejora

1. Lía estudia el tema (o propone temas virales).
2. Nora, Gema y Tito preparan guion, miniaturas y títulos usando el **manual del canal**.
3. Rui estima el CTR de cada combinación y elige la ganadora.
4. Tú apruebas y Paco entrega el paquete a Pixelido.
5. Cuando el vídeo esté publicado, añades sus métricas de YouTube Studio.
6. Rui y Sam las analizan, comparan lo previsto con lo real y añaden lecciones al manual, que el equipo aplica en los siguientes vídeos.

Nada se envía sin tu aprobación.

## Cómo abrirla

Abre `index.html` en Chrome. No hace falta instalar nada.

El avatar de Nyx es `nyx.png`, junto a `index.html`. Para cambiarlo, sustituye ese archivo (o pon un vídeo `nyx.mp4`). Mejor con fondo negro, que en el ventilador se ve transparente.

## Ventilador holográfico

El ventilador no admite HDMI, así que no puede mostrar a Jager en directo. En **Ventilador de Jager** puedes grabar un clip de 10 s de cada estado (esperando, escuchando, hablando, trabajo listo) y subirlo con la app del ventilador.

## Estado actual

- Sin simulación: la oficina arranca vacía y solo trabaja con encargos reales. Sin IA conectada, Nyx no acepta encargos; si una IA falla, se avisa en lugar de inventar.
- Nyx solo habla cuando el jefe le pregunta (por escrito o con el micro) o pulsa «Escuchar a Nyx». Los avisos de la oficina salen por escrito, sin gastar voz.
- Cada puesto tiene su formación (constante `FORMACION` en `index.html`): estrategia de tendencias, guion documental con retención, miniaturas, títulos y SEO, test de CTR, encargo para Pixelido, retención y rentabilidad, y desarrollo web.

## Siguientes pasos

1. Servidor pequeño (Node) que guarde las claves de API y llame a Claude, Gemini y ChatGPT.
2. Cambiar los resultados de ejemplo de `GEN` por llamadas reales.
3. Guardar encargos y resultados para no perderlos al cerrar.

## Conexiones

- **Google Drive**: al aprobar un vídeo, Paco guarda el paquete completo (encargo, guion, títulos, test de CTR y acuerdo de la mesa) en la carpeta que compartes con Pixelido.
- **Servidor propio** (carpeta `servidor/`): con tus claves, Nyx piensa con Claude y habla con su voz real de ElevenLabs, Lía y Gema usan Gemini (con miniaturas reales) y Rui, Tito y Max usan ChatGPT. Ver `servidor/README.md`.

Drive funciona en la versión publicada en claude.ai. El servidor propio solo funciona en la versión del repositorio abierta en tu ordenador.

## Biblioteca del estudio (repositorio Estudio-youtube)

La oficina usa el repositorio [Estudio-youtube](https://github.com/christian69mp-ctrl/Estudio-youtube) como memoria de los 5 canales: identidad, estilo, estrategia, ideas, aprendizajes, decisiones, métricas, protocolos, temas cubiertos y cómo trabajar con Pixelido (voces por canal incluidas).

- Cada trabajador recibe lo que necesita de la ficha del canal activo: Lía la estrategia, las ideas y los temas cubiertos; Nora la plantilla de guion largo y un guion de ejemplo del canal; Gema, Tito y Rui el protocolo de título y miniatura; Paco la ficha de Pixelido; Rui y Sam el protocolo de métricas y el plan de monetización; Nyx el estado del estudio.
- Se lee en directo desde GitHub al abrir la oficina (se refresca cada hora o con «Actualizar desde GitHub»). Lo que cambies en Estudio-youtube lo usa la oficina en la siguiente lectura.
- En el panel, **Ver ficha del canal** enseña la ficha y los proyectos de vídeo del canal elegido.

## Varios canales

Arriba del panel eliges el canal de YouTube con el que trabajas o creas uno nuevo. Cada canal tiene su nicho, sus vídeos, sus métricas y su propio manual de lecciones. Los proyectos de programación no dependen del canal.
