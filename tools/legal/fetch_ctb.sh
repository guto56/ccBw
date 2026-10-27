#!/usr/bin/env bash
# Baixa o CTB compilado do planalto.gov.br e converte para texto (descarta trechos tachados).
set -euo pipefail
cd "$(dirname "$0")/../.."
URL="https://www.planalto.gov.br/ccivil_03/leis/l9503compilado.htm"
curl -sS -L -A "Mozilla/5.0 (X11; Linux x86_64)" --max-time 120 -o legal/sources/ctb_l9503compilado.htm "$URL"
python3 -I tools/legal/html2text.py legal/sources/ctb_l9503compilado.htm legal/sources/ctb_l9503compilado.txt
python3 -I - "$URL" <<'PY'
import hashlib, json, sys, datetime
raw = open("legal/sources/ctb_l9503compilado.htm", "rb").read()
json.dump({"url": sys.argv[1], "acessado_em": datetime.date.today().isoformat(),
           "sha256_html": hashlib.sha256(raw).hexdigest(), "titulo": "Lei nº 9.503, de 23 de setembro de 1997 (texto compilado)"},
          open("legal/sources/ctb_l9503compilado.meta.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
PY
echo ok
