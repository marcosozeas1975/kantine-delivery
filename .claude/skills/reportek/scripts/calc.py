"""ReporteK: agrega as vendas do dia por operação.
Funciona para um dia ou um periodo (todas as paginas do intervalo).
Opcional: --json-dir DIR grava um resumo por dia (DIR/AAAA-MM-DD.json) para o cache no banco da pagina.
Uso: python3 calc.py PRODUTOS_MATRIZ.json [--json-dir DIR] --m SESSOES_MATRIZ_p1.json [p2 ...] --v SESSOES_VINHEDOS_p1.json [...]
Os arquivos são as respostas salvas das ferramentas get_products e get_table_sessions (Takeat)."""
import json,re,sys,collections as C,datetime as dt
a=sys.argv[1:]
JD=None
if '--json-dir' in a: k=a.index('--json-dir'); JD=a[k+1]; del a[k:k+2]
prod=a[0]; i=a.index('--m'); j=a.index('--v')
mf=a[i+1:j]; vf=a[j+1:]
cats=json.load(open(prod))['items'][0]['categories']
NAT={p['id'] for c in cats if c['name'].strip()=='NATAL 2026' for p in c.get('products',[])}
def _load(fs):
  seen={}
  for f in fs:
    for x in json.load(open(f))['data']: seen[x['id']]=x  # remove duplicadas (paginas/janelas sobrepostas)
  return list(seen.values())
S={'M':_load(mf),'V':_load(vf)}
print('produtos NATAL 2026:',len(NAT),'| comandas Matriz:',len(S['M']),'| Vinhedos:',len(S['V']))
def isnat_name(n): s=n.strip(); return s.upper()==s and re.search(r'NATAL\s*$',s) is not None
CS_INI=dt.date(2026,11,6); CS_FIM=dt.date(2027,1,5)  # periodo do quiosque Center Shopping
def _nome_desc(n):
  """Nome do tipo de desconto: tira e-mail do operador, simbolos soltos nas pontas (" -", "]") e espacos extras."""
  n=re.sub(r'\S+@\S+','',n or '')
  n=re.sub(r'\s+',' ',n).strip(' -–—[]()._,;:/|')
  return n or 'sem descrição'
