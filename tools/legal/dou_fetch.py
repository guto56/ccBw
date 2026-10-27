"""Baixa um ato do DOU (in.gov.br), salva o HTML bruto e o texto extraído da div texto-dou.
Uso: dou_fetch.py <url> <nome_base>  -> legal/sources/<nome_base>.html|.txt|.meta.json"""
import hashlib, html, json, re, subprocess, sys, datetime, os

SRC = os.path.join(os.path.dirname(__file__), "..", "..", "legal", "sources")

def extract(raw):
    m = re.search(r'<div class="texto-dou">(.*?)<p class="dou-paragraph"[^>]*>\s*Este conteúdo não substitui', raw, re.S)
    if not m:
        m = re.search(r'<div class="texto-dou">(.*?)</div>\s*</div>', raw, re.S)
    s = m.group(1) if m else ""
    s = re.sub(r"(?is)<(script|style).*?</\1>", "", s)
    s = re.sub(r"(?i)<(p|br|tr|li|h\d|div)[^>]*>", "\n", s)
    s = re.sub(r"<[^>]+>", "", s)
    s = html.unescape(s).replace("\xa0", " ")
    lines = [" ".join(l.split()) for l in s.split("\n")]
    return "\n".join(l for l in lines if l).strip() + "\n"

def main(url, base):
    raw = subprocess.run(["curl", "-sS", "-L", "-A", "Mozilla/5.0 (X11; Linux x86_64)", "--max-time", "90", url], capture_output=True).stdout
    txt = extract(raw.decode("utf-8", errors="replace"))
    if len(txt) < 200:
        print("FALHOU", url, len(txt)); sys.exit(1)
    open(os.path.join(SRC, base + ".html"), "wb").write(raw)
    open(os.path.join(SRC, base + ".txt"), "w", encoding="utf-8").write(txt)
    page = raw.decode("utf-8", errors="replace")
    pub = re.search(r'class="publicado-dou-data">([^<]+)', page)
    ed = re.search(r'class="edicao-dou-data">([^<]+)', page)
    pg = re.search(r'class="secao-dou-data">([^<]+)', page)
    meta = {"url": url, "acessado_em": datetime.date.today().isoformat(), "sha256_html": hashlib.sha256(raw).hexdigest(),
            "publicado_dou": pub.group(1).strip() if pub else None,
            "edicao_dou": ed.group(1).strip() if ed else None, "pagina_dou": pg.group(1).strip() if pg else None, "titulo": txt.split("\n", 1)[0]}
    json.dump(meta, open(os.path.join(SRC, base + ".meta.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print("OK", base, len(txt), meta["publicado_dou"], meta["titulo"][:90])

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
