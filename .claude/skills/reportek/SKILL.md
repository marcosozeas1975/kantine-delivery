---
name: reportek
description: ReporteK — relatório diário de vendas das três operações Kantine (Kantine Matriz, Kantine Vinhedos e Kantine Center Shopping, que é o quiosque temporário de Natal 2026). Use quando o usuário digitar /ReporteK ou /reportek, ou pedir "o reporte do dia", "relatório das três lojas", "como foram as vendas hoje" nas lojas Kantine. Aceita uma data opcional (ex.: /ReporteK 10/11; sem data, usa hoje) ou um período (ex.: /ReporteK semana, /ReporteK novembro, /ReporteK 01/11 a 10/11), que gera o relatório consolidado do período em outro link.
---

# ReporteK — Relatório diário das operações Kantine

Gera a análise de vendas **de um dia** para as três operações, publica numa página privada (link novo a cada uso) e mostra um resumo curto no chat.

Fonte de dados: conector **Takeat Multilojas** (ferramentas `mcp__Takeat_Multilojas__*`; carregue com ToolSearch se ainda não estiverem carregadas). Nada é gravado em banco — o relatório é gerado sob demanda.

## 1. Parâmetros

- **Data**: argumento opcional (`DD/MM`, `DD/MM/AAAA` ou `AAAA-MM-DD`). Sem argumento → hoje, no fuso `America/Sao_Paulo`.
- **Período**: se o argumento for um intervalo, siga também a seção 8 (leia `period-mode.md`). Formas aceitas:
  - `DD/MM a DD/MM` (ou `DD/MM/AAAA a DD/MM/AAAA`): do primeiro ao último dia, inclusive.
  - `semana`: os últimos 7 dias completos (ontem e os 6 dias anteriores). `semana atual`: de segunda até hoje.
  - `mês` ou o nome do mês (ex.: `novembro`): do dia 1 ao último dia do mês. Se for o mês atual, vai até hoje e o relatório é parcial.
  - Se o argumento for ambíguo, pergunte antes de buscar os dados.
- **Janela do dia**: de `00:00:00` a `23:59:59` horário local. Na consulta use `start_date = end_date = AAAA-MM-DD` (a API interpreta no fuso local da loja). Os horários na resposta vêm em UTC (`...Z`): **subtraia 3h** antes de exibir ou agrupar por hora.
- Se o dia ainda está em andamento, deixe claro no título que é parcial ("até HH:MM") e informe o horário da última venda.

## 2. As três operações

| Operação no relatório | Origem | Como isolar |
|---|---|---|
| **Kantine Matriz** | loja `40695` "Kantine Matriz" | todas as comandas da loja **menos** os itens Natal 2026 |
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

Ele imprime, por operação (`M` = Matriz, `CS` = Center Shopping, `V` = Vinhedos): faturamento, comandas, ticket, itens, pessoas, última comanda (já em horário local, ignore o `+00:00`), canais, pagamentos, faturamento por hora, ranking de produtos, descontos, maiores comandas, cancelamentos, exclusões, abertos incluídos e a conferência categoria × nome. Para detalhes de uma comanda específica (ex.: encomenda grande), consulte o arquivo com um trecho curto de Python.

## 4. Regras de cálculo (iguais ao relatório do Takeat — decisão de 26/11/2026)

O faturamento segue o relatório "Faturamento" do Takeat Multilojas, para que os números batam com a tela dele. O `calc.py` já aplica tudo isto. Conferido em 26/11/2026: Vinhedos de 01 a 25/11 deu 1.947 comandas e R$ 150.093,82, igual ao Takeat em todos os canais.

