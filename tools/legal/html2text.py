"""Converte HTML do planalto.gov.br em texto, descartando trechos tachados (<strike>/<s>/<del>),
que no planalto indicam redação revogada ou alterada."""
import sys
from html.parser import HTMLParser

DROP = {"strike", "s", "del", "script", "style", "head"}
BLOCK = {"p", "br", "div", "tr", "li", "h1", "h2", "h3", "h4", "table", "blockquote"}

class P(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.depth = 0
        self.out = []
    def handle_starttag(self, tag, attrs):
        if tag in DROP:
            self.depth += 1
        elif tag in BLOCK:
            self.out.append("\n")
    def handle_endtag(self, tag):
        if tag in DROP:
            self.depth = max(0, self.depth - 1)
        elif tag in BLOCK:
            self.out.append("\n")
    def handle_startendtag(self, tag, attrs):
        if tag in BLOCK:
            self.out.append("\n")
    def handle_data(self, data):
        if self.depth == 0:
            self.out.append(data)

def main(src, dst, enc):
    raw = open(src, "rb").read().decode(enc, errors="replace")
    p = P()
    p.feed(raw)
    text = "".join(p.out)
    lines = [" ".join(l.split()) for l in text.split("\n")]
    res, blank = [], False
    for l in lines:
        if not l:
            if not blank:
                res.append("")
            blank = True
        else:
            res.append(l)
            blank = False
    open(dst, "w", encoding="utf-8").write("\n".join(res).strip() + "\n")

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else "windows-1252")
