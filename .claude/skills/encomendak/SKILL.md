---
name: encomendak
description: EncomendaK — relatório diário das encomendas com agendamento (campo scheduled_to do Takeat) das operações Kantine Matriz, Kantine Vinhedos e Site, separadas por categoria (Natal, Sobremesas de Natal, Bolos, Revenda etc.), com destaque das pendentes de entrega por dia e categoria. Use quando o usuário digitar /EncomendaK ou /encomendak, pedir "as encomendas", "encomendas agendadas", "o que tenho para entregar", ou quando a tarefa agendada das 22h30 rodar.
---

# EncomendaK — Encomendas com agendamento

Gera uma página única com todas as comandas que têm `scheduled_to` (data/hora de retirada ou entrega), desde **01/11/2026**, destacando as **pendentes de entrega** agrupadas por **dia de entrega → categoria**. Atualiza sempre o **mesmo link fixo** (decisão do usuário em 23/11/2026, diferente do ReporteK, que gera link novo a cada uso).

Fonte: conector **Takeat Multilojas** (`mcp__Takeat_Multilojas__*`; carregue com ToolSearch). Lojas: Matriz `40695` e Vinhedos `43896` (confirme com `list_restaurants`; nunca escolha loja automaticamente).

## Regras

- **Unidades**: *Matriz* (loja 40695), *Vinhedos* (loja 43896) e *Site* = comandas que tenham pelo menos um item da categoria **"Site Kantine"** (a comanda inteira vai para Site, em qualquer loja). Itens "NATAL 2026" (Center Shopping) **não** têm encomendas e ficam fora desta análise.
- **Pendente** = `scheduled_to` (horário local = UTC−3) de **hoje em diante** e não cancelada. Atenção: a comanda de encomenda costuma estar `completed`/paga mesmo antes da entrega, então **não use o status** para saber se foi entregue; use a data.
- **Cancelada**: status `canceled` ou `delivery_canceled_at` preenchido. Itens cancelados saem do total.
- **Retirada** quando `with_withdrawal` é verdadeiro; senão, Entrega.
- **Categorias do relatório** (ordem fixa): Natal (categorias NATAL, NATAL 2026, KANTITONES e itens com kantitone/chocotone/panetone/gingerbread/natal no nome), Sobremesas de Natal, Bolos e sobremesas, Doces e pâtisserie, Cestas e presentes, Revenda, Outros. A lógica está em `grupo()` no script; ajuste lá se criarem categorias novas.
- **Privacidade**: nunca exiba nome, telefone ou endereço de cliente; só o número da comanda.

## Coleta

1. `get_products` das duas lojas (limit 100) para mapear produto → categoria (os arquivos são grandes e vão para `tool-results/`; não leia no contexto).
2. `get_table_sessions` por loja, de `2026-11-01` até hoje, **um dia por chamada** (`start_date = end_date`, `limit=100`; os dias podem rodar em paralelo). Para cada dia com `has_more=true`, siga `pagination.next.cursor` **com os mesmos filtros** até `has_more=false`. A API filtra pela data de **criação** da comanda, não pela entrega; por isso o intervalo vai desde 01/11. Nunca trate a primeira página como total.
3. As respostas são salvas em arquivos; rode o script (ele deduplica por id):

```
python3 .claude/skills/encomendak/scripts/encomendas.py --today AAAA-MM-DD --since 2026-11-01 \
  --out <pasta de trabalho>/encomendas.html \
  --pm <get_products Matriz> --pv <get_products Vinhedos> \
  --m <páginas da Matriz...> --v <páginas do Vinhedos...>
```

Ele gera o HTML completo (cartões, pendentes por dia/categoria com filtro por unidade, visão por unidade, categoria × unidade, histórico, canceladas e conferência) e imprime um resumo.

## Publicação (link fixo)

1. Carregue a skill `artifact-design` antes da primeira publicação.
2. Link fixo: registrado abaixo. Faça `Artifact` `action: "read"` nele e publique o HTML com o mesmo `url` (título "Encomendas Kantine"). Se não existir mais, procure com `action: "list"` pelo título; se não achar, publique novo (`icon: "calendar"`) e **registre o URL aqui**.
3. A página é privada; o usuário decide se compartilha. Não passe `capabilities`.

**Link fixo atual**: https://claude.ai/artifact/Br7qZ9ci8FhChdxikh641s (criado em 23/11/2026, privado)

## Resposta no chat

Curta, para celular: pendentes (nº e valor), as de hoje e amanhã, o que produzir no próximo dia, pontos da conferência e o link.

## Agendamento

Roda todo dia às 22h30 (America/Sao_Paulo) atualizando o mesmo link.
