"""Busca atos no Diário Oficial da União (in.gov.br) e lista título, data e URL."""
import json, re, subprocess, sys, urllib.parse

def search(q, extra=""):
    url = "https://www.in.gov.br/consulta/-/buscar/dou?" + urllib.parse.urlencode({"q": q, "s": "todos", "exactDate": "all", "sortType": "0"}) + extra
    html = subprocess.run(["curl", "-sS", "-L", "-A", "Mozilla/5.0 (X11; Linux x86_64)", "--max-time", "60", url], capture_output=True, text=True).stdout
    m = re.search(r'<script id="_br_com_seatecnologia_in_buscadou_BuscaDouPortlet_params" type="application/json">(.*?)</script>', html, re.S)
    if not m:
        print("sem resultados parseáveis"); return
    data = json.loads(m.group(1))
    for it in data.get("jsonArray", []):
        print(it.get("pubDate"), "|", it.get("artType"), "|", it.get("title"), "|", "https://www.in.gov.br/web/dou/-/" + it.get("urlTitle", ""))

if __name__ == "__main__":
    search(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "")
