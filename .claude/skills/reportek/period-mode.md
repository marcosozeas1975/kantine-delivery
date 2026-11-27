Extraído do SKILL.md para o relatório diário não carregar este trecho. Leia este arquivo **só** quando o argumento de /ReporteK for um intervalo ou uma comparação mensal/anual. Tudo o que vale para o dia (seções 1 a 7 do SKILL.md) vale aqui, com as diferenças abaixo.

# Modo período (semana, mês ou intervalo)

Use quando o argumento for um intervalo. Tudo o que vale para o dia vale aqui, com estas diferenças:

- **Use o cache primeiro (seção 9 do SKILL.md).** Busque no Takeat só os dias que faltam no cache, os gravados com `dia_fechado: false` e os últimos 7 dias. Depois grave esses dias no cache e consolide com `scripts/period.py`.
- **Como buscar muitos dias sem estourar o contexto:**
  - Faça uma consulta por dia e por loja (`start_date = end_date = dia`), várias em paralelo. Respostas grandes vão para arquivos em `tool-results/`, e é isso que o script lê.
  - Uma página pequena (menos de ~10 comandas, típica da 2ª página de um dia) volta **dentro da conversa**, sem arquivo. Não copie à mão: busque de novo o mesmo trecho com uma janela ISO maior, que inclua a sobra do dia e a manhã seguinte (ex.: `2026-10-07T21:00:00Z` a `2026-10-08T14:30:00Z`). Ela volta grande e vai para arquivo. O `calc.py` remove comandas repetidas pelo id.
  - Para a 2ª página, prefira a janela ISO (1 h antes da última comanda da 1ª página até a manhã seguinte) em vez do cursor. Em sábado, termine a janela às 02:59:59Z do domingo.
  - Domingos: Matriz (salão) e Vinhedos fecham, mas o **quiosque do Center Shopping abre**. Busque o domingo da loja 40695 sempre que estiver dentro do período do quiosque.
  - `get_ratings` de um mês inteiro volta dentro da conversa (sem arquivo). Transcreva só o necessário para o cache (loja, data, hora local, mesa, nota, critérios e comentário), sem nome e sem telefone.
- **Coleta dos dias que faltam**: `get_table_sessions` com `start_date` = primeiro dia e `end_date` = último dia de cada trecho que falta. Siga **todas** as páginas: um mês da Matriz pode passar de 40 páginas. Avise o usuário no começo que um mês leva alguns minutos. `get_ratings` aceita no máximo 92 dias por consulta, com `end_date` = último dia + 1 e filtro pelo horário local.
- **Center Shopping**: só entra nos dias entre 06/11/2026 e 05/01/2027. O script já aplica essa janela. Se o período começa antes ou termina depois, diga na página em que dias o quiosque operou e calcule a média por dia só sobre esses dias.
- **Conteúdo** (no lugar do gráfico por hora):
  - Cartões do consolidado com total do período, comandas, ticket médio e **média por dia** de cada operação.
  - **Evolução dia a dia**: gráfico de barras ou linhas com o faturamento diário das três operações, nas cores fixas. Use a saída `dias` do script.
  - **Melhor e pior dia** de cada operação, com o dia da semana.
  - Em período de 14 dias ou mais, a **média por dia da semana** (seg a dom) de cada operação.
  - Rankings, canais, pagamentos, cancelamentos, descontos e avaliações somados no período. Nas avaliações, liste todas as notas abaixo de 5 e todos os comentários do período.
  - Pedidos fora da curva: comandas que representem 10% ou mais do faturamento de um dia, listadas com a data.
- **Publicação**: link fixo próprio do período, título **"Reporte Kantine Período"**, mesmas cores e mesmo estilo do diário. No topo, mostre o período em destaque (ex.: "01/11 a 30/11/2026 · 30 dias").
  - **Link fixo do período (decisão de 26/11/2026):** https://claude.ai/artifact/TtKR4gSLJpzRSWPcjACJNb. Faça `action: "read"` nele e publique com o mesmo `url`. Não use os links de período antigos (TyctYf…), que foram aposentados.
  - O relatório **diário** continua com link novo a cada uso (seção 6 do SKILL.md).
  - **Nunca** publique um período no artifact do cache (seção 9 do SKILL.md).

## Comparação mensal e anual (relatório de pagamentos do Takeat)

Para faturamento por mês (ou comparar anos), **não baixe comandas**: use `get_payments_report` com `report: "summary"`.
- Mensal: `granularity: "monthly"`, `start_month`/`end_month` (AAAA-MM), `fill: true`, uma chamada por loja.
- Diário (para recortar a mesma janela em anos diferentes): `granularity: "daily"`, `start_date`/`end_date`.
- Use o campo **`gross_revenue_windowed`**: é o "Faturamento Total" do painel do Takeat (conferido: Vinhedos 01–26/11/2026 = R$ 156.783,44, igual à tela). Ele inclui iFood com taxa de entrega e o delivery próprio (`delivery_revenue_windowed`).
- O mês corrente vem com `is_partial: true`; diga até que dia vai (`sources.productive_day`).
- O relatório não separa o Natal 2026: compare o **CNPJ da Matriz inteiro** (Matriz + Center Shopping) com o ano anterior, e avise que em 2025 não havia a separação.
- Requer a permissão `reports:payments:read` no conector Takeat Multilojas (liberada em 27/11/2026). Se vier 403, peça ao usuário para reconectar o conector e aceitar a permissão de relatórios.
