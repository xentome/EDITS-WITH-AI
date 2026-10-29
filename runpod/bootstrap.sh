#!/usr/bin/env bash
# /post_start.sh de la plantilla de RunPod (va en base64 en la variable H3_BOOT): baja MAX EDITOR con git
# y lanza runpod/arranque.sh. Todo lo demás vive en el repo, así que la plantilla no cambia al cambiar el repo.
#   MAX_EDITOR_REPO / MAX_EDITOR_REF   de dónde clonar (por defecto el repo público, rama master)
#   H3_CODE                            desarrollo: el repo llega como git bundle por runpodctl send (h3pod up --plantilla)
# Lo que imprime va a los logs del contenedor con el prefijo [h3] y a /opt/max-editor.log.
R=/opt/max-editor
(
  echo "arranque ${H3_CODE:-${MAX_EDITOR_REPO:-github}}"
  command -v git >/dev/null || { apt-get update -qq && apt-get install -y -qq git >/dev/null; }
  if [ ! -d $R/.git ]; then
    if [ -n "${H3_CODE:-}" ]; then
      command -v runpodctl >/dev/null || {
        curl -sSL -o /usr/local/bin/runpodctl https://github.com/runpod/runpodctl/releases/download/v2.15.0/runpodctl-linux-amd64
        chmod +x /usr/local/bin/runpodctl; }
      mkdir -p /opt/recibido && cd /opt/recibido
      for i in 1 2 3; do runpodctl receive "$H3_CODE" > recibir.log 2>&1 && break; sleep 10; done
      tar -xzf envio.tgz && git clone -q repo.bundle $R || { echo "ERROR: no llego el repo"; cat recibir.log; exit 1; }
    else
      git clone -q --depth 1 --branch "${MAX_EDITOR_REF:-master}" "${MAX_EDITOR_REPO:-https://github.com/xentome/EDITS-WITH-AI}" $R ||
        { echo "ERROR: no se pudo clonar ${MAX_EDITOR_REPO:-https://github.com/xentome/EDITS-WITH-AI}"; exit 1; }
    fi
  fi
  bash $R/runpod/arranque.sh
) 2>&1 | sed -u 's/^/[h3] /' | tee -a /opt/max-editor.log &
