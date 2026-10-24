/* Estilos de la ventana del editor (la interfaz nueva, como la maqueta: maqueta/interfaz.html). Solo exporta el texto CSS
 * (lo pone editor_core.js). Rojo = lo que no cambia; azul = lo que se presta; dorado = lo que usa la toma elegida. */
export const CSS = `
.epl-fondo{position:fixed;inset:0;z-index:10000;background:rgba(8,10,14,.66);display:flex;align-items:center;justify-content:center;
  font-family:system-ui,sans-serif;font-size:13px}
.epl-caja{position:relative;width:98vw;height:96vh;display:flex;flex-direction:column;background:#191c22;color:#d7dbe2;
  border:1px solid #303642;border-radius:10px;box-shadow:0 24px 64px rgba(0,0,0,.55);overflow:hidden}
.epl-caja.ocupada .epl-boton,.epl-caja.ocupada .epl-mini,.epl-caja.ocupada .epl-mas{opacity:.45;pointer-events:none}
.epl-cabecera{display:flex;align-items:center;gap:12px;padding:8px 16px;border-bottom:1px solid #2a2f3a;background:#1e222a}
.epl-estado{flex:1;color:#8a93a3}.epl-estado.bien{color:#5fbf7f}.epl-estado.mal{color:#f07070}.epl-estado.trabajando{color:#e0a94c}
.epl-cuerpo{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:8px;padding:10px 2.5%}
.epl-sec{background:#15181e;border:1px solid #2e3440;border-radius:8px;padding:8px 10px;flex:none}
.epl-tit{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#8a93a3;margin-bottom:6px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.epl-tit .der{margin-left:auto;display:flex;gap:6px;align-items:center;text-transform:none;letter-spacing:0;flex-wrap:wrap}
.epl-ayuda{color:#7d8698;font-size:11px;margin:2px 0 6px}
.epl-aviso{color:#e0a94c;font-size:11px;margin:4px 0}
.epl-vacio{color:#8a93a3;font-style:italic;padding:4px 0}
.epl-sec input,.epl-sec textarea,.epl-sec select,.epl-modal input,.epl-modal textarea,.epl-modal select{background:#12151b;color:#d7dbe2;
  border:1px solid #2e3440;border-radius:5px;padding:4px 6px;font:inherit}
.epl-sec textarea,.epl-modal textarea{resize:vertical}
input.corto{width:70px}
/* 1 · historia general */
.epl-historia{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 14px}
.epl-ajustes{display:flex;flex-wrap:wrap;gap:10px;align-items:center;font-size:12px;color:#9aa3b2}
.epl-ajustes input.palabras{width:200px}
/* campos con candado */
.epl-campo{display:grid;grid-template-columns:86px minmax(0,1fr) 26px;align-items:start;gap:6px;margin:3px 0}
.epl-campo>span{color:#9aa3b2;padding-top:5px;font-size:12px}
.epl-campo.ancho{grid-template-columns:86px minmax(0,1fr)}
.epl-campo select,.epl-campo input,.epl-campo textarea{min-width:0;width:100%;box-sizing:border-box}
.epl-candado{background:none;border:0;cursor:pointer;font-size:13px;padding:1px 3px;opacity:.3;filter:grayscale(1)}
.epl-candado.fijo{opacity:1;filter:none;background:#5a4515;border-radius:5px}
.epl-marca-frase{margin:-2px 0 4px 92px}
/* 2 · prompt de la toma */
.epl-linea-toma{font-family:ui-monospace,monospace;font-size:12px;line-height:1.45;color:#cfe0ff;background:#12151b;border:1px solid #2e3440;
  border-radius:6px;padding:6px 8px;margin-bottom:8px;white-space:pre-wrap;word-break:break-word}
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
.epl-tile{position:relative;border:1px solid #2e3440;border-radius:9px;overflow:hidden;background:#12151b;cursor:pointer;min-height:0;
  transition:outline .1s,opacity .15s}
.epl-tile:hover{border-color:#5d6a80}
.epl-tile .fondo{position:absolute;inset:-14px;background-size:cover;background-position:center;filter:blur(14px) brightness(.45)}
.epl-tile>img{position:absolute;inset:4px 4px 34px 4px;width:calc(100% - 8px);height:calc(100% - 38px);object-fit:contain;display:block}
.epl-tile .mosaico{position:absolute;inset:4px 4px 34px 4px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));
  grid-template-rows:repeat(2,minmax(0,1fr));gap:3px}
.epl-tile .mosaico img{width:100%;height:100%;min-height:0;object-fit:contain;background:#0d1015;border-radius:4px}
.epl-tile .sinfoto{position:absolute;inset:4px 4px 34px;display:flex;align-items:center;justify-content:center;color:#7d8698}
.epl-tile .franja{position:absolute;left:0;right:0;bottom:0;background:linear-gradient(rgba(0,0,0,.55),rgba(0,0,0,.9));padding:4px 8px;
  font-size:12px;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.epl-tile .franja b{color:#cfe0ff}.epl-tile .franja small{color:#8a93a3;display:block;overflow:hidden;text-overflow:ellipsis}
.epl-insignia{position:absolute;top:8px;right:8px;background:#a83a3a;color:#fff;border-radius:10px;padding:1px 8px;font-size:11px}
.epl-mitad.der .epl-insignia{background:#2f4a78}
.epl-tile.usada{outline:2px solid #e0a94c;outline-offset:-1px}
.epl-tile.atenuada{opacity:.33}
.epl-tile.apagada{opacity:.45;filter:grayscale(.8)}
.epl-papel{font-size:10px;border-radius:5px;padding:0 5px;background:#2b3a52;color:#d7dbe2}
.epl-papel.personaje,.epl-papel.objeto,.epl-papel.lugar{background:#6a2a2a}
.epl-papel.pose{background:#3a2b52}.epl-papel.ropa{background:#1f4a5a}.epl-papel.estilo{background:#4a3f1f}.epl-papel.no{background:#333}
.epl-efectos{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap}
.epl-efecto{background:#1f2c45;border:1px solid #2f4a78;border-radius:6px;padding:4px 8px;font-size:11px;cursor:pointer}
.epl-efecto b{color:#8fb6f0;margin-right:4px}
.epl-efecto.usada{outline:2px solid #e0a94c}.epl-efecto.atenuada{opacity:.35}
/* 4 · línea de tiempo */
.epl-linea{display:flex;gap:4px;height:96px}
.epl-tomab{border-radius:6px;padding:5px 7px;cursor:pointer;overflow:hidden;color:#111;font-size:11px;line-height:1.25;border:2px solid transparent;
  min-width:34px;display:flex;flex-direction:column;justify-content:space-between}
.epl-tomab.elegida{border-color:#fff;box-shadow:0 0 0 2px #e0a94c}
.epl-tomab b{font-size:12px}.epl-tomab span{opacity:.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.epl-mas{min-width:44px;border:1px dashed #3d4a5c;border-radius:6px;color:#8a93a3;background:none;cursor:pointer;font-size:18px}
.epl-regla{display:flex;justify-content:space-between;color:#8a93a3;font-size:10px;margin-top:3px}
/* 5 · prompt final */
.epl-final{white-space:pre-wrap;word-break:break-word;font-family:ui-monospace,monospace;font-size:11.5px;line-height:1.45;
  background:#12151b;border:1px solid #2e3440;border-radius:7px;padding:10px;margin:0;width:100%;box-sizing:border-box;
  max-height:52vh;min-height:160px;overflow:auto}
textarea.epl-final{min-height:40vh}
.epl-tag{background:#2b3a52;color:#cfe0ff;border-radius:4px;padding:0 3px}
.epl-marca{color:#e0a94c;font-size:11px;border:1px solid #6d5527;border-radius:6px;padding:1px 6px}
.epl-hl{outline:2px solid #e0a94c !important;background:#4a3a1a !important}
/* botones */
.epl-boton{background:#2f3947;color:#fff;border:1px solid #3d4a5c;border-radius:6px;padding:5px 12px;cursor:pointer;font-size:12px}
.epl-boton:hover{background:#3a4658}.epl-boton.fuerte{background:#7a5a1c;border-color:#a47a2a}
.epl-mini{background:#232833;color:#c9cfd9;border:1px solid #343b48;border-radius:5px;padding:3px 8px;cursor:pointer;font-size:11px}
.epl-mini.fijo{background:#5a4515;border-color:#a47a2a}
.epl-x{background:none;border:0;color:#8a93a3;font-size:18px;cursor:pointer}
.epl-fila{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:6px 0}
/* ventanas sobre el editor: ficha de una referencia, cajita, biblioteca */
.epl-capa{position:absolute;inset:0;z-index:5;background:rgba(5,7,10,.72);display:flex;align-items:center;justify-content:center}
.epl-modal{width:min(1180px,94%);max-height:90%;overflow:auto;background:#191c22;border:1px solid #3d4a5c;border-radius:10px;padding:14px;
  box-shadow:0 12px 40px rgba(0,0,0,.6)}
.epl-modal.izq{border-color:#a83a3a}.epl-modal.der{border-color:#2f4a78}
.epl-ficha{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(320px,1fr);gap:14px}
.epl-ficha .grande{position:relative;height:min(62vh,640px);border-radius:8px;overflow:hidden;background:#0d1015}
.epl-ficha .grande>img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}
.epl-ficha .grande .fondo{position:absolute;inset:-20px;background-size:cover;background-position:center;filter:blur(18px) brightness(.4)}
.epl-ficha label{display:block;margin:6px 0 2px;color:#9aa3b2;font-size:12px}
.epl-ficha input:not([type=checkbox]):not(.corto),.epl-ficha textarea,.epl-ficha select{width:100%;box-sizing:border-box}
.epl-fotos{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;align-content:start}
.epl-fotos>div{position:relative;background:#12151b;border:1px solid #2e3440;border-radius:8px;padding:6px;font-size:11px;word-break:break-all}
.epl-fotos img{width:100%;height:200px;object-fit:contain;display:block}
.epl-fotos .quitar{position:absolute;top:4px;right:4px}
.epl-fotos>div.elegida{border-color:#e0a94c}
.epl-elegir{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px;max-height:38vh;overflow:auto;margin-top:6px}
.epl-elegir>div{cursor:pointer;border:1px solid #2e3440;border-radius:7px;padding:4px;background:#15181e;font-size:10px;word-break:break-all}
.epl-elegir>div:hover{border-color:#e0a94c}.epl-elegir>div.si{border-color:#e0a94c;background:#3a2f18}
.epl-elegir img{width:100%;height:110px;object-fit:contain;background:#0d1015;border-radius:4px}
.epl-propuesta{font-size:11px;color:#cfe0ff;background:#1c2738;border:1px solid #2b3a52;border-radius:6px;padding:5px;margin-top:4px}
.epl-usada{font-size:11px;color:#8fb0e0;margin-top:6px}
.epl-biblio-rejilla{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;margin-top:8px}
.epl-biblio-item{cursor:pointer;border:1px solid #2e3440;border-radius:7px;padding:6px;background:#15181e;font-size:11px;word-break:break-all}
.epl-biblio-item:hover{border-color:#e0a94c}.epl-biblio-item img{width:100%;height:120px;object-fit:contain;border-radius:5px;background:#0d1015}
.epl-biblio-item small{color:#7d8698;display:block}
`;
