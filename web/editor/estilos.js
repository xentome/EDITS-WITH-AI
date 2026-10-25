/* Estilos de la ventana del editor (la interfaz nueva, como la maqueta: maqueta/interfaz.html). Solo exporta el texto CSS
 * (lo pone editor_core.js). Rojo = lo que no cambia; azul = lo que se presta; dorado = lo que usa la toma elegida.
 * Esquinas: todas las curvas valen «--radio × su tamaño de antes». --radio:0 = esquinas rectas (lo pidió el usuario);
 * --radio:1 vuelve a como estaba. */
export const CSS = `
.epl-fondo{--radio:0;position:fixed;inset:0;z-index:10000;background:rgba(8,10,14,.66);display:flex;align-items:center;justify-content:center;
  font-family:system-ui,sans-serif;font-size:13px}
/* lo que no tiene esquina propia (botones y campos con el estilo de ComfyUI) también va recto */
.epl-fondo :where(*){border-radius:calc(var(--radio) * 4px)}
.epl-caja{position:relative;width:98vw;height:96vh;display:flex;flex-direction:column;background:#191c22;color:#d7dbe2;
  border:1px solid #303642;border-radius:calc(var(--radio) * 10px);box-shadow:0 24px 64px rgba(0,0,0,.55);overflow:hidden}
.epl-caja.ocupada .epl-boton,.epl-caja.ocupada .epl-mini,.epl-caja.ocupada .epl-mas{opacity:.45;pointer-events:none}
.epl-cabecera{display:flex;align-items:center;gap:12px;padding:8px 16px;border-bottom:1px solid #2a2f3a;background:#1e222a}
.epl-idioma{display:inline-flex;align-items:center;gap:3px;color:#6b7280;font-size:11px}
.epl-idioma .epl-mini{min-width:30px}
.epl-estado{flex:1;color:#8a93a3}.epl-estado.bien{color:#5fbf7f}.epl-estado.mal{color:#f07070}.epl-estado.trabajando{color:#e0a94c}
.epl-cuerpo{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:8px;padding:10px 2.5%}
.epl-sec{background:#15181e;border:1px solid #2e3440;border-radius:calc(var(--radio) * 8px);padding:8px 10px;flex:none}
.epl-tit{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#8a93a3;margin-bottom:6px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.epl-tit .der{margin-left:auto;display:flex;gap:6px;align-items:center;text-transform:none;letter-spacing:0;flex-wrap:wrap}
.epl-ayuda{color:#7d8698;font-size:11px;margin:2px 0 6px}
.epl-aviso{color:#e0a94c;font-size:11px;margin:4px 0}
.epl-vacio{color:#8a93a3;font-style:italic;padding:4px 0}
.epl-sec input,.epl-sec textarea,.epl-sec select,.epl-modal input,.epl-modal textarea,.epl-modal select{background:#12151b;color:#d7dbe2;
  border:1px solid #2e3440;border-radius:calc(var(--radio) * 5px);padding:4px 6px;font:inherit}
.epl-sec textarea,.epl-modal textarea{resize:vertical}
input.corto{width:70px}
/* 1 · historia general: rojo oscuro opaco con letras blancas, para que resalte */
.epl-sec.epl-s-historia{background:#5a1a1a;border-color:#7a2c2c;color:#fff}
.epl-s-historia .epl-tit,.epl-s-historia .epl-ajustes,.epl-s-historia .epl-campo>span{color:#fff}
.epl-s-historia input,.epl-s-historia textarea,.epl-s-historia select{background:#2a0e0e;color:#fff;border-color:#8a3a3a}
.epl-s-historia input::placeholder,.epl-s-historia textarea::placeholder{color:#c9a3a3}
.epl-historia{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 14px}
.epl-ajustes{display:flex;flex-wrap:wrap;gap:10px;align-items:center;font-size:12px;color:#9aa3b2}
.epl-ajustes input.palabras{width:200px}
/* campos con candado */
.epl-campo{display:grid;grid-template-columns:86px minmax(0,1fr) 26px;align-items:start;gap:6px;margin:3px 0}
.epl-campo>span{color:#9aa3b2;padding-top:5px;font-size:12px}
.epl-campo.ancho{grid-template-columns:86px minmax(0,1fr)}
.epl-campo select,.epl-campo input,.epl-campo textarea{min-width:0;width:100%;box-sizing:border-box}
.epl-candado{background:none;border:0;cursor:pointer;font-size:13px;padding:1px 3px;opacity:.3;filter:grayscale(1)}
.epl-candado.fijo{opacity:1;filter:none;background:#5a4515;border-radius:calc(var(--radio) * 5px)}
.epl-marca-frase{margin:-2px 0 4px 92px}
/* 2 · prompt de la toma */
.epl-linea-toma{font-family:ui-monospace,monospace;font-size:12px;line-height:1.45;color:#cfe0ff;background:#12151b;border:1px solid #2e3440;
  border-radius:calc(var(--radio) * 6px);padding:6px 8px;margin-bottom:8px;white-space:pre-wrap;word-break:break-word}
.epl-tres{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0 14px}
.epl-tres>div>b{display:block;font-size:11px;color:#8a93a3;font-weight:normal;text-transform:uppercase;letter-spacing:.06em;margin:2px 0 4px}
/* 3 · referencias en dos mitades */
.epl-refs{padding:0;overflow:hidden;height:clamp(340px,54vh,720px);display:flex}
.epl-mitades{flex:1;min-height:0;display:grid;grid-template-columns:2fr 3fr}
.epl-mitad{display:flex;flex-direction:column;min-height:0;min-width:0;padding:8px 10px}
.epl-mitad.izq{background:linear-gradient(#2a1717,#1e1213);border-right:2px solid #a83a3a}
.epl-mitad.izq .epl-tit{color:#f0a0a0}
.epl-mitad.der{background:linear-gradient(#16233a,#121a29)}
.epl-mitad.der .epl-tit{color:#8fb6f0}
.epl-rejilla{flex:1;min-height:0;display:grid;gap:8px;overflow:auto;grid-auto-rows:minmax(150px,1fr)}
.epl-tile{position:relative;border:1px solid #2e3440;border-radius:calc(var(--radio) * 9px);overflow:hidden;background:#12151b;cursor:pointer;min-height:0;
  transition:outline .1s,opacity .15s}
.epl-tile:hover{border-color:#5d6a80}
/* borde por mitad: rojo apagado a la izquierda (lo que no cambia), azul apagado a la derecha (lo que se presta) */
.epl-mitad.izq .epl-tile{border:2px solid #9a3a3a}.epl-mitad.izq .epl-tile:hover{border-color:#c25454}
.epl-mitad.der .epl-tile{border:2px solid #3a5f9a}
.epl-mitad.izq .epl-tile .mosaico img{box-sizing:border-box;border:2px solid #9a3a3a}
.epl-mitad.der .epl-tile .mosaico img{box-sizing:border-box;border:2px solid #3a5f9a}.epl-mitad.der .epl-tile:hover{border-color:#5480c2}
.epl-tile .fondo{position:absolute;inset:-14px;background-size:cover;background-position:center;filter:blur(14px) brightness(.45)}
.epl-tile>img{position:absolute;inset:4px 4px 34px 4px;width:calc(100% - 8px);height:calc(100% - 38px);object-fit:contain;display:block}
.epl-tile .mosaico{position:absolute;inset:4px 4px 34px 4px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));
  grid-template-rows:repeat(2,minmax(0,1fr));gap:3px}
.epl-tile .mosaico img{width:100%;height:100%;min-height:0;object-fit:contain;background:#0d1015;border-radius:calc(var(--radio) * 4px)}
.epl-tile .sinfoto{position:absolute;inset:4px 4px 34px;display:flex;align-items:center;justify-content:center;color:#7d8698}
.epl-tile .franja{position:absolute;left:0;right:0;bottom:0;background:linear-gradient(rgba(0,0,0,.55),rgba(0,0,0,.9));padding:4px 8px;
  font-size:12px;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.epl-tile .franja b{color:#cfe0ff}.epl-tile .franja small{color:#8a93a3;display:block;overflow:hidden;text-overflow:ellipsis}
.epl-insignia{position:absolute;top:8px;right:8px;background:#a83a3a;color:#fff;border-radius:calc(var(--radio) * 10px);padding:1px 8px;font-size:11px}
.epl-mitad.der .epl-insignia{background:#2f4a78}
/* la que usa la toma elegida: doble línea dorada (borde y una línea por dentro), se distingue del rojo y del azul */
.epl-mitad .epl-tile.usada{border:3px solid #e0a94c;outline:2px solid #e0a94c;outline-offset:-8px}
.epl-tile.atenuada{opacity:.33}
.epl-tile.apagada{opacity:.45;filter:grayscale(.8)}
.epl-papel{font-size:10px;border-radius:calc(var(--radio) * 5px);padding:0 5px;background:#2b3a52;color:#d7dbe2}
.epl-papel.personaje,.epl-papel.objeto,.epl-papel.lugar{background:#6a2a2a}
.epl-papel.pose{background:#3a2b52}.epl-papel.ropa{background:#1f4a5a}.epl-papel.estilo{background:#4a3f1f}.epl-papel.no{background:#333}
.epl-efectos{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap}
.epl-efecto{background:#1f2c45;border:1px solid #2f4a78;border-radius:calc(var(--radio) * 6px);padding:4px 8px;font-size:11px;cursor:pointer}
.epl-efecto b{color:#8fb6f0;margin-right:4px}
.epl-efecto.usada{outline:2px solid #e0a94c}.epl-efecto.atenuada{opacity:.35}
/* 4 · línea de tiempo */
.epl-linea{display:flex;gap:4px;height:78px}
.epl-tomas-fila{position:relative;flex:1;height:100%;min-width:0}
.epl-tomab{position:absolute;top:0;bottom:0;box-sizing:border-box;border-radius:calc(var(--radio) * 6px);padding:5px 7px;cursor:pointer;overflow:hidden;color:#111;font-size:11px;line-height:1.25;border:2px solid transparent;
  display:flex;flex-direction:column;justify-content:space-between}
.epl-tomab-x{position:absolute;top:3px;right:3px;z-index:2;display:flex;align-items:center}
.epl-tomab-x .x{width:20px;height:20px;padding:0;border-radius:calc(var(--radio) * 50%);border:1px solid rgba(0,0,0,.55);background:rgba(15,17,22,.7);color:#fff;font-size:11px;cursor:pointer;line-height:1}
.epl-tomab-x .x:hover{background:#b33a3a}
.epl-tomab-x .pregunta{display:flex;align-items:center;gap:3px;background:rgba(15,17,22,.92);color:#fff;border:1px solid #fff;border-radius:calc(var(--radio) * 12px);padding:2px 4px 2px 8px;font-size:11px}
.epl-tomab-x .pregunta button{border:0;border-radius:calc(var(--radio) * 10px);padding:2px 8px;font-size:11px;cursor:pointer;color:#fff}
.epl-tomab-x .pregunta .si{background:#b33a3a}.epl-tomab-x .pregunta .no{background:#3a4658}
.epl-borde{position:absolute;top:-3px;bottom:-3px;width:12px;margin-left:-6px;cursor:col-resize;z-index:3;touch-action:none}
.epl-borde::after{content:"";position:absolute;left:5px;top:0;bottom:0;width:2px;background:rgba(255,255,255,.35)}
.epl-borde:hover::after,.epl-borde.arrastrando::after{background:#e0a94c;width:3px}
.epl-borde-et{display:none;position:absolute;bottom:100%;left:50%;transform:translateX(-50%);margin-bottom:4px;white-space:nowrap;background:#0f1217;color:#e0a94c;
  border:1px solid #e0a94c;border-radius:calc(var(--radio) * 4px);padding:1px 6px;font:11px ui-monospace,monospace}
.epl-borde.arrastrando .epl-borde-et{display:block}
.epl-pegar{display:inline-flex;align-items:center;gap:3px;margin-right:8px;cursor:pointer}
.epl-tomab.elegida{border-color:#fff;box-shadow:0 0 0 2px #e0a94c}
.epl-tomab b{font-size:12px}.epl-tomab span{opacity:.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.epl-mas{min-width:44px;width:44px;flex:none;border:1px dashed #3d4a5c;border-radius:calc(var(--radio) * 6px);color:#8a93a3;background:none;cursor:pointer;font-size:18px}
.epl-regla{display:flex;justify-content:space-between;color:#8a93a3;font-size:10px;margin-top:3px}
/* 4 · ventana de audio: el tramo (mismo largo que las tomas; el ▶ va debajo del +) y la canción entera en una línea */
.epl-audio{margin-top:6px}
.epl-audio-fila{display:flex;gap:4px;align-items:stretch}
.epl-onda{position:relative;flex:1;min-width:0;height:72px;border:1px solid #2e3440;border-radius:calc(var(--radio) * 6px);overflow:hidden}
.epl-onda-cv{display:block;width:100%;height:100%;cursor:grab;touch-action:none;outline:none}
.epl-onda-cv:active{cursor:grabbing}.epl-onda-cv:focus-visible{box-shadow:inset 0 0 0 1px #8fb6f0}
.epl-onda-et{position:absolute;top:3px;font:10px ui-monospace,monospace;color:#cfe0ff;background:rgba(15,18,23,.75);padding:0 4px;pointer-events:none}
.epl-onda-et.izq{left:4px}.epl-onda-et.der{right:4px}
.epl-play{width:44px;flex:none;background:#2f4a78;color:#fff;border:1px solid #3a5f9a;border-radius:calc(var(--radio) * 6px);cursor:pointer;font-size:18px}
.epl-play:hover{background:#3a5a90}
.epl-barra-fila{margin-top:5px;height:10px}
.epl-barra-cv{display:block;flex:1;min-width:0;height:10px;cursor:pointer;touch-action:none}
.epl-hueco{width:44px;flex:none}
.epl-audio-info{display:flex;gap:12px;justify-content:space-between;align-items:baseline;font:11px ui-monospace,monospace;color:#9aa3b2;margin-top:4px}
.epl-audio-info .epl-ayuda{font-family:inherit;margin:0;text-align:center;flex:1}
.epl-canciones{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:6px;max-height:60vh;overflow:auto;margin-top:6px}
.epl-cancion{cursor:pointer;border:1px solid #2e3440;padding:6px 8px;background:#15181e;overflow-wrap:anywhere}
.epl-cancion:hover{border-color:#e0a94c}.epl-cancion.actual{border-color:#5a8fd6;background:#1c2a40}
.epl-cancion b{display:block;font-size:12px;font-weight:600;color:#e3e7ee}.epl-cancion small{color:#8a93a3;font-size:11px}
.epl-soltar{min-height:240px;border:2px dashed #3d4a5c;padding:10px;cursor:pointer;display:flex;align-items:flex-start}
.epl-soltar>.epl-vacio{margin:auto;text-align:center}.epl-soltar .epl-fotos{flex:1}
.epl-modal.soltar{outline:3px dashed #e0a94c;outline-offset:-8px}
.epl-papel.efecto{background:#1f4a3a}
/* 5 · prompt final */
.epl-final{white-space:pre-wrap;word-break:break-word;font-family:ui-monospace,monospace;font-size:11.5px;line-height:1.45;
  background:#12151b;border:1px solid #2e3440;border-radius:calc(var(--radio) * 7px);padding:10px;margin:0;width:100%;box-sizing:border-box;
  max-height:52vh;min-height:160px;overflow:auto}
textarea.epl-final{min-height:40vh}
.epl-tag{background:#2b3a52;color:#cfe0ff;border-radius:calc(var(--radio) * 4px);padding:0 3px}
.epl-marca{color:#e0a94c;font-size:11px;border:1px solid #6d5527;border-radius:calc(var(--radio) * 6px);padding:1px 6px}
.epl-hl{outline:2px solid #e0a94c !important;background:#4a3a1a !important}
/* botones */
.epl-boton{background:#2f3947;color:#fff;border:1px solid #3d4a5c;border-radius:calc(var(--radio) * 6px);padding:5px 12px;cursor:pointer;font-size:12px}
.epl-boton:hover{background:#3a4658}.epl-boton.fuerte{background:#7a5a1c;border-color:#a47a2a}
/* colores lisos y opacos (sin degradados): verde = guardar y cerrar; azul = guardar y «Añadir (N)» */
.epl-boton.epl-verde{background:#2f6b3f;border-color:#3b7f4d;color:#fff}.epl-boton.epl-verde:hover{background:#367a48}
.epl-boton.epl-azul{background:#2f4f7a;border-color:#3b6090;color:#fff}.epl-boton.epl-azul:hover{background:#365a8a}
.epl-boton.epl-grande{padding:8px 18px;font-size:14px;font-weight:600}
.epl-boton:disabled{opacity:.45;cursor:default;pointer-events:none}
.epl-mini{background:#232833;color:#c9cfd9;border:1px solid #343b48;border-radius:calc(var(--radio) * 5px);padding:3px 8px;cursor:pointer;font-size:11px}
.epl-mini.fijo{background:#5a4515;border-color:#a47a2a}
.epl-x{background:none;border:0;color:#8a93a3;font-size:18px;cursor:pointer}
.epl-fila{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:6px 0}
/* ventanas sobre el editor: ficha de una referencia, cajita, biblioteca */
.epl-capa{position:absolute;inset:0;z-index:5;background:rgba(5,7,10,.72);display:flex;align-items:center;justify-content:center}
.epl-modal{width:min(1180px,94%);max-height:90%;overflow:auto;background:#191c22;border:1px solid #3d4a5c;border-radius:calc(var(--radio) * 10px);padding:14px;
  box-shadow:0 12px 40px rgba(0,0,0,.6)}
.epl-modal.izq{border-color:#a83a3a}.epl-modal.der{border-color:#2f4a78}
.epl-ficha{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(320px,1fr);gap:14px}
.epl-ficha .grande{position:relative;height:min(62vh,640px);border-radius:calc(var(--radio) * 8px);overflow:hidden;background:#0d1015}
.epl-ficha .grande>img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}
.epl-ficha .grande .fondo{position:absolute;inset:-20px;background-size:cover;background-position:center;filter:blur(18px) brightness(.4)}
.epl-ficha label{display:block;margin:6px 0 2px;color:#9aa3b2;font-size:12px}
.epl-ficha input:not([type=checkbox]):not(.corto),.epl-ficha textarea,.epl-ficha select{width:100%;box-sizing:border-box}
.epl-fotos{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;align-content:start}
.epl-fotos>div{position:relative;background:#12151b;border:1px solid #2e3440;border-radius:calc(var(--radio) * 8px);padding:6px;font-size:11px;word-break:break-all}
.epl-fotos img{width:100%;height:200px;object-fit:contain;display:block}
.epl-fotos .quitar{position:absolute;top:4px;right:4px}
.epl-fotos>div.elegida{border-color:#e0a94c}
.epl-elegir{--epl-tam:200px;display:grid;grid-template-columns:repeat(auto-fill,minmax(min(var(--epl-tam),100%),1fr));gap:8px;
  max-height:52vh;overflow:auto;margin-top:6px}
.epl-elegir>div{cursor:pointer;border:1px solid #2e3440;border-radius:calc(var(--radio) * 7px);padding:5px;background:#15181e;font-size:12px;line-height:1.3;
  color:#d7dbe2;overflow-wrap:anywhere}
.epl-elegir>div:hover{border-color:#e0a94c}.epl-elegir>div.si{border-color:#e0a94c;background:#3a2f18}
.epl-elegir img{width:100%;height:calc(var(--epl-tam) * 1.15);object-fit:contain;background:#0d1015;border-radius:calc(var(--radio) * 4px);display:block}
.epl-elegir .nombre,.epl-biblio-item .nombre{margin-top:4px}
.epl-tapar{border-top:1px solid #343b48;margin-top:8px;padding-top:4px}
.epl-tapar.encendido{border-top-color:#a47a2a}
.epl-tapar .epl-interruptor{font-size:12px;color:#e8edf5;cursor:pointer}
.epl-tapar-libre{flex:1;min-width:140px}
.epl-tapar-estado{white-space:pre-line}
.epl-tapar-previas{display:flex;gap:6px;flex-wrap:wrap}
.epl-tapar-previas img{max-height:180px;max-width:100%;object-fit:contain;border:1px solid #343b48}
.epl-propuesta{font-size:11px;color:#cfe0ff;background:#1c2738;border:1px solid #2b3a52;border-radius:calc(var(--radio) * 6px);padding:5px;margin-top:4px}
.epl-usada{font-size:11px;color:#8fb0e0;margin-top:6px}
.epl-biblio-rejilla{--epl-tam:270px;display:grid;grid-template-columns:repeat(auto-fill,minmax(min(var(--epl-tam),100%),1fr));gap:12px;margin-top:8px}
.epl-biblio-item{cursor:pointer;border:1px solid #2e3440;border-radius:calc(var(--radio) * 8px);padding:7px;background:#15181e;font-size:13px;line-height:1.3;
  color:#e3e7ee;overflow-wrap:anywhere}
.epl-biblio-item:hover{border-color:#e0a94c}
.epl-biblio-item img{width:100%;height:calc(var(--epl-tam) * 1.15);object-fit:contain;border-radius:calc(var(--radio) * 5px);background:#0d1015;display:block}
.epl-biblio-item small{color:#8a93a3;display:block;font-size:11px}
.epl-biblio-item{position:relative;border-width:2px}
.epl-biblio-item.marcada{border-color:#5a8fd6;background:#1c2a40;outline:2px solid #5a8fd6;outline-offset:-6px}
.epl-check{position:absolute;top:10px;right:10px;z-index:1;width:28px;height:28px;display:none;align-items:center;justify-content:center;
  background:#2f4f7a;color:#fff;border:2px solid #fff;font-size:16px;font-weight:bold;box-shadow:0 1px 4px rgba(0,0,0,.7)}
.epl-biblio-item.marcada .epl-check{display:flex}
.epl-biblio-pie{position:sticky;bottom:-14px;display:flex;align-items:center;justify-content:flex-end;gap:12px;margin:10px -14px -14px;
  padding:10px 14px;background:#191c22;border-top:1px solid #2e3440}
.epl-biblio-pie .epl-aviso{flex:1;margin:0;font-size:12px}
/* control de tamaño de los recuadros (− deslizador +) */
.epl-tam{display:inline-flex;align-items:center;gap:4px}
.epl-tam .epl-mini{min-width:28px;font-size:14px;padding:2px 6px}
.epl-tam-barra{width:110px;accent-color:#e0a94c}
/* la ✕ para quitar una tarjeta del Stack: arriba a la izquierda, siempre visible (también en pantallas táctiles) */
.epl-cruz{position:absolute;top:6px;left:6px;z-index:2;display:flex;align-items:center;gap:6px}
.epl-cruz .x{width:28px;height:28px;border-radius:calc(var(--radio) * 50%);border:2px solid #fff;background:rgba(15,17,22,.85);color:#fff;font-size:15px;
  line-height:1;font-weight:bold;cursor:pointer;padding:0;display:flex;align-items:center;justify-content:center;
  box-shadow:0 1px 4px rgba(0,0,0,.7)}
.epl-cruz .x:hover{background:#b33a3a}
.epl-cruz .pregunta{display:flex;align-items:center;gap:4px;background:rgba(15,17,22,.92);border:1px solid #fff;border-radius:calc(var(--radio) * 14px);
  padding:3px 4px 3px 9px;color:#fff;font-size:12px;box-shadow:0 1px 4px rgba(0,0,0,.7)}
.epl-cruz .pregunta button{border:0;border-radius:calc(var(--radio) * 10px);padding:3px 10px;font-size:12px;cursor:pointer;color:#fff}
.epl-cruz .pregunta .si{background:#b33a3a}.epl-cruz .pregunta .no{background:#3a4658}
`;