def loc(t): return dt.datetime.fromisoformat(t.replace('Z','+00:00'))-dt.timedelta(hours=3)
conf=[]
def proc(sess,split):
  ops=C.defaultdict(lambda:{'rev':0,'cmd':0,'items':C.Counter(),'rev_i':C.Counter(),'chan':C.Counter(),'pay':C.Counter(),'hour':C.Counter(),'day':C.Counter(),'daycmd':C.Counter(),'ppl':0,'last':None,'big':[],'canc':[],'disc':[],'nitems':0,'sess':[]})
  excl=[];incl_open=[]
  for s in sess:
    if s['status'] in ('canceled','transfer') or s['delivery_canceled_at']:
      excl.append((s['session_number'],s['status'],s['total_price']));continue
    paid=sum(float(p['payment_value']) for p in s['payments'])
    if s['status']=='open':
      if paid<=0: excl.append((s['session_number'],'open sem pagamento',s['total_price']));continue
      incl_open.append((s['session_number'],s['total_price'],paid))
    if float(s['total_price'] or 0)<=0 and paid<=0:
      excl.append((s['session_number'],'zerada sem pagamento',s['total_price']));continue  # Takeat nao conta comanda zerada
    lines=[]
    for bl in s['bills']:
      for b in bl['order_baskets']:
        bc=b['canceled_at'] or b['order_status']=='canceled'
        for o in b['orders']:
          pid=o['product']['id'];nm=o['product']['name']
          if bc or o['canceled_at']:
            ops['_canc']['canc'].append((s['session_number'],nm,o['total_price'],o['cancel_reason']));continue
          lines.append((pid,nm,float(o['amount']),float(o['total_price']),b['channel']))
    tot=float(s['total_price'] or 0); raw=sum(l[3] for l in lines)
    f= tot/raw if raw else 1
    tt=(s.get('table') or {}).get('table_type')
    # Regras iguais ao relatorio do Takeat (decisao de 26/11/2026):
    #  - iFood = qualquer pagamento com "iFood" no nome (Online, Cupom, Pagamento na Entrega)
    #  - iFood fatura o que foi pago, COM a taxa de entrega
    #  - Cashback Takeat e desconto, nao receita (limitado ao valor da comanda)
    isifood=any('ifood' in p['payment_method']['name'].lower() for p in s['payments'])
    fee=float(s['delivery_tax_price'] or 0) if isifood else 0.0
    cb=min(tot,sum(float(p['payment_value']) for p in s['payments'] if 'cashback' in p['payment_method']['name'].lower()))
    adj=fee-cb   # ajuste de sessao sobre o valor dos produtos
    ch='iFood' if isifood else {'table':'Mesa','balcony':'Balcão','delivery':'Delivery próprio'}.get(tt,tt)
    by=C.defaultdict(list)
    for l in lines:
      n=l[0] in NAT; nn=isnat_name(l[1])
      if split and (n!=nn): conf.append((l[1],'cat' if n else 'nome'))
      if not split and nn: conf.append((l[1],'Vinhedos'))
      d=loc(s['start_time']).date()
      inwin=CS_INI<=d<=CS_FIM
      op=('CS' if (n or nn) and inwin else 'M') if split else 'V'
      by[op].append(l)
    for op,ls in by.items():
      O=ops[op]; r=sum(l[3] for l in ls)*f
      share_=(sum(l[3] for l in ls)/raw) if raw else 1
      r+=adj*share_; O['taxa_ifood']=O.get('taxa_ifood',0)+fee*share_; O['cashback']=O.get('cashback',0)+cb*share_
      O['rev']+=r;O['cmd']+=1;O['chan'][ch]+=r;O.setdefault('chancnt',C.Counter())[ch]+=1;O['hour'][loc(s['start_time']).hour]+=r;dk=loc(s['start_time']).date().isoformat();O['day'][dk]+=r;O['daycmd'][dk]+=1
      O['sess'].append((s['session_number'],r,s))
      if op!='CS': O['ppl']+=float(s['people_at_table'] or 0)
      for l in ls: O['items'][l[1]]+=l[2];O['rev_i'][l[1]]+=l[3]*f;O['nitems']+=l[2]
      t=loc(s['start_time']); O['last']=max(O['last'] or t,t)
      if s['discount_total']: O['disc'].append((s['session_number'],float(s['discount_total']),s['discount_obs']))
    # payments: assign to ops proportionally
    for op,ls in by.items():
      share=(sum(l[3] for l in ls)/raw) if raw else 0
      for p in s['payments']: ops[op]['pay'][p['payment_method']['name']]+=float(p['payment_value'])*share
  return ops,excl,incl_open
OM,em,im=proc(S['M'],True); OV,ev,iv=proc(S['V'],False)
out={}
for nm,O in [('M',OM['M']),('CS',OM['CS']),('V',OV['V'])]:
  if not O['cmd']: print('==',nm,'sem vendas no periodo'); continue
  print('==',nm,round(O['rev'],2),O['cmd'],round(O['rev']/O['cmd'],2),'itens',O['nitems'],'ppl',O['ppl'],'last',O['last'],'| inclui taxa iFood',round(O.get('taxa_ifood',0),2),'| cashback descontado',round(O.get('cashback',0),2))
  print(' chan',{k:round(v,2) for k,v in O['chan'].most_common()})
  print(" chan_cnt",C.Counter(x[2].get("table",{}).get("table_type") if x[2].get("table") else None for x in O["sess"]))
  print(' pay',{k:round(v,2) for k,v in O['pay'].most_common()})
  print(' hour',{k:round(v) for k,v in sorted(O['hour'].items())})
  if len(O['day'])>1:
    print(' dias',{k:(round(v,2),O['daycmd'][k]) for k,v in sorted(O['day'].items())})
    print(' media/dia',round(O['rev']/len(O['day']),2),'| dias com venda',len(O['day']))
  print(' top',[(k,O['items'][k],round(v,2)) for k,v in O['rev_i'].most_common(40)])
  print(' disc',O['disc'])
  # descontos agrupados por tipo (nome do desconto, sem diferenciar maiusculas): qtd, total e media
  dg=C.OrderedDict()
  for d in O['disc']:
    k=_nome_desc(d[2]); g=dg.setdefault(k.lower(),[k,0,0.0]); g[1]+=1; g[2]+=d[1]
  dgl=sorted(dg.values(),key=lambda g:-g[2])
  print(' disc_grupos (total %.2f em %d)'%(sum(g[2] for g in dgl),sum(g[1] for g in dgl)),[(g[0],g[1],round(g[2],2),round(g[2]/g[1],2)) for g in dgl])
  big=sorted(O['sess'],key=lambda x:-x[1])[:3]; print(' big',[(b[0],round(b[1],2),b[2]['bills'][0]['buyer'] and b[2]['bills'][0]['buyer']['name']) for b in big])
