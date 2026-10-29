#!/usr/bin/env bash
# MAX EDITOR: lo que lanza «Instalar MAX EDITOR.desktop» (doble clic en la carpeta del repo): instala, pone «MAX EDITOR»
# en el menú de aplicaciones y deja la terminal abierta para leer el resultado.
cd "$(dirname "$(readlink -f "$0")")/../.." || exit 1
app/instalar.sh --escritorio
echo
read -r -p "Enter para cerrar / Enter to close "
