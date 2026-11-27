"""EncomendaK: gera o HTML do relatorio de encomendas com agendamento (campo scheduled_to).
Dois modos de entrada:
  (a) cache (coleta incremental): --cache-dir DIR [--mudancas ARQ.json], com os documentos do cache (ver coleta.py);
  (b) respostas salvas do Takeat (modo completo), como abaixo.
Uso (modo b): python3 encomendas.py --today AAAA-MM-DD --since AAAA-MM-DD --out ARQ.html \
       --pm PRODUTOS_MATRIZ.json --pv PRODUTOS_VINHEDOS.json \
       --m SESSOES_M_p1.json [p2 ...] --v SESSOES_V_p1.json [...]
Os arquivos sao as respostas salvas de get_products / get_table_sessions (Takeat).
Nao grava nome nem telefone de cliente."""
import json,sys,html,datetime as dt,collections as C
a=sys.argv[1:]
def opt(k,default=None):
    if k in a:
        i=a.index(k); return a[i+1]
    return default
def lst(k):
    if k not in a: return []
    i=a.index(k)+1; r=[]
    while i<len(a) and not a[i].startswith('--'): r.append(a[i]); i+=1
    return r
TODAY=dt.date.fromisoformat(opt('--today')); SINCE=dt.date.fromisoformat(opt('--since','2026-11-01'))
OUT=opt('--out','encomendas.html')
def catmap(f):
    m={}
    for it in json.load(open(f))['items']:
        for c in it['categories']:
            for p in c.get('products',[]): m[p['id']]=c['name'].strip()
    return m
CACHE=opt('--cache-dir')
CM={'M':catmap(opt('--pm')),'V':catmap(opt('--pv'))} if not CACHE else {}
S={'M':{},'V':{}}
for k,fl in (('M',lst('--m')),('V',lst('--v'))):
    for f in fl:
        for s in json.load(open(f))['data']: S[k][s['id']]=s
# Excecoes manuais de unidade: (loja, numero da comanda) -> unidade ('M' Matriz, 'V' Vinhedos, 'S' Site).
# #4722: produto da loja lançado por engano na categoria Site Kantine (pedido do usuário em 27/11/2026).
EXCECOES={('M',4722):'M'}
def loc(t): return dt.datetime.fromisoformat(t.replace('Z','+00:00')).replace(tzinfo=None)-dt.timedelta(hours=3)
NAT_KW=('kantitone','chocotone','panetone','gingerbread','natal','tora de')
def grupo(name,cat):
    n=name.lower().strip()
    for pre in ('site - ','site '):  # produtos da categoria Site Kantine ganharam o prefixo 'Site - ' em 27/11/2026
        if n.startswith(pre): n=n[len(pre):]; break
    if cat=='Sobremesas de Natal': return 'Sobremesas de Natal'
    if cat in ('NATAL','NATAL 2026','KANTITONES') or any(k in n for k in NAT_KW): return 'Natal'
    if cat=='REVENDA': return 'Revenda'
    if cat=='BOLOS E SOBREMESAS' or (cat=='Site Kantine' and any(k in n for k in ('bolo','cheesecake','merengue','torta'))): return 'Bolos e sobremesas'
    if cat in ('PÂTISSERIE FRANCESA & SOBREMESAS','CHOCOLATES E MACARONS','LE PETITS (Miniaturas)') or 'macaron' in n: return 'Doces e pâtisserie'
    if cat=='PARA PRESENTEAR': return 'Cestas e presentes'
    if n.startswith(('bolo ','bolo\xa0')) or ' bolo ' in n or n.startswith(('cheesecake','merengue','torta ')): return 'Bolos e sobremesas'
    return 'Outros'
GORD=['Natal','Sobremesas de Natal','Bolos e sobremesas','Doces e pâtisserie','Cestas e presentes','Revenda','Outros']
UN={'M':'Matriz','V':'Vinhedos','S':'Site'}
rows=[];conf=[]
if CACHE:
    import glob,os
    for f in sorted(glob.glob(os.path.join(CACHE,'**','*.json'),recursive=True)):
        doc=json.load(open(f))
        if not (isinstance(doc,dict) and 'pedidos' in doc and 'loja' in doc): continue
        k=doc['loja']
        for r in doc['pedidos']:
            items=[dict(q=float(i['q']),n=i['nome'],cat=i['cat'],g=grupo(i['nome'],i['cat']),v=float(i['v'])) for i in r['itens']]
            un='S' if any(i['cat']=='Site Kantine' for i in items) else k
            un=EXCECOES.get((k,r['n']),un)
            for i in items:
                if i['cat']=='?': conf.append(f"Comanda {r['n']}: produto sem categoria ({i['n']})")
            rows.append(dict(num=r['n'],un=un,when=dt.datetime.fromisoformat(r['entrega']),canc=r['cancelada'],status=r['status'],ret=r['retirada'],
                items=items,total=float(r['total']),paid=float(r['pago']),created=dt.datetime.fromisoformat(r['criada'])))
