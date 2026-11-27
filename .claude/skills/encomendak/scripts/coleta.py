"""EncomendaK: coleta incremental. Extrai as comandas com agendamento (scheduled_to) das respostas salvas do Takeat
e mescla com o cache (um documento por loja e por dia de criacao).

Subcomandos (rode com python3 -I):

  extrair   --pm PRODUTOS_M.json --pv PRODUTOS_V.json --m SESSOES_M... --v SESSOES_V... --out DIR
            Gera DIR/<L>-<AAAA-MM-DD>.json (L = M Matriz, V Vinhedos), um por loja e dia de criacao que tenha comanda com
            agendamento. Documento: {"v":1,"loja","dia","pedidos":[...],"hash"}. Sem nome, telefone ou endereco de cliente.

  mesclar   --cache DIR_CACHE --novo DIR_NOVO --dias L:AAAA-MM-DD[..AAAA-MM-DD] ... --saida DIR [--mudancas ARQ.json]
            Para cada dia buscado (--dias), o documento novo SUBSTITUI o do cache; dia buscado sem comanda agendada apaga o
            documento do cache. Dias nao buscados ficam como estao. Gera em DIR: escrever/<doc>.json (novos ou alterados),
            apagar.txt (ids a apagar) e, com --mudancas, a lista de mudancas entre o cache e o novo.

  dias      --cache DIR_CACHE --hoje AAAA-MM-DD [--desde 2026-11-01] [--vivas 7] [--completo]
            Imprime os dias a buscar (L:AAAA-MM-DD, um por linha): janela A (3 ultimos dias de criacao, as duas lojas),
            janela B (dias de criacao das comandas vivas do cache) e, com --completo ou cache vazio, todos os dias desde --desde.

O dia de criacao e o dia local (America/Sao_Paulo, UTC-3) do start_time da comanda."""
import json,sys,os,glob,hashlib,datetime as dt

BRT=dt.timedelta(hours=3)
def loc(t): return dt.datetime.fromisoformat(t.replace('Z','+00:00')).replace(tzinfo=None)-BRT
def iso(d): return d.strftime('%Y-%m-%dT%H:%M')

def args(argv):
    a={};k=None
    for x in argv:
        if x.startswith('--'): k=x[2:]; a[k]=[]
        elif k: a[k].append(x)
    return a

def catmap(f):
    m={}
    for it in json.load(open(f))['items']:
        for c in it['categories']:
            for p in c.get('products',[]): m[p['id']]=c['name'].strip()
    return m

def registro(s,cm):
    """Comanda -> registro compacto, ou None se nao tem agendamento / itens. Mesma regra do encomendas.py."""
    if not s.get('scheduled_to'): return None
    canc = s['status']=='canceled' or bool(s.get('delivery_canceled_at'))
    def coletar(incluir_cancelados):
        out=[]
        for bl in s['bills']:
            for b in bl['order_baskets']:
                bc=bool(b['canceled_at']) or b['order_status']=='canceled'
                for o in b['orders']:
                    if not incluir_cancelados and (o['canceled_at'] or bc): continue
                    p=o['product']
                    out.append({'q':float(o['amount']),'nome':p['name'].strip(),'cat':cm.get(p['id'],'?'),'v':float(o['total_price'])})
        return out
    itens=coletar(False)
    if not itens and not canc: return None
    if canc and not itens: itens=coletar(True)
    return {
        'n':s['session_number'],'id':s['id'],
        'criada':iso(loc(s['start_time'])),'entrega':iso(loc(s['scheduled_to'])),
        'status':s['status'],'cancelada':canc,'retirada':bool(s.get('with_withdrawal')),
        'pago':round(sum(float(p['payment_value']) for p in s['payments']),2),
        'total':round(sum(i['v'] for i in itens),2),'itens':itens,
    }

def h(pedidos):
    return hashlib.sha1(json.dumps(pedidos,sort_keys=True,ensure_ascii=False).encode()).hexdigest()[:16]

def extrair(a):
    cm={'M':catmap(a['pm'][0]),'V':catmap(a['pv'][0])}
    docs={}
    vistos={}
    for L,fl in (('M',a.get('m',[])),('V',a.get('v',[]))):
        for f in fl:
            for s in json.load(open(f))['data']: vistos[(L,s['id'])]=s
    for (L,_),s in vistos.items():
        r=registro(s,cm[L])
        if r: docs.setdefault((L,r['criada'][:10]),[]).append(r)
    out=a['out'][0]; os.makedirs(out,exist_ok=True)
    for (L,dia),ps in sorted(docs.items()):
        ps.sort(key=lambda r:r['n'])
        json.dump({'v':1,'loja':L,'dia':dia,'pedidos':ps,'hash':h(ps)},open(f'{out}/{L}-{dia}.json','w'),ensure_ascii=False,indent=1)
    print(f'{len(vistos)} comandas lidas; {sum(len(p) for p in docs.values())} com agendamento em {len(docs)} documentos -> {out}')

def ler_dir(d):
    docs={}
    for f in glob.glob(os.path.join(d,'**','*.json'),recursive=True):
        x=json.load(open(f))
        if isinstance(x,dict) and 'pedidos' in x and 'loja' in x: docs[f"{x['loja']}-{x['dia']}"]=x
    return docs

