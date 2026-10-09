# Painel BI de Vendas — Kenlo Inteligência

Painel de BI que reproduz os relatórios do **Kenlo Inteligência** (Kenlo Imob) a partir das planilhas exportadas do próprio Kenlo. Ele roda direto no navegador, sem servidor nem banco de dados. Os dados ficam só no navegador de quem usa.

Base: os artigos da central de ajuda do Kenlo, pasta *Imob - Kenlo Inteligência*
(<https://fresh.kenlo.com.br/support/solutions/folders/156000250065>).

## Relatórios

| Aba | Relatório do Kenlo | O que mostra |
|---|---|---|
| Funil Imobiliário | BI · Funil imobiliário | Leads, visitas, propostas e fechamentos com variação contra o período anterior; conversão por etapa; performance mensal; visitas e propostas por status; performance por equipe, com a equipe que mais fechou em destaque; valor total fechado e comissão |
| Corretores | BI · Relatório de Corretores / Ranking | Performance geral por corretor (leads, visitas, propostas, fechamentos, conversões, comissão), top 10, status de visitas e de propostas por corretor |
| VGL · VGV | BI · Relatório VGL - VGV | Cartões de VGV/VGL, unidades e comissões; top 10 corretores por VGV e por VGL; VGV/VGL por unidade e mídias de fechamento, separados por mercado (primário/secundário); tabela geral com as mesmas colunas do Kenlo |
| Eficiência por Canal | Eficiência por Canal (Mídias) | Participação (%) e quantidade de leads e fechamentos por grupo de mídia; visitas e propostas por status; visão diária (períodos de até 62 dias) ou mensal; performance por mídia |
| Leads por Imóvel | BI · Leads por Imóvel | Total de leads, imóveis, cidades e bairros; top 10 imóveis e bairros; tabela por mídia de origem; mapa por latitude/longitude |
| Lead Time | Visão de Mercado: Leads Time | Tempo médio e mediano Lead→Visita, Visita→Proposta, Proposta→Fechamento e total; venda × locação; por corretor e por grupo de mídia |
| Proprietários e Carteira | BI · Proprietários + Carteira de Imóveis | Proprietários, imóveis, bairros, VGV/VGL em estoque, ticket médio, top 20 bairros, R$/m² por bairro, captação mensal e lista de proprietários |
| Relatório Detalhado | BI · Relatório Detalhado | Todos os atendimentos do período, com ordenação e exportação |

**Filtros**, iguais aos do Kenlo: período (com atalhos), unidade, equipe, corretor, captador, pretensão, mercado, grupo de mídia, mídia, tipo de imóvel e cidade. Todas as tabelas ordenam ao clicar no título da coluna e exportam CSV (separado por `;`, abre direto no Excel).

### Regras de cálculo

- **Funil:** cada etapa é contada pela própria data. Leads usam a data do lead, visitas a data da visita, e assim por diante. A conversão de uma etapa é a contagem dela dividida pela da etapa anterior. A variação compara com o período anterior de mesma duração.
- **VGV / VGL:** soma do valor dos fechamentos de venda / locação no período.
- **Lead time:** coorte pela data de entrada do lead. Só entram leads que avançaram para a etapa seguinte.
- **R$/m² e ticket médio:** só imóveis ativos. Ficam fora vendas abaixo de R$ 50 mil ou acima de R$ 100 milhões, e locações abaixo de R$ 10 ou acima de R$ 100 mil, como no Kenlo.

## Como usar

1. Abra `index.html` no navegador (duplo clique). Para servir em rede local: `npm start` e acesse <http://localhost:8080>.
2. Ele abre com **dados de demonstração** fictícios (marcados como "demonstração" no topo).
3. Clique em **Importar planilhas** e arraste os arquivos exportados do Kenlo:
   - **Atendimentos (funil):** Indicadores › BI › *Relatório Detalhado* › três pontos › exportar. No **Explorer** você também pode montar um bloco com as colunas do modelo e baixar em CSV, sem limite de linhas.
   - **Carteira:** *Relatório Proprietários* exportado da mesma forma.
4. O painel reconhece as colunas pelo nome, sem diferenciar acentos ou maiúsculas, e mostra quais encontrou. Datas `dd/mm/aaaa`, valores `R$ 1.234,56` e serial de data do Excel são aceitos. O tipo de planilha é detectado sozinho.

Modelos com todas as colunas reconhecidas: [`data/modelo_atendimentos.csv`](data/modelo_atendimentos.csv) e [`data/modelo_imoveis.csv`](data/modelo_imoveis.csv). Os apelidos de cada coluna estão em `js/model.js` (`ATENDIMENTO_FIELDS`, `IMOVEL_FIELDS`). Se a sua exportação usa outro nome de coluna, acrescente o apelido ali.

## O que fica de fora

Os relatórios de **Visão de Mercado** do Kenlo (estoque, preço por m², leads e corretores comparados com bairro, cidade, estado e ecossistema Kenlo) dependem da base de mercado do Kenlo, que não sai nas exportações. O painel mostra os mesmos indicadores **só da sua carteira** (R$/m², ticket médio, captação, lead time), sem a comparação com o mercado.

## Estrutura

```
index.html          página do painel
css/style.css       visual (tema claro e escuro)
js/model.js         reconhecimento de colunas e normalização das planilhas
js/metrics.js       cálculo de todos os indicadores (funções puras)
js/demo.js          gerador de dados de demonstração
js/app.js           filtros, abas, gráficos (Chart.js) e importação (SheetJS)
data/               modelos de planilha
tests/              testes dos cálculos (npm test)
```

Bibliotecas carregadas por CDN: Chart.js 4.4.1 e SheetJS 0.18.5. Sem internet as tabelas e os indicadores continuam funcionando, e CSV importa normalmente. Só os gráficos e a leitura de `.xlsx` precisam das bibliotecas.
