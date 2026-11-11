---
name: reportek
description: ReporteK — relatório diário de vendas das três operações Kantine (Kantine Gastronomia/Matriz, Kantine Vinhedos e Kantine Center Shopping, que é o quiosque temporário de Natal 2026). Use quando o usuário digitar /ReporteK ou /reportek, ou pedir "o reporte do dia", "relatório das três lojas", "como foram as vendas hoje" nas lojas Kantine. Aceita uma data opcional (ex.: /ReporteK 10/11); sem data, usa o dia de hoje.
---

# ReporteK — Relatório diário das operações Kantine

Gera a análise de vendas **de um dia** para as três operações, publica numa página compartilhável (link fixo) e mostra um resumo curto no chat.

Fonte de dados: conector **Takeat Multilojas** (ferramentas `mcp__Takeat_Multilojas__*`; carregue com ToolSearch se ainda não estiverem carregadas). Nada é gravado em banco — o relatório é gerado sob demanda.

## 1. Parâmetros

- **Data**: argumento opcional (`DD/MM`, `DD/MM/AAAA` ou `AAAA-MM-DD`). Sem argumento → hoje, no fuso `America/Sao_Paulo`.
- **Janela do dia**: de `00:00:00` a `23:59:59` horário local. Na consulta use `start_date = end_date = AAAA-MM-DD` (a API interpreta no fuso local da loja). Os horários na resposta vêm em UTC (`...Z`): **subtraia 3h** antes de exibir ou agrupar por hora.
- Se o dia ainda está em andamento, deixe claro no título que é parcial ("até HH:MM") e informe o horário da última venda.

## 2. As três operações

| Operação no relatório | Origem | Como isolar |
|---|---|---|
| **Kantine Gastronomia (Matriz)** | loja `40695` "Kantine Matriz" | todas as comandas da loja **menos** os itens Natal 2026 |
| **Kantine Vinhedos** | loja `43896` "Kantine Vinhedos" | a loja inteira |
| **Kantine Center Shopping** | loja `40695` (mesmo CNPJ da Matriz) | só os itens da categoria **NATAL 2026** |

- Confirme os IDs com `list_restaurants` no início; se mudarem, use os nomes acima para achar as lojas. Nunca escolha a primeira loja automaticamente.
- **Período do Center Shopping: 06/11/2026 a 05/01/2027.** Fora desse período, omita a seção Center Shopping e a Matriz é a loja inteira.

### Como identificar os itens do Center Shopping (Natal 2026)

1. Rode `get_products(restaurant_id=40695)` e monte o conjunto de `product.id` cuja categoria é **"NATAL 2026"** (id da categoria `1089749`, confirme com `get_product_categories`).
   - ⚠️ Existe **outra** categoria chamada `"NATAL "` (id `233001`), que é da Matriz. Ela **não** é do Center Shopping. Use só "NATAL 2026".
2. Nas comandas, um item vendido (`orders[]`) é Center Shopping se `product.id` está nesse conjunto.
3. **Conferência pelo nome**: todo item Natal 2026 é escrito em CAIXA ALTA e termina com a palavra `NATAL`. Cruze os dois critérios e **liste no relatório** (seção "Conferência"):
   - itens com nome em caixa alta terminando em `NATAL` que **não** estão na categoria NATAL 2026 → possível cadastro errado; mesmo assim contam como Center Shopping;
   - itens da categoria que **não** seguem o padrão do nome → avisar para corrigir o cadastro.
   - Se a Vinhedos vender algum item com esse padrão, aponte (não deveria acontecer).
4. Uma comanda pode misturar itens de Natal e da Matriz: divida a comanda por item. Para contar comandas, conte uma para cada operação que tenha pelo menos um item na comanda.

## 3. Coleta de dados

Para cada loja (`40695` e `43896`):

```
get_table_sessions(restaurant_id=<id>, start_date=<dia>, end_date=<dia>, limit=100)
```

**Siga `pagination.next.cursor` até `has_more=false`**, mantendo os mesmos filtros. Nunca trate a primeira página como o total. Se não conseguir trazer tudo, diga isso no relatório.

As respostas são grandes (centenas de KB) e a ferramenta salva cada uma num arquivo em `tool-results/`. Não leia o JSON no contexto. Rode o script de agregação, que já aplica todas as regras da seção 4:

```
python3 .claude/skills/reportek/scripts/calc.py <arquivo get_products da Matriz> \
  --m <páginas get_table_sessions da Matriz...> --v <páginas da Vinhedos...>
```

Ele imprime, por operação (`M` = Gastronomia, `CS` = Center Shopping, `V` = Vinhedos): faturamento, comandas, ticket, itens, pessoas, última comanda (já em horário local, ignore o `+00:00`), canais, pagamentos, faturamento por hora, ranking de produtos, descontos, maiores comandas, cancelamentos, exclusões, abertos incluídos e a conferência categoria × nome. Para detalhes de uma comanda específica (ex.: encomenda grande), consulte o arquivo com um trecho curto de Python.

## 4. Regras de cálculo (iguais às análises de referência)