for k in ('M','V'):
    for s in S[k].values():
        if not s['scheduled_to']: continue
        canc = s['status'] in ('canceled',) or bool(s['delivery_canceled_at'])
        items=[]
        for bl in s['bills']:
            for b in bl['order_baskets']:
                bc=bool(b['canceled_at']) or b['order_status']=='canceled'
                for o in b['orders']:
                    if o['canceled_at'] or bc: continue
                    p=o['product']; cat=CM[k].get(p['id'],'?')
                    items.append(dict(q=float(o['amount']),n=p['name'].strip(),cat=cat,g=grupo(p['name'],cat),v=float(o['total_price'])))
        if not items and not canc: continue
        if canc and not items:
            for bl in s['bills']:
                for b in bl['order_baskets']:
                    for o in b['orders']:
                        p=o['product']; cat=CM[k].get(p['id'],'?')
                        items.append(dict(q=float(o['amount']),n=p['name'].strip(),cat=cat,g=grupo(p['name'],cat),v=float(o['total_price'])))
        un='S' if any(i['cat']=='Site Kantine' for i in items) else k
        un=EXCECOES.get((k,s['session_number']),un)
        for i in items:
            if i['cat']=='?': conf.append(f"Comanda {s['session_number']}: produto sem categoria ({i['n']})")
        when=loc(s['scheduled_to']); paid=sum(float(p['payment_value']) for p in s['payments'])
        tot=sum(i['v'] for i in items)
        rows.append(dict(num=s['session_number'],un=un,when=when,canc=canc,status=s['status'],ret=bool(s['with_withdrawal']),
            items=items,total=tot,paid=paid,created=loc(s['start_time'])))
MUD=opt('--mudancas')
MUD_H=''
if MUD:
    _t={'nova':'comanda nova','cancelada':'cancelada','reativada':'reativada','item':'item trocado','entrega':'data/hora de entrega mudou','pago':'valor pago mudou','tipo':'retirada/entrega mudou','removida':'comanda removida'}
    _lj={'M':'Matriz','V':'Vinhedos'}
    _l=json.load(open(MUD))
    _li=''.join('<li><b>#%s</b> (%s): %s%s</li>'%(html.escape(str(m['n'])),_lj.get(m['loja'],m['loja']),_t.get(m['tipo'],m['tipo']),
        (' — '+html.escape(str(m.get('antes','')))+' → '+html.escape(str(m.get('depois',''))) if m.get('antes') and m.get('depois') else (' — '+html.escape(str(m.get('depois') or m.get('antes'))) if (m.get('depois') or m.get('antes')) else ''))) for m in _l)
    MUD_H='<h2>Mudanças desde a última atualização</h2><div class="sec">'+('<ul>'+_li+'</ul>' if _li else '<p class="empty">Nenhuma mudança.</p>')+'</div>'
rows.sort(key=lambda r:(r['when'],r['num']))
for r in rows:
    r['pend']=(not r['canc']) and r['when'].date()>=TODAY
    if (not r['canc']) and r['when'].date()<TODAY and r['status']=='open': conf.append(f"Comanda {r['num']}: entrega de {r['when']:%d/%m} já passou e a comanda segue aberta")
    if r['pend'] and r['paid']<=0: conf.append(f"Comanda {r['num']}: encomenda pendente sem pagamento registrado")
pend=[r for r in rows if r['pend']]; hist=[r for r in rows if (not r['pend']) and not r['canc'] and r['when'].date()>=SINCE or ((not r['pend']) and not r['canc'])]
canc=[r for r in rows if r['canc']]
hist=[r for r in rows if not r['pend'] and not r['canc']]
E=lambda x:html.escape(str(x))
def brl(v): return 'R$ '+f'{v:,.2f}'.replace(',','X').replace('.',',').replace('X','.')
def q(v): return str(int(v)) if float(v).is_integer() else str(v)
DOW=['segunda','terça','quarta','quinta','sexta','sábado','domingo']
def dlabel(d):
    return f"{DOW[d.weekday()]}, {d:%d/%m}"
# ---------- agregados
def tot(rs): return sum(r['total'] for r in rs)
hoje=[r for r in pend if r['when'].date()==TODAY]; amanha=[r for r in pend if r['when'].date()==TODAY+dt.timedelta(1)]
prox7=[r for r in pend if r['when'].date()<=TODAY+dt.timedelta(7)]
def kpi(l,v,s='',i=''): return f'<div class="kpi"><div class="kl">{E(l)}</div><div class="kv" id="kv-{i}">{v}</div><div class="ks" id="ks-{i}">{s}</div></div>'
def chip(u): return f'<span class="chip u{u}">{UN[u]}</span>'
def item_lines(r,g=None):
    return ''.join(f'<div class="it"><b>{q(i["q"])}×</b> {E(i["n"])}</div>' for i in r['items'] if g is None or i['g']==g)