- **Faturamento da comanda** = valor dos produtos (`total_price`, já com descontos) **menos o Cashback Takeat** usado no pagamento (o cashback é desconto, não receita; limitado ao valor da comanda) **mais a taxa de entrega nas comandas do iFood** (`delivery_tax_price`). No iFood isso equivale ao total pago pelo iFood.
- **Delivery próprio**: valor dos produtos, sem a taxa de entrega.
- **Excluir**: itens com `canceled_at`, baskets cancelados, deliveries cancelados (`delivery_canceled_at`), mesas transferidas (`status = transfer`), comandas abertas sem pagamento e **comandas zeradas sem pagamento** (o Takeat não conta).
- **Incluir** comandas ainda abertas que já tenham pagamento total ou parcial. Mencione-as em "como os números foram calculados".
- **Ticket médio** = faturamento ÷ número de comandas.
- **Canal**: **iFood** quando qualquer pagamento tiver "iFood" no nome ("Pagamento Online iFood", "Cupom iFood", "Pagamento na Entrega iFood"); senão, pelo `table.table_type`: `table` = mesa, `balcony` = balcão, `delivery` = delivery próprio. Com o Natal 2026 separado, quase todo o balcão do CNPJ da Matriz é o quiosque.
- **Produtos (rankings)**: valor dos itens com o desconto da comanda rateado; não recebem taxa de entrega nem cashback.
- **Transparência**: na seção "como os números foram calculados", informe quanto de taxa de entrega do iFood entrou e quanto de cashback foi descontado (o script imprime os dois e grava `taxa_ifood_incluida` e `cashback_descontado` no cache).
- **Pagamentos**: some `payments[].payment_value` por `payment_method.name`. Mostre valor e % dos principais.
- **Pessoas atendidas**: soma de `people_at_table` (quando houver).
- **Horários**: agrupe o faturamento por hora local de abertura da comanda (`start_time` − 3h). Aponte o pico e as horas fracas fora do padrão.
- **Pedido fora da curva**: uma comanda isolada que represente **≥ 10% do faturamento do dia** da operação, ou encomenda grande (muitas unidades, retirada futura, desconto negociado), deve ser destacada como "Atenção a um pedido grande": mostre os itens, o desconto, a data de retirada (se estiver em `details`, `scheduled_to` ou observações) e o **dia sem esse pedido** (faturamento, comandas, ticket).
- **Cancelamentos**: liste os itens cancelados (valor e `cancel_reason`).
- **Descontos (decisão de 27/11/2026)**: não liste desconto por desconto. Agrupe por tipo (o nome do desconto, como "funcionario", "Cupom iFood", "dobro"; sem diferenciar maiúsculas; sem nome = "sem descrição") e mostre, para cada tipo, **quantidade, total e valor médio**, do maior total para o menor. No título do bloco, o total do dia e a quantidade: `Descontos (total R$ 56,53 em 5)`. Linha: `funcionario: 2 · total R$ 3,55 · média R$ 1,78`. O `calc.py` já imprime isso em `disc_grupos` (nome, qtd, total, média). Nomes diferentes ficam em tipos diferentes (ex.: "uberlandia em dobro" e "dobro"), a menos que o usuário diga que são a mesma promoção.
- Valores em R$ no padrão brasileiro (`R$ 1.874,00`). Nos rankings pode arredondar para inteiro (`R$ 266`).

## 5. Conteúdo do relatório (por operação)

Siga o estilo das análises de referência: título em negrito com o número principal, frases diretas, bullets curtos, e só os destaques que importam.

**Kantine Matriz**
- Total sem Natal 2026, nº de comandas, ticket médio. Também mostre o total bruto da loja e quanto foi Natal 2026.
- Pedido fora da curva (se houver) e o dia "normal" sem ele.
- Canais, pagamentos, picos de horário, top 5 produtos por faturamento. Nos canais, mostre **delivery próprio e iFood em linhas separadas** (comandas, faturamento e ticket de cada um). Avise quantas comandas do delivery próprio foram retirada na loja (`with_withdrawal`) e o total de taxas de entrega, que não entra no faturamento. Encomenda fora da curva fica fora dessa conta.
- Como os números foram calculados (exclusões e inclusões).