def expandir_dias(specs):
    out=set()
    for sp in specs:
        L,rng=sp.split(':',1)
        if '..' in rng:
            a,b=[dt.date.fromisoformat(x) for x in rng.split('..')]
            d=a
            while d<=b: out.add(f'{L}-{d.isoformat()}'); d+=dt.timedelta(1)
        else: out.add(f'{L}-{rng}')
    return out

def assinatura(r):
    return json.dumps([[i['q'],i['nome'],i['cat'],i['v']] for i in r['itens']],ensure_ascii=False)

def diferencas(velho,novo,loja):
    """Mudancas de UMA comanda (dicts) entre o cache e a nova leitura."""
    m=[]
    if velho is None:
        m.append({'tipo':'nova','n':novo['n'],'loja':loja,'depois':f"entrega {novo['entrega']}, R$ {novo['total']:.2f}"}); return m
    if novo is None:
        m.append({'tipo':'removida','n':velho['n'],'loja':loja,'antes':f"entrega {velho['entrega']}, R$ {velho['total']:.2f}"}); return m
    if novo['cancelada'] and not velho['cancelada']: m.append({'tipo':'cancelada','n':novo['n'],'loja':loja})
    if (not novo['cancelada']) and velho['cancelada']: m.append({'tipo':'reativada','n':novo['n'],'loja':loja})
    if assinatura(velho)!=assinatura(novo):
        m.append({'tipo':'item','n':novo['n'],'loja':loja,
                  'antes':'; '.join(f"{i['q']:g}x {i['nome']}" for i in velho['itens']),
                  'depois':'; '.join(f"{i['q']:g}x {i['nome']}" for i in novo['itens'])})
    if velho['entrega']!=novo['entrega']: m.append({'tipo':'entrega','n':novo['n'],'loja':loja,'antes':velho['entrega'],'depois':novo['entrega']})
    if abs(velho['pago']-novo['pago'])>0.005: m.append({'tipo':'pago','n':novo['n'],'loja':loja,'antes':f"R$ {velho['pago']:.2f}",'depois':f"R$ {novo['pago']:.2f}"})
    if velho['retirada']!=novo['retirada']: m.append({'tipo':'tipo','n':novo['n'],'loja':loja,'antes':'retirada' if velho['retirada'] else 'entrega','depois':'retirada' if novo['retirada'] else 'entrega'})
    return m

def mesclar(a):
    cache=ler_dir(a['cache'][0]); novo=ler_dir(a['novo'][0]); buscados=expandir_dias(a['dias'])
    saida=a['saida'][0]; os.makedirs(saida+'/escrever',exist_ok=True)
    escrever=[];apagar=[];mud=[]
    for doc_id in sorted(buscados):
        L=doc_id[0]
        velho=cache.get(doc_id); nv=novo.get(doc_id)
        vp={r['n']:r for r in (velho['pedidos'] if velho else [])}
        np_={r['n']:r for r in (nv['pedidos'] if nv else [])}
        for n in sorted(set(vp)|set(np_)): mud+=diferencas(vp.get(n),np_.get(n),L)
        if nv is None:
            if velho is not None: apagar.append(doc_id)
        elif velho is None or velho.get('hash')!=nv['hash']:
            escrever.append(doc_id); json.dump(nv,open(f'{saida}/escrever/{doc_id}.json','w'),ensure_ascii=False)
    open(saida+'/apagar.txt','w').write('\n'.join(apagar))
    if 'mudancas' in a: json.dump(mud,open(a['mudancas'][0],'w'),ensure_ascii=False,indent=1)
    print(f'buscados {len(buscados)} dias | escrever {len(escrever)} | apagar {len(apagar)} | mudancas {len(mud)}')
    for d in escrever: print(' escrever',d)
    for d in apagar: print(' apagar',d)

def dias(a):
    hoje=dt.date.fromisoformat(a['hoje'][0]); desde=dt.date.fromisoformat(a.get('desde',['2026-11-01'])[0])
    vivas=int(a.get('vivas',['7'])[0]); cache=ler_dir(a['cache'][0]) if 'cache' in a else {}
    sel=set()
    if 'completo' in a or not cache:
        d=desde
        while d<=hoje:
            for L in 'MV': sel.add(f'{L}-{d.isoformat()}')
            d+=dt.timedelta(1)
    else:
        for k in range(3):  # janela A: hoje e os 2 dias anteriores, nas duas lojas
            d=hoje-dt.timedelta(k)
            for L in 'MV': sel.add(f'{L}-{d.isoformat()}')
        for doc_id,doc in cache.items():  # janela B: dias de criacao das comandas vivas
            for r in doc['pedidos']:
                ent=dt.date.fromisoformat(r['entrega'][:10])
                # viva = nao cancelada e (entrega de hoje em diante, entregue nos ultimos N dias, ou comanda ainda aberta)
                viva=(not r['cancelada']) and (ent>=hoje-dt.timedelta(vivas) or r['status']=='open')
                if viva: sel.add(doc_id)
    for x in sorted(sel,key=lambda z:(z[2:],z[0])): print(x.replace('-',':',1))

if __name__=='__main__':
    cmd=sys.argv[1]; a=args(sys.argv[2:])
    {'extrair':extrair,'mesclar':mesclar,'dias':dias}[cmd](a)
