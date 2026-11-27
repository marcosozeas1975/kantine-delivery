---
name: encomendak
description: EncomendaK — relatório diário das encomendas com agendamento (campo scheduled_to do Takeat) das operações Kantine Matriz, Kantine Vinhedos e Site, separadas por categoria (Natal, Sobremesas de Natal, Bolos, Revenda etc.), com destaque das pendentes de entrega por dia e categoria. Use quando o usuário digitar /EncomendaK ou /encomendak, pedir "as encomendas", "encomendas agendadas", "o que tenho para entregar", ou quando a tarefa agendada das 22h30 rodar.
---

# EncomendaK — Encomendas com agendamento

Gera uma página única com todas as comandas que têm `scheduled_to` (data/hora de retirada ou entrega), desde **01/11/2026**, destacando as **pendentes de entrega** agrupadas por **dia de entrega → categoria**. Atualiza sempre o **mesmo link fixo** (decisão do usuário em 23/11/2026, diferente do ReporteK, que gera link novo a cada uso).

Fonte: conector **Takeat Multilojas** (`mcp__Takeat_Multilojas__*`; carregue com ToolSearch). Lojas: Matriz `40695` e Vinhedos `43896` (confirme com `list_restaurants`; nunca escolha loja automaticamente).

## Regras

- **Unidades**: *Matriz* (loja 40695), *Vinhedos* (loja 43896) e *Site* = comandas que tenham pelo menos um item da categoria **"Site Kantine"** (a comanda inteira vai para Site, em qualquer loja). Itens "NATAL 2026" (Center Shopping) **não** têm encomendas e ficam fora desta análise.
- **Exceções manuais**: a comanda `#4722` (Matriz) é produto da loja lançado por engano na categoria Site Kantine e conta como **Matriz**. Novas exceções vão em `EXCECOES` no script.
- **Prefixo "Site"**: desde 27/11/2026 todo produto da categoria "Site Kantine" no Takeat começa com "Site - " (para a loja não lançá-los por engano). A chave da integração com o site é o SKU, não o nome. O backup dos nomes antigos está em `data/site_nomes_antes_2026-11-27.json`. A classificação por categoria do relatório ignora o prefixo.
- **Pendente** = `scheduled_to` (horário local = UTC−3) de **hoje em diante** e não cancelada. Atenção: a comanda de encomenda costuma estar `completed`/paga mesmo antes da entrega, então **não use o status** para saber se foi entregue; use a data.
- **Cancelada**: status `canceled` ou `delivery_canceled_at` preenchido. Itens cancelados saem do total.
- **Retirada** quando `with_withdrawal` é verdadeiro; senão, Entrega.
- **Categorias do relatório** (ordem fixa): Natal (categorias NATAL, NATAL 2026, KANTITONES e itens com kantitone/chocotone/panetone/gingerbread/natal no nome), Sobremesas de Natal, Bolos e sobremesas, Doces e pâtisserie, Cestas e presentes, Revenda, Outros. A lógica está em `grupo()` no script; ajuste lá se criarem categorias novas.
- **Privacidade**: nunca exiba nome, telefone ou endereço de cliente; só o número da comanda.

## Coleta

1. `get_products` das duas lojas (limit 100) para mapear produto → categoria (os arquivos são grandes e vão para `tool-results/`; não leia no contexto).
2. `get_table_sessions` por loja, de `2026-11-01` até hoje, **um dia por chamada** (`start_date = end_date`, `limit=100`; os dias podem rodar em paralelo). Para cada dia com `has_more=true`, siga `pagination.next.cursor` **com os mesmos filtros** até `has_more=false`. A API filtra pela data de **criação** da comanda, não pela entrega; por isso o intervalo vai desde 01/11. Nunca trate a primeira página como total.
   - **Respostas inline**: se uma página voltar no corpo da resposta em vez de ser salva em arquivo, **refaça a mesma chamada (mesmos filtros e cursor) com `limit` menor, por exemplo 60**, até ela ser salva. Nunca deixe páginas de fora do script nem suponha que não têm encomendas.
   - **`--today`** é a data de hoje no fuso `America/Sao_Paulo` (`TZ=America/Sao_Paulo date +%F`), nunca a data UTC: às 22h30 a data UTC já é a do dia seguinte.
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
3. A página é privada; o usuário decide se compartilha. **Sempre publique com `capabilities: {"downloads": true}`** (o botão "Imprimir lista (A4)" salva um HTML formatado em A4 com os filtros ativos; `window.print()` não funciona dentro de artifacts).

**Link fixo atual**: https://claude.ai/artifact/Br7qZ9ci8FhChdxikh641s (criado em 23/11/2026, privado)

## Resposta no chat

Curta, para celular: pendentes (nº e valor), as de hoje e amanhã, o que produzir no próximo dia, pontos da conferência e o link.

## Agendamento

Roda todo dia às 22h30 (America/Sao_Paulo) atualizando o mesmo link.

