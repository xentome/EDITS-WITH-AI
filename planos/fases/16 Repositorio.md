# Fase 16 · Repositorio listo para publicar

> 29 oct 2026 · sesión «repositorio» (w1:p16) · Jonathan dio permiso para todos los arreglos, la limpieza del historial y el push.

**En resumen**
- Fuera del repo: las fotos de terceros (`maqueta/`), Teto (personaje ajeno), el proyecto de ejemplo y las rutas del PC del autor.
- Dentro: capturas de la app, un mapa del repo en el README y todas las licencias en `CREDITOS.md`.
- El historial se reescribe para quitar las fotos de `maqueta/inspiracion/img/` y el correo personal del autor.

## Hecho

1. ✅ Etiqueta `respaldo-antes-repositorio` (solo local).
2. ✅ `maqueta/` sale de git (se queda en el PC, en `.gitignore`).
3. ✅ Teto → Nora en pruebas, guía del MCP, código y notas (`pulido` hizo `web/`). Workflow de ejemplo limpio: sin refs, prompt, audio ni el LoRA «ARCANE 2». Se llama `workflows/Prompt del edit (LLM) 480p 5s.json`.
4. ✅ `app/proyectos/ejemplo.json` sale de git; sin él la app crea un proyecto vacío. Jonathan hará otro ejemplo con la demo.
5. ✅ Sin rutas personales en la guía del MCP y en comentarios; `prueba_generar.py` avisa de que es de desarrollo.
6. ✅ `CREDITOS.md` con las 11 piezas del instalador. Ojo: **ComfyUI-MiniMax-H3-SPEED es PolyForm Noncommercial** (también en el README).
7. ✅ README: capturas (`docs/capturas/`, hechas con un navegador aparte sobre un proyecto vacío) y «What's in this repo».
8. ✅ Historial reescrito (git filter-branch en una copia, cambio atómico del master local): sin `maqueta/inspiracion/img/` y con el correo noreply de GitHub en los 182 commits; mismo árbol final. El historial viejo queda solo en local, en la etiqueta `respaldo-historial-viejo`. `git config user.email` del repo = el noreply.
9. ✅ Force push hecho por Jonathan (29 oct): GitHub master = 75e1f92. Comando usado:
   `git push --force-with-lease=master:7d93eecc658ea6722baff4f221a1caa5fe92db4d origin master`
   No subir etiquetas (`--tags`): `respaldo-historial-viejo` lleva las fotos.
10. ✅ Repo **público** (29 oct, lo pidió Jonathan para que el pod lo use). Antes: push normal de 31 commits (master = b32fe09), revisados sin claves, medios, archivos de más de 100 KB ni rutas personales; `pruebas.py` TODO BIEN. Después: la web, README, LICENSE e `instalar.sh` dan 200 sin sesión, y un clon anónimo pasa `instalar.sh --dry-run`. Lo que falta (la Edición y la galería en el README, el kit de ejemplo) se sube poco a poco.

## No hecho, a propósito

- Mover carpetas a `docs/`: rompería scripts, la plantilla de RunPod y a las otras sesiones el último día.
- `planos/` sigue en español y con notas de desarrollo; el README lo dice.

## Cómo comprobarlo

- `python pruebas.py` → TODO BIEN.
- Todos los enlaces locales del README existen.
- `git ls-tree -r HEAD` sin imágenes salvo `docs/capturas/`.
- Clon limpio: `app/instalar.sh --retocar --dry-run` → «Todo en orden»; `app/arrancar.sh --comprobar` → «Todo en orden»; app :8300 responde.
