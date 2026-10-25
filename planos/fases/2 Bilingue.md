# Fases: bilingüe (español / inglés)

Actualizado: 25 oct 2026 · Este archivo dice por dónde va el trabajo, para retomarlo si el PC se suspende o se apaga.

**En resumen:** el nodo «Prompt del edit (LLM)» y su ventana se ven en español o en inglés. Los textos viven en `web/i18n/es.json` y `en.json`; el código solo usa `t("clave")`. Lo que va al LLM o a H3 sigue en inglés.

## Estado

| Fase | Qué | Estado |
|---|---|---|
| 1 | Base: las dos trampas, `web/i18n/{es,en}.json`, `t()` en JS y en Python, ajuste de idioma y botón «ES \| EN», comprobaciones nuevas en `pruebas.py` | ✅ hecha · `fc2b5ec` |
| 2 | La ventana: todos los textos de `web/editor_core.js`, `web/editor.js` y `web/editor/*.js` con `t()`, marcadores, `Intl`, redibujar al cambiar | ✅ hecha · `5a2ab0e` |
| 3 | El servidor y el nodo: `ErrorUsuario(clave, **datos)`, `idioma` en cada llamada, `locales/{es,en}/nodeDefs.json`, reiniciar ComfyUI | ✅ hecha · `da887c6` |
| 4 | Probar en los dos idiomas en el navegador real (workflow «Prueba bilingüe»), capturas y documentar en los planos 2, 4 y 6 | ✅ hecha · `3b9c050` |

## A medias

- Fase 1 hecha: `i18n.py` (t, num, ErrorUsuario y el generador de `locales/`), `web/editor/i18n.js` (cargarTextos, idiomaElegido, traductor con t/num/lista), el ajuste `EditPromptLLM.Idioma` en `web/editor.js`, el botón «ES | EN» en `web/editor_core.js` (que ya usa `t()`), `util.api` manda `idioma`, `duracion.js` devuelve los cambios como datos. Trampas: el buscador de `cajitas.js` se busca por la clase `epl-cajita-buscar`; el `client_id` de `rutas._crear_refmod` va en su propio parámetro `cliente`.
- `pruebas.py` sección 15: la lista `PENDIENTES` dice qué archivos aún no pasaron a `t()`; se vacía al terminar las fases 2 y 3 (entonces también se mira que no sobren claves).
- Fase 2 hecha: todas las piezas de `web/editor/` usan `t()`; cada ventanita guarda `v.repintar` y la cabecera redibuja todo al cambiar de idioma (probado en «Prueba bilingüe»: ES → EN sin perder nada). Los avisos del workflow van como `[clave, datos]`; los del servidor de tapar traen `aviso_i18n` / `origen_i18n` (fase 3).
- Fase 3 hecha: `nucleo.py`, `rutas.py` y `__init__.py` usan `ErrorUsuario(clave, **datos)` e `i18n.t`; `/edit_prompt_llm/*` responde en el `idioma` de cada llamada; los huecos de `montar` salen en ese idioma; el informe del nodo, en el `idioma` guardado en `estado`. Lo guardado en disco (descripción de RefMods, `.tapado.json`) queda en español, con `aviso_i18n` / `origen_i18n` para volver a enseñarlo. `PENDIENTES` ya está vacía. ComfyUI reiniciado y pestaña nueva abierta: el lienzo enseña los nombres de `locales/`.
- Respaldo de los workflows abiertos con cambios antes de reiniciar: `~/Escritorio/experimentos_edit/edit_prompt_llm/bilingue/respaldo_workflows/` (el de «Prueba final» era igual al guardado).
- Fase 4 hecha: recorrido en «Prueba bilingüe» en los dos idiomas (historia, toma, ficha con tapar y su vista previa, cajita, biblioteca, subir foto, crear cajita, efecto de texto, arrastre de un borde, ✕ de una toma, cambiar canción, prompt final, un error del servidor y el nodo en el lienzo). 28 capturas y la revisión del DOM (`*_revision_dom.json`) en `~/Escritorio/experimentos_edit/edit_prompt_llm/bilingue/capturas/`: ningún texto de la interfaz en el idioma equivocado (solo salen nombres de carpetas y RefMods, que son datos). El prompt final no cambió (`pruebas/prompt_teto.txt`). El ajuste quedó en «auto».

## Terminado (25 oct)

Pendientes: el nombre del nodo y de sus entradas siguen al idioma de ComfyUI, no al botón (lo decide ComfyUI); las fichas, riesgos de visión y problemas de revisión que escribe el LLM salen en el idioma en que los escribe; los `.tapado.json` viejos (de antes de hoy) tienen su aviso solo en español. Ayudante para añadir claves: `~/Escritorio/experimentos_edit/edit_prompt_llm/bilingue/herramientas/claves.py`.

## Cómo seguir

1. `cd ~/comfy/ComfyUI/custom_nodes/edit_prompt_llm && git status && git diff --stat` para ver lo que quedó a medias.
2. Sigue la fase en curso; corre `~/ComfyUI-CLI/.venv/bin/python pruebas.py` hasta TODO BIEN.
3. El inventario de partida está en `~/Escritorio/experimentos_edit/edit_prompt_llm/bilingue/textos.json` (con su `LEEME.md`). Ya no hace falta: lo vigente son `web/i18n/*.json`.
4. Si al volver de una suspensión falla una llamada (LLM, ComfyUI o navegador), repítela antes de dar la fase por fallida.
5. Al terminar cada fase: actualiza este archivo, commit en español con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` y `git push`. No incluyas `maqueta/dibujo.json` (es del usuario).