## Modo incremental (em teste, a rotina ainda usa o modo completo)

Objetivo: gastar menos buscando só o que pode ter mudado. Scripts: `scripts/coleta.py` (extrair, mesclar, dias) e `scripts/encomendas.py --cache-dir`.

- **Cache**: um documento por loja e dia de criação em `dias/_encomendas/docs/<L>-<AAAA-MM-DD>` (L = M Matriz, V Vinhedos) no artifact de cache `WfY4…`. Esse caminho herda a proteção da coleção `dias` (confirmado com `as_level: view`); **não** use uma coleção `encomendas` solta, que fica legível por qualquer viewer.
- **Dias a buscar** (`coleta.py dias --cache DIR --hoje AAAA-MM-DD`): janela A = hoje e os 2 dias anteriores nas duas lojas; janela B = dias de criação das comandas "vivas" (entrega nos últimos 7 dias ou futura, ou comanda aberta); janela C = todos os dias desde 01/11 (`--completo`, aos domingos ou com cache vazio).
- **Mesclar** (`coleta.py mesclar`): o documento novo de cada dia buscado substitui o do cache; dia buscado sem agendamento apaga o documento. Gera a lista de mudanças (nova, cancelada, item, entrega, pago, tipo, removida).
- **Página** (`encomendas.py --cache-dir DIR --mudancas ARQ.json`): gera o mesmo HTML do modo completo (verificado) e acrescenta a seção "Mudanças desde a última atualização".
- Escritas no cache: `ArtifactData` `batch` (até 50 por chamada), com `if_version` nos documentos que já existem.

### Procedimento em paralelo (noites de teste: o modo incremental roda DEPOIS do modo completo e NÃO publica)

Variáveis: `HOJE` = data de São Paulo (`TZ=America/Sao_Paulo date +%F`); `W` = pasta de trabalho nova (ex.: `/tmp/enc_inc`); `CACHE` = `https://claude.ai/artifact/WfY4v8DJ4S6uJowKWx7Nc8`; `S` = `.claude/skills/encomendak/scripts`. Lojas: `M` = 40695 (marca 877), `V` = 43896 (marca 845).

1. **Ler o cache**: `ArtifactData` `list` em `CACHE`, coleção `dias/_encomendas/docs`, `query.limit` 1000, `out_dir` = `W/cache`. Anote a `version` de cada documento.
2. **Dias a buscar**: `python3 -I S/coleta.py dias --cache W/cache --hoje HOJE` (acrescente `--completo` se HOJE for domingo: `date +%u` = 7). A saída traz uma linha `L:AAAA-MM-DD` por loja e dia.
3. **Produtos**: `get_products` uma vez por loja (as respostas vão para arquivo; não leia no contexto).
4. **Comandas**: para cada linha da lista, `get_table_sessions` com `restaurant_id` da loja, `start_date = end_date = dia`, `limit` 100, seguindo `pagination.next.cursor` até `has_more=false`. Vários dias em paralelo. Páginas que voltarem inline (sem arquivo): refaça a busca numa janela ISO maior (1 h antes da primeira comanda necessária até a manhã seguinte) até ser salva em arquivo e confira os ids. Conte as chamadas de `get_table_sessions` (para comparar com o modo completo).
5. **Extrair e mesclar**: `coleta.py extrair --pm <produtos M> --pv <produtos V> --m <sessões M> --v <sessões V> --out W/novo`; depois `coleta.py mesclar --cache W/cache --novo W/novo --dias <todas as linhas do passo 2, como argumentos separados> --saida W/saida --mudancas W/mud.json`.
6. **Gravar o cache** (só o que mudou): `ArtifactData` `batch` em `CACHE`, coleção `dias/_encomendas/docs`: `set` com `file_path` = `W/saida/escrever/<doc>.json` para cada documento a escrever (com `if_version` quando o documento já existia no cache) e `delete` (com `if_version`) para cada id de `W/saida/apagar.txt`. Se o lote falhar por versão, releia, refaça `mesclar` e tente de novo uma vez.
7. **Montar a página de teste**: copie `W/cache` para `W/merged`, aplique as escritas e exclusões do passo 6 e rode `python3 -I S/encomendas.py --today HOJE --since 2026-11-01 --out W/sombra.html --cache-dir W/merged --mudancas W/mud.json`.
8. **Comparar com a página publicada pelo modo completo**: `Artifact` `read` com `path: "index.html"` no link fixo das encomendas (salva um arquivo) e `python3 -I S/comparar.py <arquivo publicado> W/sombra.html`.
9. **Relatório** (máx. 20 linhas): resultado do comparador (IDENTICO ou as diferenças), quantas chamadas de `get_table_sessions` o incremental fez (e quantas páginas), quantos documentos leu, escreveu e apagou, a lista de mudanças (máx. 10) e qualquer falha. **Não publique nada.**
