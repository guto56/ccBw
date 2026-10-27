"""Recalcula os metadados (data de publicação no DOU) a partir do HTML bruto já baixado."""
import glob, json, re, os
for meta_path in glob.glob(os.path.join(os.path.dirname(__file__), "..", "..", "legal", "sources", "contran_*.meta.json")):
    html_path = meta_path.replace(".meta.json", ".html")
    page = open(html_path, encoding="utf-8", errors="replace").read()
    meta = json.load(open(meta_path, encoding="utf-8"))
    for key, cls in (("publicado_dou", "publicado-dou-data"), ("edicao_dou", "edicao-dou-data"), ("pagina_dou", "secao-dou-data")):
        m = re.search(r'class="%s">([^<]+)' % cls, page)
        meta[key] = m.group(1).strip() if m else None
    json.dump(meta, open(meta_path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(os.path.basename(meta_path), meta["publicado_dou"], meta["edicao_dou"], meta["pagina_dou"])
