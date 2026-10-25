# Fases: el código solo pega

Lectura: 2 min · Empezado el 25 oct 2026 (en el chat principal, sin ayudantes)

**En resumen**
- **Objetivo:** que el código deje de escribir frases por su cuenta. El prompt final solo puede llevar tres cosas:
  - el molde de H3 (los nombres de las secciones, las etiquetas y los tiempos);
  - lo que escribes tú o el LLM;
  - las frases de unión, que ahora se ven y se cambian en `frases.json` y en la ventana.
- **Cómo se comprueba:**
  - el prompt final pinta cada trozo del color de quien lo escribió;
  - `pruebas.py` tiene tres pruebas nuevas: frases marcadas, carta vacía y copia y pega.
- **De dónde viene:** la réplica de Ren y la prueba de control mostraron que el código añadía frases invisibles. Cada una estaba pensada para un solo edit: el lugar obligatorio, «al lado de la cara», «sin ruidos», el fondo sin presentar…

Símbolos: ✅ hecha (con su commit) · 🔄 en curso · ⬜ pendiente.

## Fases

1. 🔄 **El núcleo pega.** Consiste en:
   - `frases.json` con todas las frases de unión;
   - `montar` arma la carta solo con el molde, los campos y esas frases, y devuelve los trozos con su origen;
   - cada referencia que se usa se presenta arriba con su ficha, sea del papel que sea;
   - se quitan los cambios escondidos (mayúsculas, «A/The» en minúscula, el resumen que decidía «close-ups»);
   - un campo vacío ya no deja «[…]»: no sale, y se avisa;
   - en `pruebas.py`, las tres pruebas nuevas;
   - la referencia de Teto se regenera tras leer la diferencia.
2. ⬜ **La ventana enseña quién escribe cada trozo.** Consiste en:
   - colores en el prompt final, con su leyenda;
   - el panel «Frases del código» para cambiarlas;
   - en la ficha de cada referencia, «Cómo se presenta» y «Qué se copia» (vacío = la frase del código);
   - un encuadre propio («✎ escribir el mío»);
   - todo en los dos idiomas.
3. ⬜ **Planos al día.** Consiste en:
   - los planos 1, 2, 4, 5 y 6, y `PLANOS.md`, incluida la regla de la casa nueva: el código solo pega;
   - la lista de reglas de revisión del plano 5, para repasarla con el usuario. Esas reglas son el filtro que queda, en lo que escribe el LLM.

## Lo que quedó a medias y cómo seguir

(se rellena al parar)

## Pendiente, cuando el usuario lo decida

- La prueba de control de Ren con dos tomas: el workflow «Prueba control Ren 2 tomas 480p 5s» (sin guardar los últimos cambios de la ventana) y las referencias `cajitas/ren_oro_a_luz_2_v2` y `subidas/escena_azotea_manga__tapado_026e3cdf`.
- Editar una cajita: quitar y añadir fotos a la vista, y un botón verde grande «Guardar».
