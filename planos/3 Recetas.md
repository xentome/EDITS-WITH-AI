# Recetas

Lectura: 2 min

**En resumen:** una receta guarda lo fijo de un personaje y su estética: cómo se le define ante H3, cómo se le retiene, su estilo base, sus efectos probados y sus referencias por defecto. Vive en `recetas.json`. Para añadir un personaje no hace falta tocar código.

## Claves

| Clave | Para qué |
|---|---|
| `definicion_edit` | qué es un edit, dicho en vez de escribir la palabra «edit» (va en las instrucciones al LLM) |
| `protagonista`, `estilo` | frases de las instrucciones al LLM |
| `nombre`, `pronombre`, `posesivo` | revisar pronombres y escribir «her uniform» o «his jacket» |
| `sujeto` | definición del personaje en el prompt H3; `{personajes}` se cambia por las referencias de papel personaje |
| `audio` | la línea que define `<Audio 1>` |
| `retencion` | línea de retención del personaje, también con `{personajes}` |
| `retencion_audio` | línea de retención del audio |
| `resumen` | inicio fijo del summary; el arco del LLM va detrás |
| `estilo_prompt` | primera línea de `detailed_description` |
| `texto_estilo` | cómo se ven las palabras en pantalla |
| `referencias` | papel, nombre y ficha por defecto de cada `<Picture N>`. `ref` es el nombre del RefMod: el editor lo usa para encontrar la referencia aunque cambie de número |
| `efectos` | código → [nombre para el LLM, frase probada que va al prompt, y opcionalmente lo que tiene que haber en la toma, en inglés] |
| `prohibidas` | palabras extra que esta receta no acepta (Teto: bokeh, cinematic…) |

Las líneas de retención de pose, fondo y estilo no salen de la receta: las escribe el código según los papeles.

## Recetas que hay

- ✅ **Teto city pop:** 4 referencias de personaje (atuendos), 5 de pose y 7 efectos.
- ✅ **Ren sin efectos:** su identidad viene de `<Video 1>` del Media Loader; no tiene referencias ni efectos en la receta.
- ❓ **Vera:** falta. Su fórmula está en `experimentos_edit/receta_vera/`.

## Añadir un personaje

1. Copia una receta de `recetas.json` con otro nombre.
2. Cambia `sujeto` y `retencion`; usa `{personajes}` si sus referencias van en el RefMod Stack.
3. Pon sus efectos con frases **ya probadas** en un render: una frase nueva sin probar puede dar artefactos, como el «líquido rojo».
4. Pon `referencias` solo si quieres valores por defecto; el editor las puede definir.
5. Corre `pruebas.py`. En ComfyUI, refresca las definiciones de nodos (tecla R) para que la receta salga en el combo.