print('canc M',OM['_canc']['canc']);print('canc V',OV['_canc']['canc'])
print('excl M',em,'open M',im);print('excl V',ev,'open V',iv)
print('conf',C.Counter(conf))


# ---------- cache: um resumo por dia, sem dados pessoais ----------
def resumo(O,dia_rev_total):
  r2=lambda x:round(x,2)
  grandes=[{'comanda':n,'valor':r2(v),'itens':[(o['amount'],o['product']['name']) for bl in ss['bills'] for b in bl['order_baskets'] for o in b['orders'] if not o['canceled_at']][:10],
            'desconto':ss['discount_obs'],'retirada':ss['scheduled_to']}
           for n,v,ss in O['sess'] if dia_rev_total and v>=0.10*dia_rev_total and v>=500]
  return {'faturamento':r2(O['rev']),'taxa_ifood_incluida':r2(O.get('taxa_ifood',0)),'cashback_descontado':r2(O.get('cashback',0)),'regra':'takeat-2026-11-26','comandas':O['cmd'],'itens':O['nitems'],'pessoas':O['ppl'],
    'ultima_comanda':O['last'].strftime('%H:%M') if O['last'] else None,
    'canais':{k:{'valor':r2(v),'comandas':O.get('chancnt',{}).get(k,0)} for k,v in O['chan'].items()},
    'pagamentos':{k:r2(v) for k,v in O['pay'].items()},
    'por_hora':{str(k):r2(v) for k,v in O['hour'].items()},
    'produtos':{k:{'qtd':O['items'][k],'valor':r2(v)} for k,v in O['rev_i'].items()},
    'descontos':[{'valor':d[1],'origem':(d[2] or '').strip()} for d in O['disc']],
    'pedidos_grandes':grandes}
if JD:
  import os; os.makedirs(JD,exist_ok=True)
  agora=dt.datetime.now(dt.timezone.utc)-dt.timedelta(hours=3)
  dias=sorted({loc(s['start_time']).date() for k in S for s in S[k]})
  for d in dias:
    conf.clear()
    sm=[s for s in S['M'] if loc(s['start_time']).date()==d]; sv=[s for s in S['V'] if loc(s['start_time']).date()==d]
    om,em_,im_=proc(sm,True); ov,ev_,iv_=proc(sv,False)
    doc={'data':d.isoformat(),'dia_fechado':agora.date()>d,'atualizado_em':agora.strftime('%Y-%m-%d %H:%M'),
         'operacoes':{}, 'cancelamentos':{'M':[{'item':c[1],'valor':float(c[2]),'motivo':c[3]} for c in om['_canc']['canc']],
                                          'V':[{'item':c[1],'valor':float(c[2]),'motivo':c[3]} for c in ov['_canc']['canc']]},
         'conferencia':[{'item':c[0],'tipo':c[1]} for c in conf]}
    for nm,O in [('M',om.get('M')),('CS',om.get('CS')),('V',ov.get('V'))]:
      if O: doc['operacoes'][nm]=resumo(O,O['rev'])
    json.dump(doc,open(os.path.join(JD,d.isoformat()+'.json'),'w'),ensure_ascii=False)
  print('cache: %d dia(s) gravados em %s'%(len(dias),JD))
