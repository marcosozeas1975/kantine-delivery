"""EncomendaK: compara duas paginas do relatorio (por exemplo, a publicada pelo modo completo e a gerada pelo modo incremental).
Uso: python3 -I comparar.py PAGINA_A.html PAGINA_B.html
Ignora a hora de atualizacao e a secao "Mudancas". Imprime IDENTICO ou a lista de diferencas (cartoes e comandas).
Codigo de saida: 0 identico, 1 diferente."""
import re,sys,html

def limpar(h):
    h=re.sub(r'Atualizado em [^<]*','ATUALIZADO',h)
    h=re.sub(r'data-genl="[^"]*"','',h)
    h=re.sub(r'<h2>Mudanças desde a última atualização</h2><div class="sec">.*?</div>\s*(?=<h2>)','',h,flags=re.S)
    return h

def texto(x): return re.sub(r'\s+',' ',html.unescape(re.sub(r'<[^>]+>',' ',x))).strip()

def cartoes(h):
    return re.findall(r'<div class="kl">([^<]+)</div><div class="kv"[^>]*>(\d+)</div><div class="ks"[^>]*>([^<]+)',h)

def comandas(h):
    """Cada bloco de comanda: chave = (secao, dia, numero)."""
    out={}
    # abordagem simples e robusta: blocos .ord com numero e itens, tanto dos dias pendentes quanto do historico
    for m in re.finditer(r'<div class="ord"[^>]*data-un="(.)"[^>]*>(.*?)(?=<div class="ord"|</section>|</details>|<h2>|$)',h,flags=re.S):
        un,corpo=m.group(1),m.group(2)
        n=re.search(r'<span class="num">#(\d+)</span>',corpo)
        if not n: continue
        itens=sorted(re.findall(r'data-p="([^"]*)" data-q="([^"]*)" data-v="([^"]*)"',corpo))
        hora=re.search(r'<b>([^<]+)</b>',corpo)
        marc=sorted(set(re.findall(r'<span class="(?:ok|warn|bad|tag)">([^<]+)</span>',corpo)))
        chave=n.group(1)
        out.setdefault(chave,[]).append((un,hora.group(1) if hora else '',tuple(marc),tuple((p,float(q),float(v)) for p,q,v in itens)))
    return {k:sorted(v) for k,v in out.items()}

def main(a,b):
    A=limpar(open(a,encoding='utf-8').read()); B=limpar(open(b,encoding='utf-8').read())
    dif=[]
    ca,cb=cartoes(A),cartoes(B)
    if ca!=cb: dif.append(f'cartoes: {ca} x {cb}')
    ma,mb=comandas(A),comandas(B)
    for n in sorted(set(ma)|set(mb),key=int):
        if ma.get(n)!=mb.get(n):
            dif.append(f'#{n}: A={ma.get(n)} | B={mb.get(n)}')
    if not dif:
        print(f'IDENTICO ({len(ma)} comandas conferidas)'); return 0
    print(f'DIFERENTE: {len(dif)} diferenca(s)')
    for d in dif[:12]: print(' -',d[:400])
    return 1

if __name__=='__main__': sys.exit(main(sys.argv[1],sys.argv[2]))
