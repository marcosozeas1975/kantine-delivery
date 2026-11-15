---
name: metak
description: MetaK — painel de acompanhamento das metas de Kantitones do Natal 2026 (2.800 mini Kantitones e 2.200 Kantitones tradicionais e recheados, somando as três operações Kantine). Use quando o usuário digitar /metak ou /MetaK, pedir para "atualizar as metas", "como estão as metas de Kantitone" ou quando a tarefa agendada das 22h30 rodar.
---

# MetaK — Metas de Kantitones Natal 2026

Atualiza o painel **"Metas Kantitone Natal 2026"** com as vendas reais das três operações e responde um resumo curto no chat.

- **Link fixo do painel**: https://claude.ai/artifact/WwZtqANxqABqUufhaFnhTf (tipo "Data"/Dashboard, criado em 15/11/2026). Nunca crie outro painel. Se esse link não existir mais, procure com `Artifact` `action: "list"` um artifact com esse título; se não achar, avise e pare.
- **Não mexa no visual nem nas fórmulas** do painel (`files/index.html` e os cálculos dentro dele). A atualização diária troca **só o arquivo de dados**.

## 1. Regras das metas (aprovadas pelo usuário em 15/11/2026)

- **Período**: 01/11/2026 a 31/12/2026.
- **Operações somadas**: Kantine Gastronomia (Matriz sem Natal 2026), Kantine Vinhedos e Kantine Center Shopping (itens Natal 2026 da loja 40695). A separação é a mesma do ReporteK (`.claude/skills/reportek/SKILL.md`, seção 2).
- **Quais produtos contam** (pelo nome do produto vendido, já aplicado em `scripts/metas.py`):
  - entra todo produto com `Kantitone`, `Chocotone` ou `Panetone` no nome;
  - **não entra**: fatia, rabanada, bombom, cobertura, tostada e "meio";
  - com `mini` no nome → meta **Mini Kantitones (2.800)**; os demais → meta **Tradicionais e recheados (2.200)**, incluindo Maxi (700g), recheados (800g), tradicional grande (400g), "Chocotone" e panetone de frutas.
  - Itens cancelados não contam (o `calc.py` do ReporteK já exclui).
- Se aparecer um produto novo que pareça Kantitone e não entre nessa regra (ou entre sem dever), **não mude a regra sozinho**: conte como está e cite o nome no resumo para o usuário decidir.

## 2. Dados

Fonte: conector **Takeat Multilojas** (`mcp__Takeat_Multilojas__*`) e o cache diário do ReporteK.

1. **Cache do ReporteK**: `ArtifactData` `list` na coleção `dias` do artifact https://claude.ai/artifact/WfY4v8DJ4S6uJowKWx7Nc8 com `out_dir` (pagine com `query.cursor`, até 1000 por página). Só **leia** esse cache; quem grava nele é o ReporteK.
2. **Buscar no Takeat** (sempre, para não depender do horário em que o ReporteK roda):
   - hoje e ontem (fuso `America/Sao_Paulo`);
   - qualquer dia entre 01/11/2026 e ontem que falte no cache ou esteja com `dia_fechado: false`.
   Para cada trecho: `get_table_sessions(restaurant_id=40695 e 43896, start_date, end_date, limit=100)`, seguindo `pagination.next.cursor` até `has_more=false`. Confirme os IDs com `list_restaurants`.
   Também rode `get_products(restaurant_id=40695)` para o conjunto de itens NATAL 2026.
3. Gere os resumos dos dias buscados com o script do ReporteK, numa pasta separada:
   ```
   python3 .claude/skills/reportek/scripts/calc.py <get_products Matriz> --json-dir <pasta_novos> \
     --m <páginas da Matriz...> --v <páginas da Vinhedos...>
   ```
4. Junte numa pasta só: primeiro os arquivos do cache, depois os de `<pasta_novos>` por cima (o que foi buscado agora vale mais que o cache).
5. Monte o arquivo do painel:
   ```
   python3 .claude/skills/metak/scripts/metas.py <pasta_dos_dias> <saida>/vendas_kantitone.json 2026-11-01
   ```
   Ele grava `{rows, meta}`: uma linha por dia + operação + produto, com `data`, `operacao`, `grupo`, `produto`, `qtd`, `faturamento`, e o próprio código em `meta`.

## 3. Publicar no painel

1. Leia o dataset atual: `ArtifactData` `get` em `datasets/vendas` do painel. Guarde `version` e o `source.url` antigo (`/_blob/<id>`).
2. Envie o arquivo novo: `Artifact` com `url` do painel, `asset: true`, `file_path` = `vendas_kantitone.json` (chamada só para ele). Pegue o novo `/_blob/<id>`.
3. Atualize o dataset com `ArtifactData` `update` em `datasets/vendas`, `if_version` = a versão lida, trocando só:
   - `source.url` = o novo `/_blob/<id>`;
   - `updated` = `{at: <agora UTC ISO>, by: "claude"}`;
   - `edit` = `{via: "claude", at: <agora UTC ISO>}`.
4. Apague o arquivo antigo: `Artifact` `action: "delete"` com `url` do painel e `path` = id antigo (32 caracteres). Só apague se o novo já estiver gravado no dataset.
5. Confira: `ArtifactData` `get` em `data/users/me/check` e `data/users/me/runs`. Se ninguém estiver com o painel aberto, pode não haver checagem; isso não é erro.

## 4. Resposta no chat

Curta, para celular:
- `*Mini Kantitones*: X de 2.800 (Y%) · precisa Z/dia · média 7 dias W/dia`
- `*Tradicionais e recheados*: X de 2.200 (Y%) · precisa Z/dia · média 7 dias W/dia`
- Vendas do dia por meta e a loja que mais vendeu.
- Até 2 alertas: produto novo fora da regra, dia sem dados, cancelamentos grandes de Kantitone.
- O link do painel.

Calcule esses números do mesmo jeito que o painel: dias restantes = de amanhã até 31/12 a partir do último dia com dados; precisa por dia = falta ÷ dias restantes; média 7 dias = soma dos 7 dias até o último dia com dados ÷ 7.

## 5. Tarefa agendada

A tarefa "MetaK diário" roda todo dia às 22h30 (America/Sao_Paulo) e executa esta skill. Não altere arquivos do repositório nem faça commit nessa execução. Se algo falhar (Takeat desconectado, painel não encontrado, envio do arquivo recusado), diga claramente no resumo o que falhou e não apague o arquivo antigo.
