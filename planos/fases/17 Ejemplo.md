# Fase 17 · El ejemplo de la app (Jane)

> 30 oct 2026 · sesión «ejemplo» (w1:p19), con la sesión del MCP (w1:p12) y RUNPOD (w1:pN).

**En resumen**
- La app abre con **«ejemplo»**: Jane, la chica rubia de la demo, en un edit colorido de 8 s estilo Vera (5 mundos-póster, ICON y LUXE). Lo eligió Jonathan.
- Todo está en git: `app/proyectos/ejemplo.json` y `app/ejemplo/` (RefMod de Jane + `velvet_rush.mp3`). `servidor.py › poner_ejemplo()` lo copia a ComfyUI al arrancar.
- `app/ejemplo/README.md`: 6 retos y un prompt para el agente.

## Cómo se hizo
1. Edit Vera recreado por el MCP con Jane (`subidas/chica_demo`) y la canción desde 4,0 s; estilo «stylized 3D painting».
2. Prueba local, 8 s a 480×864 (613 s en la 3060): a Jonathan le gustó; es la base.
3. En un pod (RTX 3090): «ejemplo plantilla», con todo lo de Jane quitado de las tomas (207 s). Lo fijo: resolución, duración, semilla 2026102202, los 5 cortes, la canción, y en cada toma el encuadre, la cámara, el momento, el lugar y el estilo. Lo del personaje: solo la referencia principal (nombre, pronombre y ficha).
4. Con otro personaje (`chica_jersey`, «Mia») también funciona, cambiando el estilo de las 5 tomas al suyo.
5. El ejemplo del repo es esa plantilla con Jane, a 480×864, la resolución que se probó en la 3060.

## Lo que aprendimos
- A 1 MP, ICON y LUXE salen peor que a 480p. Jonathan: «no son gran problema».
- La toma 5 se corta a ~5,2 s en vez de 5,5 con esa semilla. Se deja así.
- Con chaquetas abiertas, H3 a veces deja el pecho al aire: hay que nombrar siempre la prenda de debajo (trend).
- En Retocar, SAM «face» deja fuera las gafas y marca caras de las capturas: mejor un rectángulo. No hay control de fuerza.
- Para que la cara salga bien desde el principio, conviene dar una RefMod de la cara además de la de cuerpo entero (Ren v2).

## También hecho en el pod (no va al repo)
El anuncio de auriculares, el trend de outfits y la escena de Ren (v2, 1,5 MP) están en `~/Escritorio/research_notes/pod_ejemplo_30oct/` (127 archivos, sha256 comprobado). El pod está borrado. El ejemplo viejo está respaldado en `~/Escritorio/research_notes/respaldo_ejemplo_viejo/`.

## Pendiente
- ❓ La canción es de una web de música libre de derechos, no de Jonathan. El README lo dice y no la pone bajo CC BY. Falta la página de origen para el crédito.
- Pulsar «Reiniciar» en la app de Jonathan para que copie el kit.
- El push lo hace «repositorio», con el sí de Jonathan.
