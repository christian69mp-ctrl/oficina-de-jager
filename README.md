# Oficina Atlas

Empresa virtual en 3D donde trabajadores IA se reparten el trabajo:

- **Atlas** (Claude) es el director. Vive en el ventilador holográfico, recibe tus órdenes y las reparte.
- **Sala Proyectos**: Max (ChatGPT) ordena la idea, Leo (Claude) programa y Vera (Claude) revisa el código. Si Vera encuentra fallos, se lo devuelve a Leo.
- **Sala YouTube**: Nora (Claude) escribe el guion, Gema (Gemini) hace las miniaturas, Tito (ChatGPT) los títulos y el SEO, y Paco (Claude) monta el paquete y se lo lleva a **Pixelido**, la agencia que hace los visuales del vídeo.

Nada se envía sin tu aprobación.

## Cómo abrirla

Abre `index.html` en Chrome. No necesita instalar nada.

## Estado actual

- Modo simulación: las IAs todavía no están conectadas y los resultados son de ejemplo.
- **Modo ventilador**: graba clips de 10 s de Atlas (esperando, escuchando, hablando, trabajo listo) sobre fondo negro para subirlos con la app del ventilador, que no admite HDMI.

## Siguientes pasos

1. Servidor pequeño (Node) que guarde las claves de API y llame a Claude, Gemini y ChatGPT.
2. Cambiar los resultados de ejemplo de `GEN` por llamadas reales a cada IA.
3. Guardar encargos y resultados para no perderlos al cerrar.
