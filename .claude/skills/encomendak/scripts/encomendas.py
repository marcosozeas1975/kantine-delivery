"""EncomendaK: gera o HTML do relatorio de encomendas com agendamento (campo scheduled_to).
Uso: python3 encomendas.py --today AAAA-MM-DD --since AAAA-MM-DD --out ARQ.html \
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
CM={'M':catmap(opt('--pm')),'V':catmap(opt('--pv'))}
S={'M':{},'V':{}}
for k,fl in (('M',lst('--m')),('V',lst('--v'))):
    for f in fl:
        for s in json.load(open(f))['data']: S[k][s['id']]=s
def loc(t): return dt.datetime.fromisoformat(t.replace('Z','+00:00')).replace(tzinfo=None)-dt.timedelta(hours=3)
NAT_KW=('kantitone','chocotone','panetone','gingerbread','natal','tora de')
def grupo(name,cat):
    n=name.lower()
    if cat=='Sobremesas de Natal': return 'Sobremesas de Natal'
    if cat in ('NATAL','NATAL 2026','KANTITONES') or any(k in n for k in NAT_KW): return 'Natal'
    if cat=='REVENDA': return 'Revenda'
    if cat=='BOLOS E SOBREMESAS' or (cat=='Site Kantine' and any(k in n for k in ('bolo','cheesecake','merengue','torta'))): return 'Bolos e sobremesas'
    if cat in ('PÂTISSERIE FRANCESA & SOBREMESAS','CHOCOLATES E MACARONS','LE PETITS (Miniaturas)') or 'macaron' in n: return 'Doces e pâtisserie'
    if cat=='PARA PRESENTEAR': return 'Cestas e presentes'
    return 'Outros'
GORD=['Natal','Sobremesas de Natal','Bolos e sobremesas','Doces e pâtisserie','Cestas e presentes','Revenda','Outros']
UN={'M':'Matriz','V':'Vinhedos','S':'Site'}
rows=[];conf=[]
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
        for i in items:
            if i['cat']=='?': conf.append(f"Comanda {s['session_number']}: produto sem categoria ({i['n']})")
        when=loc(s['scheduled_to']); paid=sum(float(p['payment_value']) for p in s['payments'])
        tot=sum(i['v'] for i in items)
        rows.append(dict(num=s['session_number'],un=un,when=when,canc=canc,status=s['status'],ret=bool(s['with_withdrawal']),
            items=items,total=tot,paid=paid,created=loc(s['start_time'])))
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
    diff=(d-TODAY).days
    t={0:'Hoje',1:'Amanhã'}.get(diff,'')
    return f"{(t+' · ') if t else ''}{DOW[d.weekday()]}, {d:%d/%m}"
# ---------- agregados
def tot(rs): return sum(r['total'] for r in rs)
hoje=[r for r in pend if r['when'].date()==TODAY]; amanha=[r for r in pend if r['when'].date()==TODAY+dt.timedelta(1)]
prox7=[r for r in pend if r['when'].date()<=TODAY+dt.timedelta(7)]
def kpi(l,v,s=''): return f'<div class="kpi"><div class="kl">{E(l)}</div><div class="kv">{v}</div><div class="ks">{s}</div></div>'
def chip(u): return f'<span class="chip u{u}">{UN[u]}</span>'
def item_lines(r,g=None):
    return ''.join(f'<div class="it"><b>{q(i["q"])}×</b> {E(i["n"])}</div>' for i in r['items'] if g is None or i['g']==g)
def pend_day(d):
    rs=[r for r in pend if r['when'].date()==d]
    cats=C.defaultdict(lambda:C.defaultdict(float)); cv=C.defaultdict(float)
    for r in rs:
        for i in r['items']: cats[i['g']][i['n']]+=i['q']; cv[i['g']]+=i['v']
    out=f'<section class="day" data-day="{d}"><h3>{E(dlabel(d))} <span class="sub">{len(rs)} encomenda{"s" if len(rs)!=1 else ""} · {brl(tot(rs))}</span> <span class="sub dq"></span></h3>'
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
CSS_EXTRA=r'''.filters2{display:flex;gap:10px;flex-wrap:wrap;align-items:end;margin:0 0 14px}.filters2 label{display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--mu);min-width:0}.filters2 input{font:inherit;font-size:14px;padding:6px 8px;border:1px solid var(--ln);border-radius:8px;background:var(--card);color:var(--tx);min-width:0}.filters2 select{font:inherit;font-size:14px;padding:7px 8px;border:1px solid var(--ln);border-radius:8px;background:var(--card);color:var(--tx);max-width:100%;min-width:0}#fx{border:1px solid var(--ln);background:var(--card);color:var(--tx);padding:7px 13px;border-radius:8px;font:inherit;font-size:14px;cursor:pointer}.fsum{background:var(--card);border:1px solid var(--ln);border-radius:12px;padding:12px 16px;margin-bottom:12px}.fsum table td:first-child{text-align:left}.dq{font-weight:700;color:var(--tx)}
'''
JS=r'''<script>
(function(){var ST={u:'',g:'',p:'',f:'',t:''},fc=document.getElementById('fc'),fp=document.getElementById('fp'),sum=document.getElementById('fsum');
var items=[].slice.call(document.querySelectorAll('.it[data-g]'));
function uniq(a){return a.filter(function(x,i){return a.indexOf(x)===i}).sort(function(a,b){return a.localeCompare(b,'pt-BR')})}
function fillC(){uniq(items.map(function(i){return i.dataset.g})).forEach(function(g){var o=document.createElement('option');o.value=g;o.textContent=g;fc.appendChild(o)})}
function fillP(){var cur=ST.p;fp.innerHTML='<option value="">Todos</option>';uniq(items.filter(function(i){return !ST.g||i.dataset.g===ST.g}).map(function(i){return i.dataset.p})).forEach(function(n){var o=document.createElement('option');o.value=n;o.textContent=n;fp.appendChild(o)});if([].some.call(fp.options,function(o){return o.value===cur})){fp.value=cur}else{ST.p='';fp.value=''}}
function brl(v){return 'R$ '+v.toFixed(2).replace('.',',').replace(/\B(?=(\d{3})+(?!\d))/g,'.')}
function fmtDay(d){var x=d.split('-');return x[2]+'/'+x[1]}
function apply(){var act=ST.g||ST.p||ST.f||ST.t,days={};
document.querySelectorAll('.ord[data-un]').forEach(function(o){var uok=!ST.u||o.dataset.un===ST.u,vis=0;
o.querySelectorAll('.it[data-g]').forEach(function(i){var hd=i.closest('[data-day]'),dd=hd?hd.dataset.day:'';var ok=uok&&(!ST.g||i.dataset.g===ST.g)&&(!ST.p||i.dataset.p===ST.p)&&(!ST.f||dd>=ST.f)&&(!ST.t||dd<=ST.t);i.style.display=ok?'':'none';if(ok){vis++;var h=i.closest('[data-day]');if(h){var d=h.dataset.day,pend=h.classList.contains('day');var k=d+(pend?'P':'H');days[k]=days[k]||{d:d,pend:pend,q:0,v:0};days[k].q+=parseFloat(i.dataset.q);days[k].v+=parseFloat(i.dataset.v)}}});
o.style.display=(uok&&vis)?'':'none'});
document.querySelectorAll('.cat').forEach(function(c){var vis=[].slice.call(c.querySelectorAll('.ord[data-un]')).filter(function(o){return o.style.display!=='none'});c.style.display=vis.length?'':'none';
var m={};vis.forEach(function(o){o.querySelectorAll('.it[data-g]').forEach(function(i){if(i.style.display!=='none'){m[i.dataset.p]=(m[i.dataset.p]||0)+parseFloat(i.dataset.q)}})});
var pl=c.querySelector('.pl');if(pl){pl.textContent=Object.keys(m).sort(function(a,b){return m[b]-m[a]}).map(function(n){return m[n]+'× '+n}).join(', ')}});
document.querySelectorAll('.day').forEach(function(d){var vis=[].slice.call(d.querySelectorAll('.cat')).filter(function(c){return c.style.display!=='none'});d.style.display=vis.length?'':'none';
var dq=d.querySelector('.dq'),k=d.dataset.day+'P';dq.textContent=(act&&days[k])?('· filtro: '+days[k].q+' un · '+brl(days[k].v)):''});
document.querySelectorAll('details[data-day]').forEach(function(d){var vis=[].some.call(d.querySelectorAll('.ord[data-un]'),function(o){return o.style.display!=='none'});d.style.display=vis?'':'none'});
if(act){var ks=Object.keys(days).sort(),tq=0,tv=0,h='<b>'+(ST.p||ST.g||'Todos os produtos')+'</b>'+((ST.f||ST.t)?' <span class="sub">'+(ST.f?fmtDay(ST.f):'início')+' a '+(ST.t?fmtDay(ST.t):'fim')+'</span>':'')+(ST.p&&ST.g?' <span class="sub">'+ST.g+'</span>':'')+'<div style="overflow-x:auto"><table><tr><th>Dia</th><th>Situação</th><th>Qtd</th><th>Valor</th></tr>';
ks.forEach(function(k){var x=days[k];tq+=x.q;tv+=x.v;h+='<tr><td>'+fmtDay(x.d)+'</td><td>'+(x.pend?'pendente':'entregue')+'</td><td>'+x.q+'</td><td>'+brl(x.v)+'</td></tr>'});
h+='<tr><td><b>Total</b></td><td></td><td><b>'+tq+'</b></td><td><b>'+brl(tv)+'</b></td></tr></table></div>';sum.innerHTML=ks.length?h:'Nenhuma encomenda com esse filtro.';sum.hidden=false}else{sum.hidden=true}}
fillC();fillP();
document.getElementById('fd').onchange=function(){ST.f=this.value;apply()};document.getElementById('ft').onchange=function(){ST.t=this.value;apply()};
fc.onchange=function(){ST.g=fc.value;fillP();apply()};fp.onchange=function(){ST.p=fp.value;apply()};
document.getElementById('fx').onclick=function(){ST.g='';ST.p='';ST.f='';ST.t='';fc.value='';document.getElementById('fd').value='';document.getElementById('ft').value='';fillP();apply()};
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
<div class="top"><h1>Encomendas Kantine</h1><div class="upd">Atualizado em {now:%d/%m/%Y} às {now:%H:%M} · histórico desde {SINCE:%d/%m/%Y}</div></div>
<div class="kpis">{kpi('Pendentes de entrega',len(pend),brl(tot(pend)))}{kpi('Para hoje',len(hoje),brl(tot(hoje)))}{kpi('Para amanhã',len(amanha),brl(tot(amanha)))}{kpi('Próximos 7 dias',len(prox7),brl(tot(prox7)))}{kpi('Entregues no período',len(hist),brl(tot(hist)))}</div>
<h2>Pendentes de entrega · por dia e categoria</h2>
<p class="sub" style="margin:-6px 0 10px">Os filtros valem também para o histórico mais abaixo.</p>
<div class="filters" id="f"><button class="on" data-u="">Todas</button><button data-u="M">Matriz</button><button data-u="V">Vinhedos</button><button data-u="S">Site</button></div>
<div class="filters2"><label>Categoria <select id="fc"><option value="">Todas</option></select></label><label>Produto <select id="fp"><option value="">Todos</option></select></label><label>De <input type="date" id="fd"></label><label>Até <input type="date" id="ft"></label><button id="fx" type="button">Limpar filtros</button></div>
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
