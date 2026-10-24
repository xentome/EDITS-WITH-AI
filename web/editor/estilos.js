/* Estilos de la ventana del editor. Solo exporta el texto CSS (lo pone editor_core.js). */
export const CSS = `
.epl-fondo{position:fixed;inset:0;z-index:10000;background:rgba(8,10,14,.62);display:flex;align-items:center;justify-content:center;
  font-family:system-ui,sans-serif;font-size:13px}
.epl-caja{position:relative;width:min(1880px,97vw);height:min(1000px,94vh);display:flex;flex-direction:column;background:#191c22;color:#d7dbe2;
  border:1px solid #303642;border-radius:10px;box-shadow:0 24px 64px rgba(0,0,0,.55);overflow:hidden}
.epl-caja.ocupada .epl-boton,.epl-caja.ocupada .epl-mini{opacity:.45;pointer-events:none}
.epl-cabecera{display:flex;align-items:center;gap:12px;padding:10px 16px;border-bottom:1px solid #2a2f3a;background:#1e222a}
.epl-estado{flex:1;color:#8a93a3}.epl-estado.bien{color:#5fbf7f}.epl-estado.mal{color:#f07070}.epl-estado.trabajando{color:#e0a94c}
.epl-cuerpo{flex:1;display:grid;grid-template-columns:320px minmax(0,1.15fr) minmax(0,1fr);min-height:0}
.epl-col{overflow:auto;padding:10px 14px;border-right:1px solid #2a2f3a}
.epl-col h3{margin:4px 0 6px;font-size:14px}
.epl-ayuda{color:#7d8698;font-size:11px;margin:2px 0 8px}
.epl-aviso{color:#e0a94c;font-size:11px;margin:4px 0}
.epl-ref{display:grid;grid-template-columns:64px 1fr;gap:8px;padding:7px;margin-bottom:7px;border:1px solid #2e3440;border-radius:7px;background:#15181e}
.epl-ref img{width:64px;height:84px;object-fit:cover;border-radius:5px;background:#0d1015}
.epl-ref select,.epl-ref input,.epl-ref textarea{width:100%;box-sizing:border-box;margin-top:3px}
.epl-reftit{font-size:12px;word-break:break-all}
.epl-usada{font-size:11px;color:#8fb0e0;margin-top:3px}
.epl-ref.apagada{opacity:.5}
.epl-stack{margin:3px 0;gap:8px;font-size:11px}.epl-stack input.corto{width:60px}
.epl-biblio{position:absolute;inset:60px 40px 40px 40px;z-index:5;background:#191c22;border:1px solid #3d4a5c;border-radius:10px;padding:14px;overflow:auto;box-shadow:0 12px 40px rgba(0,0,0,.6)}
.epl-biblio input{background:#12151b;color:#d7dbe2;border:1px solid #2e3440;border-radius:5px;padding:4px 6px;flex:1}
.epl-biblio-rejilla{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px}
.epl-biblio-item{cursor:pointer;border:1px solid #2e3440;border-radius:7px;padding:6px;background:#15181e;font-size:11px;word-break:break-all}
.epl-biblio-item:hover{border-color:#e0a94c}.epl-biblio-item img{width:100%;height:120px;object-fit:cover;border-radius:5px;background:#0d1015}
.epl-biblio-item small{color:#7d8698;display:block}
.epl-marca-frase{margin:-2px 0 4px 92px}
.epl-propuesta{font-size:11px;color:#cfe0ff;background:#1c2738;border:1px solid #2b3a52;border-radius:6px;padding:5px;margin-top:4px}
.epl-col input,.epl-col textarea,.epl-col select{background:#12151b;color:#d7dbe2;border:1px solid #2e3440;border-radius:5px;padding:4px 6px;font:inherit}
.epl-col textarea{resize:vertical}
.epl-campo{display:grid;grid-template-columns:86px 1fr 26px;align-items:start;gap:6px;margin:3px 0}
.epl-campo>span{color:#9aa3b2;padding-top:5px;font-size:12px}
.epl-campo.ancho{grid-template-columns:86px 1fr}
.epl-fila{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:6px 0}
.epl-fila input.corto{width:70px}
.epl-dos{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:0 10px}
.epl-dos .epl-campo{grid-template-columns:70px minmax(0,1fr) 26px}
.epl-campo select,.epl-campo input,.epl-campo textarea{min-width:0;width:100%;box-sizing:border-box}
.epl-bloque{padding:8px;border:1px solid #2e3440;border-radius:7px;background:#15181e;margin-bottom:6px}
.epl-toma{padding:8px;border:1px solid #2e3440;border-radius:7px;background:#15181e;margin:8px 0}
.epl-tomatit{display:flex;justify-content:space-between;align-items:center;margin-bottom:4px}
.epl-candado{background:none;border:0;cursor:pointer;font-size:13px;padding:1px 3px;opacity:.3;filter:grayscale(1)}
.epl-candado.fijo{opacity:1;filter:none;background:#5a4515;border-radius:5px}
.epl-boton{background:#2f3947;color:#fff;border:1px solid #3d4a5c;border-radius:6px;padding:6px 12px;cursor:pointer}
.epl-boton:hover{background:#3a4658}
.epl-mini{background:#232833;color:#c9cfd9;border:1px solid #343b48;border-radius:5px;padding:3px 8px;cursor:pointer;font-size:11px}
.epl-x{background:none;border:0;color:#8a93a3;font-size:18px;cursor:pointer}
.epl-final{white-space:pre-wrap;word-break:break-word;font-family:ui-monospace,monospace;font-size:11.5px;line-height:1.45;
  background:#12151b;border:1px solid #2e3440;border-radius:7px;padding:10px;margin:0;width:100%;box-sizing:border-box;min-height:70vh}
.epl-tag{background:#2b3a52;color:#cfe0ff;border-radius:4px;padding:0 3px}
.epl-marca{color:#e0a94c;font-size:11px;border:1px solid #6d5527;border-radius:6px;padding:1px 6px}
.epl-hl{outline:2px solid #e0a94c !important;background:#4a3a1a !important}
`;
