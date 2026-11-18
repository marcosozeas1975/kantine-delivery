"""MetaK: alvo diário de 2026 por loja e meta, pela curva de vendas de nov-dez/2025.
Entrada: data/vendas_2025.json (linhas {data, loja M|V, grupo, produto, qtd}, vendas do Takeat de 01/11 a 31/12/2025 sem cancelados).
Saída: {rows, meta} com uma linha por dia + loja + meta: data, ref_2025, operacao, grupo, alvo.
Regras aprovadas em 15/11/2026:
- metas gerais: 2.800 minis e 2.500 tradicionais e recheados (meta corrigida de 2.200 para 2.500 em 17/11/2026) (01/11 a 31/12/2026);
- Kantine Gastronomia = 85% da parte que a Matriz teve em 2025; o resto da meta vai 70% Center Shopping e 30% Vinhedos;
- Gastronomia e Vinhedos seguem a própria curva de 2025; Center Shopping segue a curva da Matriz;
- até 19/12 o dia de 2026 usa o mesmo dia da semana de 2025 (364 dias antes); de 20/12 a 31/12, a mesma data.
Uso: python3 curva2025.py data/vendas_2025.json SAIDA.json"""
import json, sys, collections as C, datetime as dt

METAS = {'Mini Kantitones': 2800, 'Tradicionais e recheados': 2500}
NOME = {'M': 'Kantine Gastronomia', 'V': 'Kantine Vinhedos', 'CS': 'Kantine Center Shopping'}
vendas = json.load(open(sys.argv[1]))
porDia, tot = C.defaultdict(C.Counter), C.Counter()
for r in vendas:
    porDia[(r['loja'], r['grupo'])][r['data']] += r['qtd']
    tot[(r['loja'], r['grupo'])] += r['qtd']

dias, d = [], dt.date(2026, 11, 1)
while d <= dt.date(2026, 12, 31):
    ref = d - dt.timedelta(364) if d <= dt.date(2026, 12, 19) else d.replace(year=2025)
    dias.append((d.isoformat(), ref.isoformat())); d += dt.timedelta(1)

rows = []
for g, meta in METAS.items():
    parteM = tot[('M', g)] / (tot[('M', g)] + tot[('V', g)])
    mGastro = meta * parteM * 0.85
    resto = meta - mGastro
    metaLoja = {'M': (mGastro, 'M'), 'CS': (resto * 0.70, 'M'), 'V': (resto * 0.30, 'V')}
    for loja, (m, curva) in metaLoja.items():
        pesos = [porDia[(curva, g)][ref] for _, ref in dias]
        T = sum(pesos)
        for (dia, ref), p in zip(dias, pesos):
            rows.append({'data': dia, 'ref_2025': ref, 'operacao': NOME[loja], 'grupo': g, 'alvo': round(m * p / T, 3)})

json.dump({'rows': rows, 'meta': [
    {'label': 'curva2025.py', 'value': open(__file__, encoding='utf-8').read(), 'type': 'code', 'lang': 'python'},
    {'label': 'Entrada', 'value': 'Vendas de Kantitones de 01/11 a 31/12/2025 no Takeat (lojas 40695 e 43896), sem cancelados'},
]}, open(sys.argv[2], 'w', encoding='utf-8'), ensure_ascii=False)
s = C.Counter()
for r in rows: s[(r['operacao'], r['grupo'])] += r['alvo']
for k, v in sorted(s.items()): print(k, round(v))
