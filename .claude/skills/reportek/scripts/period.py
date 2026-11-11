"""ReporteK: consolida um periodo a partir dos resumos diarios do cache (colecao `dias` do banco da pagina).
Uso: python3 period.py PASTA_COM_AAAA-MM-DD.json [AAAA-MM-DD_inicio AAAA-MM-DD_fim]
Le os arquivos salvos por `ArtifactData list ... out_dir` ou por `calc.py --json-dir`."""
import json, sys, glob, os, datetime as dt, collections as C
pasta = sys.argv[1]; ini = sys.argv[2] if len(sys.argv) > 2 else '0000'; fim = sys.argv[3] if len(sys.argv) > 3 else '9999'
docs = {}
for f in glob.glob(os.path.join(pasta, '**', '*.json'), recursive=True):
    d = json.load(open(f)); d = d.get('data_doc', d) if isinstance(d, dict) else d
    if isinstance(d, dict) and 'operacoes' in d and ini <= d['data'] <= fim: docs[d['data']] = d
SEM = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom']
NOME = {'M': 'Kantine Gastronomia', 'V': 'Kantine Vinhedos', 'CS': 'Kantine Center Shopping'}
print('dias no cache:', len(docs), '|', min(docs) if docs else '-', 'a', max(docs) if docs else '-')
for op in ['M', 'V', 'CS']:
    A = dict(rev=0, cmd=0, itens=0, ppl=0); chan = C.defaultdict(lambda: [0, 0]); pay = C.Counter(); prod = C.defaultdict(lambda: [0, 0])
    dia = {}; wd = C.defaultdict(list); grandes = []; desc = C.Counter()
    for k, d in sorted(docs.items()):
        o = d['operacoes'].get(op)
        if not o: continue
        A['rev'] += o['faturamento']; A['cmd'] += o['comandas']; A['itens'] += o['itens']; A['ppl'] += o['pessoas']
        for c, v in o['canais'].items(): chan[c][0] += v['valor']; chan[c][1] += v['comandas']
        for c, v in o['pagamentos'].items(): pay[c] += v
        for c, v in o['produtos'].items(): prod[c][0] += v['qtd']; prod[c][1] += v['valor']
        for x in o['descontos']: desc[x['origem'] or 'sem origem'] += x['valor']
        for g in o['pedidos_grandes']: grandes.append((k, g['valor'], g['itens'], g.get('retirada')))
        dia[k] = (round(o['faturamento'], 2), o['comandas'])
        wd[SEM[dt.date.fromisoformat(k).weekday()]].append(o['faturamento'])
    if not dia: continue
    n = len(dia); g = sum(x[1] for x in grandes)
    print('\n==', op, NOME[op], '| dias', n, '| faturamento', round(A['rev'], 2), '| comandas', A['cmd'], '| ticket', round(A['rev'] / max(A['cmd'], 1), 2),
          '| media/dia', round(A['rev'] / n, 2), '| itens', A['itens'], '| pessoas', A['ppl'])
    if grandes: print(' sem pedidos grandes:', round(A['rev'] - g, 2), 'em', A['cmd'] - len(grandes), 'comandas | pedidos grandes:', grandes)
    print(' dias', dia)
    best = max(dia, key=lambda k: dia[k][0]); worst = min(dia, key=lambda k: dia[k][0])
    print(' melhor', best, SEM[dt.date.fromisoformat(best).weekday()], dia[best][0], '| pior', worst, SEM[dt.date.fromisoformat(worst).weekday()], dia[worst][0])
    if n >= 14: print(' media por dia da semana', {s: round(sum(v) / len(v), 2) for s, v in wd.items()})
    print(' canais', {c: (round(v[0], 2), v[1]) for c, v in sorted(chan.items(), key=lambda x: -x[1][0])})
    print(' pagamentos', {c: round(v, 2) for c, v in pay.most_common()})
    print(' descontos', {c: round(v, 2) for c, v in desc.most_common()})
    print(' top', [(c, v[0], round(v[1], 2)) for c, v in sorted(prod.items(), key=lambda x: -x[1][1])[:25]])
for k, d in sorted(docs.items()):
    av = d.get('avaliacoes') or {}
    for loja, a in av.items():
        for x in a.get('abaixo_de_5', []) + a.get('comentarios', []): print(' avaliacao', k, loja, x)
    for loja, cs in d.get('cancelamentos', {}).items():
        for c in cs: print(' cancelado', k, loja, c)
    for c in d.get('conferencia', []): print(' conferencia', k, c)
pend = [k for k, d in docs.items() if not d.get('dia_fechado')]
if pend: print('\nATENCAO: dias gravados antes de fechar (buscar de novo):', pend)
