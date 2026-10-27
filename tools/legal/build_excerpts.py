"""Gera legal/excerpts.json a partir de legal/excerpts.spec.json e dos textos oficiais em legal/sources.

Cada trecho guarda o texto literal do dispositivo, estruturado em caput, parágrafos, incisos e
alíneas, com URL, data de acesso e hash SHA-256 do arquivo bruto baixado.

No texto do planalto.gov.br, as notas editoriais entre parênteses ("Redação dada pela Lei...",
"Incluído pela Lei...", "Vigência", "Vide...") são removidas: não fazem parte do dispositivo.
O texto tachado (redação revogada) já foi descartado na conversão HTML -> texto.
"""
import json
import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
LEGAL = os.path.join(ROOT, "legal")
SOURCES = os.path.join(LEGAL, "sources")

ANNOTATIONS = [
    re.compile(r"\(\s*(?:Redação\s+dada|Incluíd[oa]|Renumerad[oa]|Acrescid[oa])\b[^()]*?de\s+\d{4}\s*\)?"),
    re.compile(r"\(\s*Vigência\s*\)"),
    re.compile(r"\(\s*Vide\b[^()]*\)"),
]

# Um marcador (§, inciso, alínea, sanção) só abre um novo dispositivo quando vem depois de pontuação
# final (. ; : ou parêntese), ou depois de "; e" / "; ou" que encerram o item anterior. Assim, remissões no meio do texto ("no § 1º deste artigo") não quebram o trecho.

MARKERS = re.compile(
    r"(?:(?<=[.;:)])|(?<=; e)|(?<=; ou))\s+(?=(?:§\s*\d+(?:º|o)?(?:-[A-Z])?(?:[\s.]|$))"
    r"|(?:Parágrafo\s+único\.)"
    r"|(?:[IVXL]+\s*-\s)"
    r"|(?:[a-z]\)\s)"
    r"|(?:(?:Infração|Penalidade|Medida\s+administrativa)\s*-\s))"
)


def clean(text, norma):
    text = " ".join(text.split())
    if norma == "CTB":
        for rx in ANNOTATIONS:
            text = rx.sub(" ", text)
        text = " ".join(text.split())
    text = re.sub(r"§\s+(\d)", r"§ \1", text)
    text = re.sub(r"\s+([;:.,])", r"\1", text)
    return text.strip()


def unit_kind(seg):
    if re.match(r"§\s*\d", seg):
        num = re.match(r"§\s*(\d+)(?:º|o)?(-[A-Z])?", seg)
        return "paragrafo", num.group(1) + (num.group(2) or "")
    if seg.startswith("Parágrafo único"):
        return "paragrafo", "unico"
    m = re.match(r"([IVXL]+)\s*-\s", seg)
    if m:
        return "inciso", m.group(1)
    m = re.match(r"([a-z])\)\s", seg)
    if m:
        return "alinea", m.group(1)
    m = re.match(r"(Infração|Penalidade|Medida\s+administrativa)\s*-\s", seg)
    if m:
        return "sancao", m.group(1).lower().split()[0]
    return "caput", None


def structure(text):
    segs = [s.strip() for s in MARKERS.split(text) if s.strip()]
    units = []
    current_par = None
    current_inc = None
    for i, seg in enumerate(segs):
        kind, key = unit_kind(seg)
        if i == 0 or kind == "caput":
            if units and kind == "caput":
                # continuação de texto sem marcador: anexa ao último nó
                target = current_inc or current_par or units[0]
                target["texto"] += " " + seg
                continue
            node = {"tipo": "caput", "chave": "caput", "texto": seg, "filhos": []}
            units.append(node)
            current_par, current_inc = None, None
            continue
        node = {"tipo": kind, "chave": key, "texto": seg, "filhos": []}
        if kind == "paragrafo":
            units.append(node)
            current_par, current_inc = node, None
        elif kind == "inciso":
            parent = current_par or units[0]
            parent["filhos"].append(node)
            current_inc = node
        elif kind == "alinea":
            parent = current_inc or current_par or units[0]
            parent["filhos"].append(node)
        else:  # sancao
            parent = current_par or units[0]
            parent["filhos"].append(node)
    return units


def flatten(units):
    out = []
    for u in units:
        out.append(u["texto"])
        for c in u["filhos"]:
            out.append(c["texto"])
            for g in c["filhos"]:
                out.append(g["texto"])
    return "\n".join(out)


def load_source(name):
    lines = open(os.path.join(SOURCES, name + ".txt"), encoding="utf-8").read().split("\n")
    meta = json.load(open(os.path.join(SOURCES, name + ".meta.json"), encoding="utf-8"))
    return lines, meta


def cut(lines, start, end):
    s = next((i for i, l in enumerate(lines) if re.search(start, l)), None)
    if s is None:
        raise SystemExit("início não encontrado: " + start)
    e = next((i for i in range(s + 1, len(lines)) if re.search(end, lines[i])), None)
    if e is None:
        raise SystemExit("fim não encontrado: " + end)
    return "\n".join(lines[s:e])


def main():
    spec = json.load(open(os.path.join(LEGAL, "excerpts.spec.json"), encoding="utf-8"))
    normas = {n["id"]: n for n in spec["normas"]}
    cache = {}
    out = {"gerado_por": "tools/legal/build_excerpts.py", "normas": [], "excerpts": []}
    for n in spec["normas"]:
        lines, meta = load_source(n["fonte"])
        cache[n["fonte"]] = lines
        out["normas"].append({**n, "fonte": {k: meta.get(k) for k in ("url", "acessado_em", "sha256_html", "titulo", "publicado_dou", "edicao_dou", "pagina_dou")}})
    for ex in spec["excerpts"]:
        norma = normas[ex["norma"]]
        if norma["status"] != "baixado":
            raise SystemExit("trecho de norma pendente: " + ex["id"])
        raw = cut(cache[norma["fonte"]], ex["start"], ex["end"])
        text = clean(raw, ex["norma"])
        units = structure(text)
        meta = next(x for x in out["normas"] if x["id"] == ex["norma"])["fonte"]
        out["excerpts"].append({
            "id": ex["id"],
            "norma": ex["norma"],
            "artigo": ex["artigo"],
            "texto": flatten(units),
            "estrutura": units,
            "fonte_url": meta["url"],
            "acessado_em": meta["acessado_em"],
            "sha256_fonte": meta["sha256_html"],
            "status": "baixado",
        })
    dst = os.path.join(LEGAL, "excerpts.json")
    json.dump(out, open(dst, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("excerpts:", len(out["excerpts"]), "->", os.path.relpath(dst, ROOT))


if __name__ == "__main__":
    sys.exit(main())