- **Faturamento** = valor dos produtos (`orders[].total_price`, ou `total_price` da sessão/basket), **sem taxa de entrega** (`delivery_tax_price`) e **já com descontos** aplicados.
- **Excluir**: itens com `canceled_at` preenchido, baskets cancelados, deliveries cancelados (`delivery_canceled_at`) e mesas transferidas (sessões com status `transferred` ou equivalente, sem pagamento próprio).
- **Incluir** comandas ainda em aberto que já tenham pagamento total ou parcial (ex.: iFood pago que ainda aparece aberto). Mencione-as em "como os números foram calculados".
- **Ticket médio** = faturamento ÷ número de comandas.
- **Canal**: iFood quando há pagamento "Pagamento Online iFood" ou "Cupom iFood"; senão, pelo `table.table_type`: `table` = mesa, `balcony` = balcão, `delivery` = delivery próprio. Observação: com o Natal 2026 separado, quase todo o balcão do CNPJ da Matriz é o quiosque. Use os campos `table.table_type`, `is_delivery`, `order_baskets[].channel` e `intended_payments.ifood_paid`.
- **Pagamentos**: some `payments[].payment_value` por `payment_method.name`. Mostre valor e % dos principais.
- **Pessoas atendidas**: soma de `people_at_table` (quando houver).
- **Horários**: agrupe o faturamento por hora local de abertura da comanda (`start_time` − 3h). Aponte o pico e as horas fracas fora do padrão.
- **Pedido fora da curva**: uma comanda isolada que represente **≥ 10% do faturamento do dia** da operação, ou encomenda grande (muitas unidades, retirada futura, desconto negociado), deve ser destacada como "Atenção a um pedido grande": mostre o cliente, os itens, o desconto, a data de retirada (se estiver em `details`, `scheduled_to` ou observações) e o **dia sem esse pedido** (faturamento, comandas, ticket).
- **Cancelamentos e descontos**: liste os itens cancelados (valor e `cancel_reason`) e o total de descontos com a origem (cupom iFood, `discount_obs`, etc.).
- Valores em R$ no padrão brasileiro (`R$ 1.874,00`). Nos rankings pode arredondar para inteiro (`R$ 266`).

## 5. Conteúdo do relatório (por operação)

Siga o estilo das análises de referência: título em negrito com o número principal, frases diretas, bullets curtos, e só os destaques que importam.

**Kantine Gastronomia (Matriz)**
- Total sem Natal 2026, nº de comandas, ticket médio. Também mostre o total bruto da loja e quanto foi Natal 2026.
- Pedido fora da curva (se houver) e o dia "normal" sem ele.
- Canais, pagamentos, picos de horário, top 5 produtos por faturamento.
- Como os números foram calculados (exclusões e inclusões).

**Kantine Vinhedos**
- Total, comandas, ticket médio, pessoas atendidas.
- "Onde veio o dinheiro" (canais com % do total), horários (pico e horas fracas), top 5 produtos, famílias que puxam volume (ex.: cafés, água com gás), pagamentos (%), pontos de atenção (cancelamentos e descontos).

**Kantine Center Shopping (Natal 2026)**
- Total, itens vendidos, comandas, ticket médio por comanda.
- Canal predominante e descontos.
- Top 5 por faturamento e a lista dos demais itens, agrupando famílias (ex.: "Bolos de pote (sabores...)", "Sininhos (chocolate e coco)").
- Horário da última venda.

**Consolidado do dia** (topo da página)
- Cartões com as 3 operações (faturamento, comandas, ticket) e o total do grupo.
- **Comparativo**: Matriz "normal" (sem Natal e sem pedido fora da curva) × Vinhedos × Center Shopping. Inclua diferença % de faturamento, ticket médio e perfil de canal (salão × balcão).

**Conferência** (rodapé): problemas do cruzamento categoria × nome, páginas não carregadas e qualquer dado que pareça inconsistente.

## 6. Publicação (página com link fixo)

1. Antes de escrever o HTML, carregue a skill `artifact-design` (e `dataviz` se houver gráfico, como faturamento por hora).
2. Monte uma página HTML única, legível no celular, com o título **"Reporte Kantine"**. Mostre a data do relatório em destaque no topo e as seções na ordem: Consolidado → Gastronomia → Vinhedos → Center Shopping → Conferência.
3. **Link fixo**: https://claude.ai/artifact/WfY4v8DJ4S6uJowKWx7Nc8 (criado em 11/11/2026). Faça `action: "read"` nesse URL e publique com o mesmo `url`. Se ele não existir mais, use `Artifact` com `action: "list"` e procure um artifact com o título **"Reporte Kantine"**.
   - Se existir: `action: "read"` nele e depois publique com o mesmo `url`, para atualizar no mesmo link.
   - Se não existir: publique um novo (`icon: "chart"`). Esse passa a ser o link fixo.
4. A página é privada. O usuário decide se compartilha o link pelo claude.ai.

## 7. Resposta no chat

Depois de publicar, responda curto, para leitura no celular:
- Uma linha por operação: `*Operação*: R$ X em N comandas · ticket R$ Y`.
- Total do grupo e 1–3 alertas (pedido grande, cancelamentos, problemas de conferência).
- O link da página.
