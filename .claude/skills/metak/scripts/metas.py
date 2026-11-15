"""MetaK: vendas de Kantitones por dia, loja e produto, para o painel de metas.
Lê os resumos diários do ReporteK (um JSON por dia, com operacoes.{M,V,CS}.produtos.{nome: {qtd, valor}})
e grava {rows, meta} com uma linha por dia + operação + produto que conta para alguma meta.
Uso: python3 metas.py PASTA_DOS_DIAS SAIDA.json [INICIO AAAA-MM-DD]"""
import json, glob, os, re, sys, datetime as dt

INICIO = sys.argv[3] if len(sys.argv) > 3 else '2026-11-01'
OPS = {'M': 'Kantine Gastronomia', 'V': 'Kantine Vinhedos', 'CS': 'Kantine Center Shopping'}
FORA = re.compile(r'fatia|cobertura|meio|rabanada|bombom|tostad', re.I)
BASE = re.compile(r'kantitone|chocotone|panetone', re.I)

def grupo(nome):
    if FORA.search(nome) or not BASE.search(nome):
        return None
    return 'Mini Kantitones' if re.search(r'\bmini\b', nome, re.I) else 'Tradicionais e recheados'

rows, atualizado = [], None
for f in sorted(glob.glob(os.path.join(sys.argv[1], '*.json'))):
    d = json.load(open(f))
    data = d.get('data') or os.path.basename(f)[:10]
    if data < INICIO:
        continue
    atualizado = max(atualizado or '', d.get('atualizado_em') or '')
    for op, o in (d.get('operacoes') or {}).items():
        for nome, v in (o.get('produtos') or {}).items():
            g = grupo(nome)
            q = float(v.get('qtd') or 0)
            if g and q:
                rows.append({'data': data, 'operacao': OPS.get(op, op), 'grupo': g,
                             'produto': nome.strip(), 'qtd': q, 'faturamento': round(float(v.get('valor') or 0), 2)})

codigo = open(__file__, encoding='utf-8').read()
json.dump({'rows': rows, 'meta': [
    {'label': 'metas.py', 'value': codigo, 'type': 'code', 'lang': 'python'},
    {'label': 'Entrada', 'value': 'Resumos diários do ReporteK (vendas do Takeat, lojas 40695 e 43896), sem itens cancelados'},
    {'label': 'Início da contagem', 'value': INICIO},
    {'label': 'Última atualização dos dados', 'value': atualizado or ''},
]}, open(sys.argv[2], 'w', encoding='utf-8'), ensure_ascii=False)
print(len(rows), 'linhas;', 'atualizado', atualizado)