def pend_day(d):
    rs=[r for r in pend if r['when'].date()==d]
    cats=C.defaultdict(lambda:C.defaultdict(float)); cv=C.defaultdict(float)
    for r in rs:
        for i in r['items']: cats[i['g']][i['n']]+=i['q']; cv[i['g']]+=i['v']
    out=f'<section class="day" data-day="{d}"><h3><span class="dl">{E(dlabel(d))}</span> <span class="sub">{len(rs)} encomenda{"s" if len(rs)!=1 else ""} · {brl(tot(rs))}</span> <span class="sub dq"></span></h3>'
    for g in GORD:
        gr=[(r,[i for i in r['items'] if i['g']==g]) for r in rs]; gr=[(r,it) for r,it in gr if it]
        if not gr: continue
        prod=', '.join(f'{q(v)}× {E(n)}' for n,v in sorted(cats[g].items(),key=lambda x:-x[1]))
        out+=f'<div class="cat"><div class="catt"><span class="cn">{E(g)}</span><span class="cv">{brl(cv[g])}</span></div><div class="prod">Produzir: <span class="pl">{prod}</span></div>'
        for r,it in sorted(gr,key=lambda x:x[0]['when']):
            pg='<span class="ok">pago</span>' if r['paid']>=r['total']-0.01 else ('<span class="warn">parcial</span>' if r['paid']>0 else '<span class="bad">sem pgto</span>')
            out+=(f'<div class="ord" data-un="{r["un"]}"><div class="oh"><b>{r["when"]:%H:%M}</b> {chip(r["un"])} <span class="num">#{r["num"]}</span>'
                  f'<span class="tag">{"Retirada" if r["ret"] else "Entrega"}</span>{pg}</div>'
                  +''.join(f'<div class="it" data-g="{E(i["g"])}" data-p="{E(i["n"])}" data-q="{i["q"]}" data-v="{i["v"]}"><b>{q(i["q"])}×</b> {E(i["n"])} <span class="iv">{brl(i["v"])}</span></div>' for i in it)+'</div>')
        out+='</div>'
    return out+'</section>'
days=sorted({r['when'].date() for r in pend})
pend_html=''.join(pend_day(d) for d in days) or '<p class="empty">Nenhuma encomenda pendente de entrega.</p>'
# visao por unidade
def unit_card(u):
    ps=[r for r in pend if r['un']==u]; hs=[r for r in hist if r['un']==u]; cs=[r for r in canc if r['un']==u]
    cat=C.defaultdict(lambda:[0.0,0.0])
    for r in ps+hs:
        for i in r['items']: cat[i['g']][0]+=i['q']; cat[i['g']][1]+=i['v']
    mx=max([v[1] for v in cat.values()] or [1])
    bars=''.join(f'<div class="bar"><span class="bl">{E(g)}</span><span class="bt"><i style="width:{max(2,cat[g][1]/mx*100):.0f}%"></i></span><span class="bv">{brl(cat[g][1])}</span></div>' for g in GORD if g in cat)
    note='' if (ps or hs or cs) else '<p class="empty">Sem encomendas agendadas no período.</p>'
    return (f'<div class="ucard u{u}"><h3>{UN[u]}</h3><div class="ug"><div><div class="kl">Pendentes</div><div class="kv">{len(ps)}</div><div class="ks">{brl(tot(ps))}</div></div>'
            f'<div><div class="kl">Já entregues</div><div class="kv">{len(hs)}</div><div class="ks">{brl(tot(hs))}</div></div>'
            f'<div><div class="kl">Canceladas</div><div class="kv">{len(cs)}</div><div class="ks">&nbsp;</div></div></div>{bars}{note}</div>')
units=''.join(unit_card(u) for u in ('M','V','S'))
# historico
hd=collections=None
hh=''
byday=C.defaultdict(list)
for r in sorted(hist,key=lambda r:r['when'],reverse=True): byday[r['when'].date()].append(r)
for d,rs in byday.items():
    hh+=f'<details data-day="{d}"><summary>{E(DOW[d.weekday()])}, {d:%d/%m} · {len(rs)} encomenda{"s" if len(rs)!=1 else ""} · {brl(tot(rs))}</summary>'
    for r in rs:
        hh+=f'<div class="ord" data-un="{r["un"]}"><div class="oh"><b>{r["when"]:%H:%M}</b> {chip(r["un"])} <span class="num">#{r["num"]}</span><span class="tag">{"Retirada" if r["ret"] else "Entrega"}</span></div>'+''.join(f'<div class="it" data-g="{E(i["g"])}" data-p="{E(i["n"])}" data-q="{i["q"]}" data-v="{i["v"]}"><b>{q(i["q"])}×</b> {E(i["n"])} <span class="tg">{E(i["g"])}</span> <span class="iv">{brl(i["v"])}</span></div>' for i in r['items'])+'</div>'
    hh+='</details>'
hh=hh or '<p class="empty">Nenhuma encomenda entregue no período.</p>'
ch=''.join(f'<div class="ord canc"><div class="oh"><b>{r["when"]:%d/%m %H:%M}</b> {chip(r["un"])} <span class="num">#{r["num"]}</span></div>'+''.join(f'<div class="it">{q(i["q"])}× {E(i["n"])} <span class="iv">{brl(i["v"])}</span></div>' for i in r['items'])+'</div>' for r in sorted(canc,key=lambda r:r['when'],reverse=True))
# resumo por categoria x unidade (pendentes + entregues)
mat=C.defaultdict(lambda:C.defaultdict(float))
for r in pend+hist:
    for i in r['items']: mat[i['g']][r['un']]+=i['v']
