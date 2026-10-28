# Fase 11 · El MCP de MAX EDITOR (un agente maneja la app)

Lectura: 3 min · Empezada el 28 oct 2026 · Para los ayudantes y para retomar si se corta. Handoff: `~/Escritorio/research_notes/handoff_mcp.md`.

**En resumen**
- Un servidor MCP para que cualquier agente (Claude Code, Claude Desktop, Cursor, Codex…) haga un edit de principio a fin en MAX EDITOR, **con todo a la vista** en la interfaz para que Jonathan lo cambie a mano.
- Lo más importante es **la GUÍA del agente** (`app/guia/`): sale de lo comprobado (recetas aprobadas, planos, biblioteca del concurso) y del código de hoy.
- Respaldo: la etiqueta git `respaldo-antes-mcp`. Un commit por fase, **sin push**.

## Decisiones

- 🟢 **Paquete oficial `mcp`** (Jonathan, 28 oct): `mcp==2.3.0` en `app/requirements.txt`; lo instala `instalar.sh`. Trae Streamable HTTP y stdio.
- **Proceso propio en :8301** (`app/mcp_servidor.py`), no dentro de `servidor.py`. Por qué:
  - el SDK usa Starlette/uvicorn y la app usa aiohttp: juntarlos en un proceso es frágil;
  - reiniciar o romper el MCP no para la cola ni los trabajos en marcha;
  - el MCP es una capa fina: todo lo hace por las rutas HTTP de la app (`127.0.0.1:8300`), igual que la página. El mismo archivo sirve para stdio (`--stdio`).
- **La lógica del proyecto** (etiquetas `<Picture N>`, duración 17k+5, canción, tomas, marcas) va en `app/agente.py`, sin red, para poder probarla en `pruebas.py`. Copia lo que hace la página (`editor_core.js`, `referencias.js`, `duracion.js`, `resolucion.js`, `audio.js`, `linea.js`).
- **La guía, en inglés claro** con las etiquetas de la interfaz en los dos idiomas («Acción / movimiento» / «Action / movement»). Por qué: los agentes de cualquier idioma leen bien el inglés, los campos que van a H3 se escriben en inglés, y así hay un solo texto que mantener. La guía le pide al agente hablar con el creativo en su idioma.
- **Todo a la vista:** el agente escribe en el mismo proyecto JSON. El proyecto lleva `rev` (sube en cada guardado), `autor` y `agente.marcas`. La página mira `rev`; si cambió y no tiene nada a medio guardar, recarga sola; si choca, avisa y deja elegir. Cada campo que tocó el agente lleva «✎ agente» hasta que Jonathan lo edita o pulsa «visto». La cola marca los trabajos del agente.
- **Límites:** el agente no borra videos ni proyectos, no sobrescribe un proyecto sin `confirmar_sobrescribir`, nunca toca `ejemplo` y no encola más de 4 trabajos por llamada (ni más de 6 pendientes suyos).

## Fases (✅ al terminar, con commit)

1. ✅ **Leer** (handoff, planos, recetas, memorias, código). Plano escrito.
2. ✅ **Esqueleto** `mcp_servidor.py` con `estado` y `leer_guia`; `arrancar.sh` / `parar.sh` lo levantan y lo paran; conectado a Claude Code.
3. ✅ **Proyecto y tomas:** `agente.py` + herramientas de proyectos, referencias, canción, tomas, texto, resolución, semilla y `revisar_proyecto`; pruebas en `pruebas.py`.
4. ✅ **A la vista:** `rev`/`autor`/marcas en `servidor.py`; recarga, conflicto y «✎ agente» en `app.js` (i18n es/en).
5. ⏳ **Generar, cola y ver_video** (fotogramas como imágenes).
6. ⏳ **Retocar** y `ver_mascara`.
7. ⏳ **La GUÍA completa** (`app/guia/*.md`), `instructions` y prompts.
8. ⏳ **Prueba con un agente limpio** (22 f, proyecto `prueba_mcp`), ajustes y su transcripción resumida aquí.
9. ⏳ **LEEME / README:** cómo conectar Claude Code, Claude Desktop y Cursor.

## Registro

- 28 oct: `mcp==2.3.0` instalado en `app/.venv` (con permiso). Etiqueta `respaldo-antes-mcp`. Plano escrito.
- 28 oct (fases 2–4): `app/mcp_servidor.py` (29 herramientas, recursos guia://, 3 prompts; HTTP en :8301 y `--stdio`, probados los dos con el cliente del SDK), `app/agente.py` (sección 18 de `pruebas.py`), `arrancar.sh`/`parar.sh` (`--solo-mcp`; log en `app/salidas/mcp.log`). `servidor.py`: `rev`, `autor`, `agente.marcas`, `base_rev` → 409, `GET /app/proyecto_rev/<nombre>`; la cola guarda `origen`. `app.js`: recarga sola cada 2 s si no hay nada a medio guardar, aviso de choque («Cargar lo del agente» / «Quedarme con lo mío»), bordes rosas «✎ agente» con «Visto», sello en la cola. Comprobado en un Brave headless aparte con `prueba_mcp`: marcas, recarga y choque.
- Sorpresas: el SDK esconde el texto de cualquier excepción que no sea `ToolError` (por eso `ErrorAgente` hereda de ella y `herramienta()` envuelve el resto); el comprobador de letreros de `pruebas.py` toma por letrero un selector CSS dentro de un `? :`.