**Kantine Vinhedos**
- Total, comandas, ticket médio, pessoas atendidas.
- "Onde veio o dinheiro" (canais com % do total), horários (pico e horas fracas), top 5 produtos, famílias que puxam volume (ex.: cafés, água com gás), pagamentos (%), pontos de atenção (cancelamentos e descontos).

**Kantine Center Shopping (Natal 2026)**
- Total, itens vendidos, comandas, ticket médio por comanda.
- Canal predominante e descontos (agrupados por tipo, como nas outras operações).
- Top 5 por faturamento e a lista dos demais itens, agrupando famílias (ex.: "Bolos de pote (sabores...)", "Sininhos (chocolate e coco)").
- Horário da última venda.

**Consolidado do dia** (topo da página)
- Cartões com as 3 operações (faturamento, comandas, ticket) e o total do grupo. **Layout (decisão de 27/11/2026): cartões quadrados lado a lado**, não empilhados: 4 numa linha no computador e 2×2 no celular. CSS de referência:
  `.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}` · `.card{aspect-ratio:1/1;display:flex;flex-direction:column;justify-content:space-between;box-sizing:border-box;padding:12px;border-top:5px solid <cor da operação>}` · nome `.95rem`, valor `1.35rem` negrito sem quebra de linha, comandas/ticket `.85rem`.
- **Comparativo** (tabela, uma coluna por operação): Matriz "normal" (sem Natal e sem pedido fora da curva) × Vinhedos × Center Shopping. Linhas: faturamento, ticket e o perfil de canal em % do faturamento de cada operação, com **Salão (mesa), Balcão, Delivery iFood e Delivery próprio, cada um na sua linha** (decisão de 27/11/2026; canal sem venda = 0%). Embaixo, a diferença % de faturamento e de ticket entre as lojas.

**Avaliações do dia no Takeat** (antes da Conferência)
- Busque com `get_ratings(restaurant_id=<id>, start_date=<dia>, end_date=<dia+1>)` para cada loja. As datas dessa ferramenta são em UTC: filtre por `created_at` − 3h para ficar só com o dia local.
- Por loja: nota média, quantidade de avaliações e média de cada critério (`food` = comida, `service` = atendimento, `price` = preço, `enviroment` = ambiente), dizendo em quantas avaliações os critérios foram preenchidos.
- **Destaque toda nota abaixo de 5**, seja a nota geral ou de um critério, em bloco de alerta: cliente, mesa, horário local, nota geral e quais critérios ficaram abaixo de 5.
- **Mostre todos os comentários** escritos (`comment` não vazio), na íntegra, com cliente, mesa, horário e nota. Se não houver, diga que nenhum cliente comentou.
- As avaliações da loja 40695 entram na Kantine Matriz. Se a mesa da avaliação for do quiosque ou a comanda ligada tiver só itens Natal 2026, atribua ao Center Shopping.
- Na resposta do chat, inclua a nota média de cada loja e as notas abaixo de 5.

**Conferência** (rodapé): problemas do cruzamento categoria × nome, páginas não carregadas e qualquer dado que pareça inconsistente.

## 6. Publicação (página com link novo a cada uso)

1. Antes de escrever o HTML, carregue a skill `artifact-design` (e `dataviz` se houver gráfico, como faturamento por hora).
2. Monte uma página HTML única, legível no celular, com o título **"Reporte Kantine"**. **Cores fixas por operação** (use em cartões, marcadores e gráficos): **azul** para Kantine Matriz `#2a5d9c` (tema escuro `#82aee6`), **vinho** para Kantine Vinhedos `#7b3046` (escuro `#e08ba2`), **verde** para Kantine Center Shopping `#2f7a4a` (escuro `#7cc79a`). Mantenha o mesmo layout dos relatórios anteriores. Mostre a data do relatório em destaque no topo e as seções na ordem: Consolidado → Matriz → Vinhedos → Center Shopping → Conferência.
3. **Link novo a cada uso (decisão de 23/11/2026)**: o link antigo vazou para quem não devia ver os dados, então **nunca reutilize o `url` de um relatório anterior**. Publique sempre um artifact novo (sem `url`, `icon: "chart"`), de modo que cada execução gere um link diferente. Não passe `capabilities` e não use o artifact do cache (seção 9) como página de relatório.
4. A página é privada. O usuário decide se compartilha o link pelo claude.ai.

