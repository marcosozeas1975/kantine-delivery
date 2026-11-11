"""ReporteK: anexa as avaliacoes do Takeat aos resumos diarios gerados por calc.py --json-dir.
Uso: python3 ratings.py AVALIACOES.txt PASTA_DIAS
AVALIACOES.txt: uma linha por avaliacao, sem nome nem telefone:
  LOJA MM-DD HH:MM MESA NOTA CRITERIOS [COMENTARIO]
  LOJA = M, V ou CS; hora local; CRITERIOS = 4 digitos comida/atendimento/preco/ambiente (ex. 5545) ou '-'
  O ano vem do nome dos arquivos da pasta."""
import json, os, sys, collections as C
arq, pasta = sys.argv[1], sys.argv[2]
K = ['comida', 'atendimento', 'preco', 'ambiente']
R = C.defaultdict(lambda: C.defaultdict(list))
for ln in open(arq, encoding='utf-8'):
    if not ln.strip(): continue
    p = ln.rstrip('\n').split(' ', 6)
    loja, md, hora, mesa, nota, cr = p[:6]
    R[md][loja].append((hora, mesa, int(nota), None if cr == '-' else [int(c) for c in cr], p[6].strip() if len(p) > 6 else ''))
n = 0
for f in sorted(os.listdir(pasta)):
    d = json.load(open(os.path.join(pasta, f))); av = {}
    for loja in ['M', 'V', 'CS']:
        L = R[d['data'][5:]].get(loja, [])
        if not L:
            if loja != 'CS': av[loja] = {'total': 0, 'media': None, 'criterios': {}, 'com_criterios': 0, 'abaixo_de_5': [], 'comentarios': []}
            continue
        wc = [x for x in L if x[3]]
        av[loja] = {'total': len(L), 'media': round(sum(x[2] for x in L) / len(L), 2),
            'criterios': {K[i]: round(sum(x[3][i] for x in wc) / len(wc), 2) for i in range(4)} if wc else {},
            'com_criterios': len(wc),
            'abaixo_de_5': [{'mesa': x[1], 'hora': x[0], 'nota': x[2], 'criterios_abaixo': {K[i]: x[3][i] for i in range(4) if x[3][i] < 5} if x[3] else {}}
                            for x in L if x[2] < 5 or (x[3] and min(x[3]) < 5)],
            'comentarios': [{'mesa': x[1], 'hora': x[0], 'nota': x[2], 'texto': x[4]} for x in L if x[4]]}
        n += len(L)
    d['avaliacoes'] = av
    json.dump(d, open(os.path.join(pasta, f), 'w'), ensure_ascii=False)
print('avaliacoes anexadas:', n)