th=''.join(f'<tr><td>{E(g)}</td>'+''.join(f'<td>{brl(mat[g][u]) if mat[g][u] else "–"}</td>' for u in 'MVS')+f'<td><b>{brl(sum(mat[g].values()))}</b></td></tr>' for g in GORD if g in mat)
conf_h=''.join(f'<li>{E(c)}</li>' for c in dict.fromkeys(conf)) or '<li>Nenhuma inconsistência encontrada.</li>'
now=dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)-dt.timedelta(hours=3)
CSS_EXTRA=r'''.filters2{display:flex;gap:10px;flex-wrap:wrap;align-items:end;margin:0 0 14px}.filters2 label{display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--mu);min-width:0}.filters2 input{font:inherit;font-size:14px;padding:6px 8px;border:1px solid var(--ln);border-radius:8px;background:var(--card);color:var(--tx);min-width:0}.filters2 select{font:inherit;font-size:14px;padding:7px 8px;border:1px solid var(--ln);border-radius:8px;background:var(--card);color:var(--tx);max-width:100%;min-width:0}#fx{border:1px solid var(--ln);background:var(--card);color:var(--tx);padding:7px 13px;border-radius:8px;font:inherit;font-size:14px;cursor:pointer}.fsum{background:var(--card);border:1px solid var(--ln);border-radius:12px;padding:12px 16px;margin-bottom:12px}.fsum table td:first-child{text-align:left}#fpr{border:1px solid var(--tx);background:var(--tx);color:var(--bg);padding:7px 13px;border-radius:8px;font:inherit;font-size:14px;cursor:pointer}.fl{display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--mu);min-width:0}.ms{position:relative}.ms summary{list-style:none;cursor:pointer;font-size:14px;color:var(--tx);padding:7px 10px;border:1px solid var(--ln);border-radius:8px;background:var(--card);min-width:150px;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ms summary::-webkit-details-marker{display:none}.ms summary::after{content:"▾";float:right;margin-left:8px;color:var(--mu)}.msp{position:absolute;z-index:5;top:100%;left:0;margin-top:4px;min-width:260px;max-width:min(340px,86vw);background:var(--card);border:1px solid var(--ln);border-radius:10px;padding:8px;box-shadow:0 6px 24px rgba(0,0,0,.18)}.msp input[type=search]{width:100%;margin-bottom:6px}.msl{max-height:260px;overflow:auto;display:flex;flex-direction:column;gap:2px}.msl label{display:flex;gap:8px;align-items:center;font-size:14px;color:var(--tx);padding:4px 2px;cursor:pointer}.filters2 .msl label{flex-direction:row;font-size:14px;color:var(--tx)}.msl input{accent-color:var(--tx);flex:none}#mp .msp{left:auto;right:0}.msp{max-width:calc(100vw - 32px)!important;width:300px}.mst{display:flex;justify-content:space-between;gap:8px;font-size:12px;margin-bottom:4px}.mst button{border:0;background:none;color:var(--mu);cursor:pointer;text-decoration:underline;font:inherit;padding:0}.day.past{opacity:.6}.stale{margin:8px 0 0;color:var(--warn)!important;font-weight:600}.dq{font-weight:700;color:var(--tx)}
'''
JS=r'''<script>
(function(){var ST={u:'',g:[],p:[],f:'',t:''},mcl=document.getElementById('mcl'),mpl=document.getElementById('mpl'),mcs=document.getElementById('mcs'),mps=document.getElementById('mps'),fps=document.getElementById('fps'),sum=document.getElementById('fsum');
var items=[].slice.call(document.querySelectorAll('.it[data-g]'));
function uniq(a){return a.filter(function(x,i){return a.indexOf(x)===i}).sort(function(a,b){return a.localeCompare(b,'pt-BR')})}
function lab(sel,all,one){return sel.length?(sel.length===1?sel[0]:sel.length+' selecionados'):all}
function mk(box,vals,sel,cb){box.innerHTML='';var t=document.createElement('div');t.className='mst';var x=document.createElement('button');x.type='button';x.textContent='Limpar seleção';x.onclick=function(){cb([])};t.appendChild(x);box.appendChild(t);
vals.forEach(function(v){var l=document.createElement('label'),c=document.createElement('input');c.type='checkbox';c.value=v;c.checked=sel.indexOf(v)>-1;c.onchange=function(){var cur=[].slice.call(box.querySelectorAll('input:checked')).map(function(e){return e.value});cb(cur)};var sp=document.createElement('span');sp.textContent=v;l.appendChild(c);l.appendChild(sp);box.appendChild(l)})}
function fillC(){mk(mcl,uniq(items.map(function(i){return i.dataset.g})),ST.g,function(sel){ST.g=sel;
fillC();fillP();apply()});mcs.textContent=lab(ST.g,'Todas')}
function fillP(){var q=(fps.value||'').toLowerCase();var all=uniq(items.filter(function(i){return !ST.g.length||ST.g.indexOf(i.dataset.g)>-1}).map(function(i){return i.dataset.p}));ST.p=ST.p.filter(function(n){return all.indexOf(n)>-1});
var vals=all.filter(function(n){return !q||n.toLowerCase().indexOf(q)>-1||ST.p.indexOf(n)>-1});mk(mpl,vals,ST.p,function(sel){ST.p=sel;fillP();apply()});mps.textContent=lab(ST.p,'Todos')}
function brl(v){return 'R$ '+v.toFixed(2).replace('.',',').replace(/\B(?=(\d{3})+(?!\d))/g,'.')}
function fmtDay(d){var x=d.split('-');return x[2]+'/'+x[1]}
function apply(){var act=ST.g.length||ST.p.length||ST.f||ST.t,days={},PR={};
document.querySelectorAll('.ord[data-un]').forEach(function(o){var uok=!ST.u||o.dataset.un===ST.u,vis=0;
o.querySelectorAll('.it[data-g]').forEach(function(i){var hd=i.closest('[data-day]'),dd=hd?hd.dataset.day:'';var ok=uok&&(!ST.g.length||ST.g.indexOf(i.dataset.g)>-1)&&(!ST.p.length||ST.p.indexOf(i.dataset.p)>-1)&&(!ST.f||dd>=ST.f)&&(!ST.t||dd<=ST.t);i.style.display=ok?'':'none';if(ok){vis++;PR[i.dataset.p]=PR[i.dataset.p]||{q:0,v:0,g:i.dataset.g};PR[i.dataset.p].q+=parseFloat(i.dataset.q);PR[i.dataset.p].v+=parseFloat(i.dataset.v);var h=i.closest('[data-day]');if(h){var d=h.dataset.day,pend=h.classList.contains('day');var k=d+(pend?'P':'H');days[k]=days[k]||{d:d,pend:pend,q:0,v:0};days[k].q+=parseFloat(i.dataset.q);days[k].v+=parseFloat(i.dataset.v)}}});
o.style.display=(uok&&vis)?'':'none'});
document.querySelectorAll('.cat').forEach(function(c){var vis=[].slice.call(c.querySelectorAll('.ord[data-un]')).filter(function(o){return o.style.display!=='none'});c.style.display=vis.length?'':'none';
var m={};vis.forEach(function(o){o.querySelectorAll('.it[data-g]').forEach(function(i){if(i.style.display!=='none'){m[i.dataset.p]=(m[i.dataset.p]||0)+parseFloat(i.dataset.q)}})});
var pl=c.querySelector('.pl');if(pl){pl.textContent=Object.keys(m).sort(function(a,b){return m[b]-m[a]}).map(function(n){return m[n]+'× '+n}).join(', ')}});
document.querySelectorAll('.day').forEach(function(d){var vis=[].slice.call(d.querySelectorAll('.cat')).filter(function(c){return c.style.display!=='none'});d.style.display=vis.length?'':'none';
var dq=d.querySelector('.dq'),k=d.dataset.day+'P';dq.textContent=(act&&days[k])?('· filtro: '+days[k].q+' un · '+brl(days[k].v)):''});
document.querySelectorAll('details[data-day]').forEach(function(d){var vis=[].some.call(d.querySelectorAll('.ord[data-un]'),function(o){return o.style.display!=='none'});d.style.display=vis?'':'none'});
if(act){var ks=Object.keys(days).sort(),tq=0,tv=0,h='<b>'+(ST.p.join(', ')||ST.g.join(', ')||'Todos os produtos')+'</b>'+((ST.f||ST.t)?' <span class="sub">'+(ST.f?fmtDay(ST.f):'início')+' a '+(ST.t?fmtDay(ST.t):'fim')+'</span>':'')+(ST.p.length&&ST.g.length?' <span class="sub">'+ST.g.join(', ')+'</span>':'')+'<div style="overflow-x:auto"><table><tr><th>Dia</th><th>Situação</th><th>Qtd</th><th>Valor</th></tr>';
ks.forEach(function(k){var x=days[k];tq+=x.q;tv+=x.v;h+='<tr><td>'+fmtDay(x.d)+'</td><td>'+(x.pend?'pendente':'entregue')+'</td><td>'+x.q+'</td><td>'+brl(x.v)+'</td></tr>'});
h+='<tr><td><b>Total</b></td><td></td><td><b>'+tq+'</b></td><td><b>'+brl(tv)+'</b></td></tr></table></div>';var pk2=Object.keys(PR);if(pk2.length>1){h+='<div style="overflow-x:auto;margin-top:10px"><table><tr><th>Produto</th><th>Categoria</th><th>Qtd</th><th>Valor</th></tr>';pk2.sort(function(a,b){return PR[b].q-PR[a].q}).forEach(function(k){h+='<tr><td>'+esc(k)+'</td><td>'+esc(PR[k].g)+'</td><td>'+PR[k].q+'</td><td>'+brl(PR[k].v)+'</td></tr>'});h+='</table></div>'}sum.innerHTML=ks.length?h:'Nenhuma encomenda com esse filtro.';sum.hidden=false}else{sum.hidden=true}}

function esc(x){return String(x).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function dlab(d){var dt=new Date(d+'T12:00:00');return dt.toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'2-digit',year:'numeric'})}
function buildPrint(){var P={},H={},tot={};
document.querySelectorAll('.it[data-g]').forEach(function(i){if(i.style.display==='none')return;var o=i.closest('.ord'),h=i.closest('[data-day]');if(!o||!h)return;var pend=h.classList.contains('day'),d=h.dataset.day,T=pend?P:H;
var b=o.querySelector('.oh b'),n=o.querySelector('.num'),c=o.querySelector('.chip'),t=o.querySelector('.tag');
(T[d]=T[d]||[]).push({h:b?b.textContent:'',u:c?c.textContent:'',n:n?n.textContent:'',t:t?t.textContent:'',q:parseFloat(i.dataset.q),v:parseFloat(i.dataset.v),g:i.dataset.g,p:i.dataset.p});
var k=i.dataset.p;tot[k]=tot[k]||{q:0,v:0,g:i.dataset.g};tot[k].q+=parseFloat(i.dataset.q);tot[k].v+=parseFloat(i.dataset.v)});
function sec(T,title,desc){var ks=Object.keys(T).sort();if(desc)ks.reverse();if(!ks.length)return '';var h='<h2>'+title+'</h2>';
ks.forEach(function(d){var rs=T[d].sort(function(a,b){return a.h<b.h?-1:a.h>b.h?1:0}),q=0,v=0;
h+='<h3>'+esc(dlab(d))+'</h3><table><thead><tr><th>Hora</th><th>Unid.</th><th>Comanda</th><th class="r">Qtd</th><th>Produto</th><th>Categoria</th><th>Tipo</th><th class="r">Valor</th></tr></thead><tbody>';
rs.forEach(function(r){q+=r.q;v+=r.v;h+='<tr><td>'+esc(r.h)+'</td><td>'+esc(r.u)+'</td><td>'+esc(r.n)+'</td><td class="r"><b>'+r.q+'</b></td><td>'+esc(r.p)+'</td><td>'+esc(r.g)+'</td><td>'+esc(r.t)+'</td><td class="r">'+brl(r.v)+'</td></tr>'});
h+='<tr class="st"><td colspan="3">Subtotal do dia</td><td class="r">'+q+'</td><td colspan="3"></td><td class="r">'+brl(v)+'</td></tr></tbody></table>'});return h}
var fl=[],ub=document.querySelector('#f button.on');if(ST.u)fl.push('Unidade: '+ub.textContent);if(ST.g.length)fl.push('Categoria: '+ST.g.join(', '));if(ST.p.length)fl.push('Produto: '+ST.p.join(', '));if(ST.f||ST.t)fl.push('Período: '+(ST.f?fmtDay(ST.f):'início')+' a '+(ST.t?fmtDay(ST.t):'fim'));
var pk=Object.keys(tot).sort(function(a,b){return tot[b].q-tot[a].q}),tq=0,tv=0,rt='<h2>Total por produto</h2><table class="pt"><thead><tr><th>Produto</th><th>Categoria</th><th class="r">Qtd</th><th class="r">Valor</th></tr></thead><tbody>';
pk.forEach(function(k){tq+=tot[k].q;tv+=tot[k].v;rt+='<tr><td>'+esc(k)+'</td><td>'+esc(tot[k].g)+'</td><td class="r"><b>'+tot[k].q+'</b></td><td class="r">'+brl(tot[k].v)+'</td></tr>'});
rt+='<tr class="st"><td colspan="2">Total geral</td><td class="r">'+tq+'</td><td class="r">'+brl(tv)+'</td></tr></tbody></table>';
var body=sec(P,'Pendentes de entrega',false)+sec(H,'Já entregues',true);
if(!pk.length)return null;
var now=new Date().toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});
return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Encomendas Kantine</title><style>@page{size:A4 portrait;margin:12mm}*{box-sizing:border-box}body{font:10pt/1.35 Arial,Helvetica,sans-serif;color:#000;margin:0}h1{font-size:16pt;margin:0 0 2mm}h2{font-size:12pt;margin:6mm 0 1mm;border-bottom:1.5px solid #000;padding-bottom:1mm}h3{font-size:10.5pt;margin:4mm 0 1mm;break-after:avoid}h3::first-letter{text-transform:uppercase}.meta{font-size:9pt;color:#333;margin-bottom:2mm}table{width:100%;border-collapse:collapse;margin-bottom:2mm;table-layout:fixed}th:nth-child(1){width:8%}th:nth-child(2){width:9%}th:nth-child(3){width:11%}th:nth-child(4){width:6%}th:nth-child(5){width:28%}th:nth-child(6){width:17%}th:nth-child(7){width:10%}th:nth-child(8){width:11%}.pt th:nth-child(n){width:auto}td{overflow-wrap:anywhere}th,td{border:1px solid #888;padding:1.2mm 1.6mm;text-align:left;vertical-align:top;font-size:9pt}th{background:#e8e8e8}thead{display:table-header-group}tr{break-inside:avoid}.r{text-align:right;white-space:nowrap}.st td{font-weight:bold;background:#f3f3f3}.bar{margin:0 0 4mm;padding:2mm;background:#eee}button{font:inherit;padding:2mm 4mm;cursor:pointer}@media print{.bar{display:none}}</style></head><body><div class="bar"><button onclick="window.print()">Imprimir (A4)</button> Escolha papel A4, margens padrão.</div><h1>Encomendas Kantine</h1><div class="meta">Gerado em '+esc(now)+(fl.length?' · Filtros: '+esc(fl.join(' · ')):' · Sem filtros')+'</div>'+body+rt+'<script>window.addEventListener("load",function(){setTimeout(function(){window.print()},400)})<\/script></body></html>'}
(window.claude&&window.claude.use?window.claude.use('downloads'):Promise.resolve(null)).then(function(dl){if(!dl)return;var pb=document.getElementById('fpr');pb.hidden=false;pb.onclick=function(){var h=buildPrint();if(!h){alert2('Nenhuma encomenda no filtro atual.');return}
pb.disabled=true;dl.save({filename:'encomendas-kantine.html',data:h}).then(function(){alert2('Arquivo salvo. Abra-o e imprima em A4 (a janela de impressão abre sozinha).')},function(e){if(e&&e.code!=='declined')alert2('Não foi possível salvar o arquivo.')}).then(function(){pb.disabled=false})}}).catch(function(){});
function alert2(m){var s=document.getElementById('fsum2');if(!s){s=document.createElement('div');s.id='fsum2';s.className='sub';s.style.cssText='margin:-6px 0 10px';document.querySelector('.filters2').after(s)}s.textContent=m}
function relDays(){var today=new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});function df(d){return Math.round((Date.parse(d+'T00:00:00Z')-Date.parse(today+'T00:00:00Z'))/864e5)}
var K={p:[0,0],h:[0,0],a:[0,0],w:[0,0]};
document.querySelectorAll('.day').forEach(function(d){var n=df(d.dataset.day),dl=d.querySelector('.dl');if(!dl.dataset.b)dl.dataset.b=dl.textContent;dl.textContent=(n===0?'Hoje · ':n===1?'Amanhã · ':'')+dl.dataset.b;
var old=d.querySelector('.pastb');if(old)old.remove();if(n<0){d.classList.add('past');var b=document.createElement('span');b.className='bad pastb';b.textContent=' entrega já passou';dl.after(b)}else{d.classList.remove('past')}
if(n<0)return;var nums={},v=0;d.querySelectorAll('.ord .num').forEach(function(x){nums[x.textContent]=1});d.querySelectorAll('.it[data-v]').forEach(function(i){v+=parseFloat(i.dataset.v)});var c=Object.keys(nums).length;
K.p[0]+=c;K.p[1]+=v;if(n===0){K.h[0]+=c;K.h[1]+=v}if(n===1){K.a[0]+=c;K.a[1]+=v}if(n<=7){K.w[0]+=c;K.w[1]+=v}});
Object.keys(K).forEach(function(k){document.getElementById('kv-'+k).textContent=K[k][0];document.getElementById('ks-'+k).textContent=brl(K[k][1])});
var u=document.getElementById('upd'),st=document.getElementById('stale');if(u.dataset.gen<today){st.hidden=false;st.textContent='Dados gerados em '+u.dataset.genl+'. Hoje é '+today.split('-').reverse().slice(0,2).join('/')+': datas e contagens foram recalculadas, mas pedidos novos só entram na próxima atualização (22h30).'}else{st.hidden=true}}

fillC();fillP();relDays();
document.getElementById('fd').onchange=function(){ST.f=this.value;apply()};document.getElementById('ft').onchange=function(){ST.t=this.value;apply()};
fps.oninput=function(){fillP()};document.addEventListener('click',function(e){document.querySelectorAll('.ms[open]').forEach(function(d){if(!d.contains(e.target))d.open=false})});
document.getElementById('fx').onclick=function(){ST.g=[];ST.p=[];ST.f='';ST.t='';fps.value='';document.getElementById('fd').value='';document.getElementById('ft').value='';fillC();fillP();apply()};
var bs=document.querySelectorAll('#f button');bs.forEach(function(b){b.onclick=function(){bs.forEach(function(x){x.classList.remove('on')});b.classList.add('on');ST.u=b.dataset.u;apply()}});
})();
</script>'''
page=f'''<title>Encomendas Kantine</title><meta name="claude:viewport-fit-sides" content="cover"><style>
:root{{--bg:#f6f4f1;--card:#fff;--tx:#231f1c;--mu:#6b645e;--ln:#e6e1db;--M:#2a5d9c;--V:#7b3046;--S:#a8660f;--ok:#2f7a4a;--warn:#a8660f;--bad:#b3261e}}
@media (prefers-color-scheme:dark){{:root:not([data-theme="light"]){{--bg:#171513;--card:#211e1b;--tx:#efe9e3;--mu:#a39a92;--ln:#37322d;--M:#82aee6;--V:#e08ba2;--S:#e3b04b;--ok:#7cc79a;--warn:#e3b04b;--bad:#f2928b;color-scheme:dark}}}}
:root[data-theme="dark"]{{--bg:#171513;--card:#211e1b;--tx:#efe9e3;--mu:#a39a92;--ln:#37322d;--M:#82aee6;--V:#e08ba2;--S:#e3b04b;--ok:#7cc79a;--warn:#e3b04b;--bad:#f2928b;color-scheme:dark}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--tx);font:15px/1.45 system-ui,-apple-system,Segoe UI,sans-serif}}
main{{max-width:980px;margin:0 auto;padding-block:20px 48px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}}h1{{font-size:26px;margin:0}}h2{{font-size:19px;margin:34px 0 12px}}h3{{font-size:16px;margin:0 0 8px}}
.sub{{color:var(--mu);font-weight:400;font-size:13px;margin-left:6px}}.top{{display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px;align-items:baseline}}.upd{{color:var(--mu);font-size:13px}}
.kpis{{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-top:16px}}.kpi,.ucard,.day,.sec{{background:var(--card);border:1px solid var(--ln);border-radius:12px}}.kpi{{padding:12px 14px}}
.kl{{color:var(--mu);font-size:12px;text-transform:uppercase;letter-spacing:.04em}}.kv{{font-variant-numeric:tabular-nums;font-size:24px;font-weight:700}}.ks{{color:var(--mu);font-size:13px}}
.filters{{display:flex;gap:8px;flex-wrap:wrap;margin:6px 0 14px}}.filters button{{border:1px solid var(--ln);background:var(--card);color:var(--tx);padding:7px 13px;border-radius:99px;font:inherit;cursor:pointer}}.filters button.on{{background:var(--tx);color:var(--bg)}}
.day{{padding:14px 16px;margin-bottom:12px}}.cat{{border-top:1px solid var(--ln);padding:10px 0 4px}}.catt{{display:flex;justify-content:space-between;font-weight:700}}.prod{{color:var(--mu);font-size:13px;margin:2px 0 8px}}
.ord{{padding:8px 10px;margin:6px 0;border-radius:8px;background:color-mix(in srgb,var(--tx) 4%,transparent)}}.oh{{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:2px}}.num{{color:var(--mu);font-size:13px}}
.it{{font-size:14px}}.iv{{color:var(--mu);float:right;margin-left:8px}}.tg{{color:var(--mu);font-size:12px}}.tag{{font-size:12px;border:1px solid var(--ln);border-radius:6px;padding:0 6px}}
.chip{{font-size:12px;font-weight:600;color:#fff;border-radius:6px;padding:1px 8px}}.uM{{--c:var(--M)}}.uV{{--c:var(--V)}}.uS{{--c:var(--S)}}.chip{{background:var(--c)}}
@media (prefers-color-scheme:dark){{:root:not([data-theme="light"]) .chip{{color:#111}}}}:root[data-theme="dark"] .chip{{color:#111}}
.ok{{color:var(--ok);font-size:12px;font-weight:600}}.warn{{color:var(--warn);font-size:12px;font-weight:600}}.bad{{color:var(--bad);font-size:12px;font-weight:600}}
.units{{display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:12px}}.ucard{{padding:14px 16px;border-top:4px solid var(--c)}}.ug{{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:10px}}.ug .kv{{font-size:20px}}
.bar{{display:grid;grid-template-columns:110px 1fr auto;gap:8px;align-items:center;font-size:13px;margin:4px 0}}.bt{{height:8px;background:var(--ln);border-radius:4px;overflow:hidden}}.bt i{{display:block;height:100%;background:var(--c)}}.bv{{color:var(--mu)}}
table{{width:100%;border-collapse:collapse;font-size:14px}}td,th{{padding:7px 6px;font-size:13px;border-bottom:1px solid var(--ln);text-align:right}}td:first-child,th:first-child{{text-align:left}}
.sec{{padding:14px 16px}}details{{border-top:1px solid var(--ln);padding:8px 0}}summary{{cursor:pointer;font-weight:600}}.canc{{opacity:.7}}.empty{{color:var(--mu)}}ul{{margin:6px 0 0;padding-left:20px}}
{CSS_EXTRA}</style><main>
<div class="top"><h1>Encomendas Kantine</h1><div class="upd" id="upd" data-gen="{TODAY}" data-genl="{now:%d/%m} às {now:%H:%M}">Atualizado em {now:%d/%m/%Y} às {now:%H:%M} · histórico desde {SINCE:%d/%m/%Y}</div></div>
<div class="stale sub" id="stale" hidden></div>
<div class="kpis">{kpi('Pendentes de entrega',len(pend),brl(tot(pend)),'p')}{kpi('Para hoje',len(hoje),brl(tot(hoje)),'h')}{kpi('Para amanhã',len(amanha),brl(tot(amanha)),'a')}{kpi('Próximos 7 dias',len(prox7),brl(tot(prox7)),'w')}{kpi('Entregues no período',len(hist),brl(tot(hist)))}</div>
{MUD_H}
<h2>Pendentes de entrega · por dia e categoria</h2>
<p class="sub" style="margin:-6px 0 10px">Os filtros valem também para o histórico mais abaixo.</p>
<div class="filters" id="f"><button class="on" data-u="">Todas</button><button data-u="M">Matriz</button><button data-u="V">Vinhedos</button><button data-u="S">Site</button></div>
<div class="filters2"><div class="fl"><span>Categoria</span><details class="ms" id="mc"><summary id="mcs">Todas</summary><div class="msp"><div class="msl" id="mcl"></div></div></details></div><div class="fl"><span>Produto</span><details class="ms" id="mp"><summary id="mps">Todos</summary><div class="msp"><input type="search" id="fps" placeholder="Buscar produto" autocomplete="off"><div class="msl" id="mpl"></div></div></details></div><label>De <input type="date" id="fd"></label><label>Até <input type="date" id="ft"></label><button id="fx" type="button">Limpar filtros</button><button id="fpr" type="button" hidden>Imprimir lista (A4)</button></div>
<div class="fsum" id="fsum" hidden></div>
{pend_html}
<h2>Visão por unidade</h2><div class="units">{units}</div>
<h2>Valor por categoria e unidade</h2><div class="sec" style="overflow-x:auto"><table><tr><th>Categoria</th><th>Matriz</th><th>Vinhedos</th><th>Site</th><th>Total</th></tr>{th}</table></div>
<h2>Histórico de entregues desde {SINCE:%d/%m}</h2><div class="sec">{hh}</div>
<h2>Canceladas</h2><div class="sec">{ch or '<p class="empty">Nenhuma.</p>'}</div>
<h2>Conferência</h2><div class="sec"><ul>{conf_h}</ul><p class="sub">Pendente = data de entrega de hoje em diante e não cancelada. "Pago" compara os pagamentos com o valor dos itens. Site = comandas com item da categoria "Site Kantine". Nomes de clientes não são exibidos.</p></div>
</main>{JS}'''
open(OUT,'w',encoding='utf-8').write(page)
print('pendentes',len(pend),brl(tot(pend)),'| entregues',len(hist),brl(tot(hist)),'| canceladas',len(canc))
print('por unidade pend:',{UN[u]:len([r for r in pend if r['un']==u]) for u in 'MVS'})
print('hoje',len(hoje),'amanha',len(amanha)); print('conferencia:',len(set(conf)))
for c in dict.fromkeys(conf): print(' -',c)