## 7. Resposta no chat

Depois de publicar, responda curto, para leitura no celular:
- Uma linha por operação: `*Operação*: R$ X em N comandas · ticket R$ Y`.
- Total do grupo e 1–3 alertas (pedido grande, cancelamentos, problemas de conferência).
- O link da página.

## 8. Modo período e comparações

Se o argumento for um intervalo (semana, mês, `DD/MM a DD/MM`) ou uma comparação mensal/anual, leia `period-mode.md` (nesta pasta) antes de coletar. No relatório diário, ignore esse arquivo.

## 9. Cache no banco da página (histórico)

Os resumos diários ficam guardados no banco do artifact de cache (https://claude.ai/artifact/WfY4v8DJ4S6uJowKWx7Nc8), que é **somente cache: privado, nunca compartilhe nem divulgue esse link e não publique relatório nele**, na coleção **`dias`**, um documento por dia com id `AAAA-MM-DD`. A regra de acesso é `read: admin, write: admin`: só o dono e editores leem e gravam, mesmo que a página seja compartilhada. O cache guarda só números e nomes de produtos, sem nome nem telefone de cliente.

- **Não republique o artifact de cache.** Ele só guarda o banco; os relatórios vão em artifacts novos.
- **Gravar depois de todo relatório (diário ou período):**
  1. Rode `calc.py` com `--json-dir <pasta>`. Ele grava um arquivo por dia com faturamento, comandas, itens, pessoas, canais (valor e comandas), pagamentos, faturamento por hora, produtos, descontos, pedidos grandes, cancelamentos e conferência. Também marca `dia_fechado` (verdadeiro se o dia já tinha terminado na hora da busca).
  2. Transcreva as avaliações num arquivo de texto (uma por linha: `LOJA MM-DD HH:MM MESA NOTA CRITERIOS [COMENTARIO]`, hora local, critérios como 4 dígitos comida/atendimento/preço/ambiente ou `-`) e rode `python3 scripts/ratings.py <arquivo> <pasta>`. Ele acrescenta a cada dia o campo `avaliacoes`: por loja (`M`, `V` e, se houver, `CS`), `total`, `media`, `criterios` (comida, atendimento, preco, ambiente), `com_criterios`, `abaixo_de_5` (mesa, hora, nota, critérios abaixo de 5) e `comentarios` (mesa, hora, nota, texto). Não guarde nome nem telefone.
  3. Grave com `ArtifactData`: `set` em `dias/<AAAA-MM-DD>` com `file_path`. Se o documento já existir, leia antes (`get`) e passe o `version` em `if_version`. Para vários dias, use `batch` (até 50 por chamada).
- **Ler para um período:** `ArtifactData` `list` na coleção `dias` com `out_dir` (pagine com `query.cursor`, até 1000 por página) e rode `python3 scripts/period.py <out_dir> <início> <fim>`. Ele soma o período e mostra a série por dia, o melhor e o pior dia, a média por dia da semana, canais, pagamentos, descontos, produtos, pedidos grandes, avaliações abaixo de 5, comentários, cancelamentos e a conferência. Também lista os dias gravados antes de fechar, que precisam ser buscados de novo.
- **Sempre buscar de novo no Takeat:** dias ausentes do cache, dias com `dia_fechado: false`, **dias gravados com a regra antiga (sem `regra: "takeat-2026-11-26"` nas operações; tudo antes de 26/11/2026)** e os últimos 7 dias (cancelamentos e ajustes do iFood ainda podem mudar o número). Dias mais antigos que isso valem como estão no cache.
- **Na tarefa automática das 22h30:** grave o dia de hoje como `dia_fechado: false`. Grave também o dia anterior completo, buscando de novo no Takeat, para que fique como `dia_fechado: true`.

