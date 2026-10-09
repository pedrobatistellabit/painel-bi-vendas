// Rode com: node --test tests/
const test = require('node:test');
const assert = require('node:assert');
const Model = require('../js/model.js');
const M = require('../js/metrics.js');

const d = (s) => Model.parseDate(s);
const range = { start: d('01/03/2026'), end: new Date(2026, 2, 31, 23, 59, 59) };

const rows = Model.normalizeAtendimentos([
  { 'Data de Cadastro do Lead': '02/03/2026', Corretor: 'Ana', Equipe: 'A', 'Mídia': 'Zap', 'Grupo de mídia': 'Portais', 'Pretensão': 'Venda', Mercado: 'Secundário',
    'Data da visita': '05/03/2026', 'Status da visita': 'Realizada', 'Data da proposta': '10/03/2026', 'Status da proposta': 'Aceita',
    'Data de Fechamento': '20/03/2026', Valor: 'R$ 500.000,00', 'Comissão': '30.000' },
  { 'Data de Cadastro do Lead': '03/03/2026', Corretor: 'Ana', Equipe: 'A', 'Mídia': 'Site', 'Grupo de mídia': 'SEO', 'Pretensão': 'Aluguel',
    'Data da visita': '06/03/2026', 'Status da visita': 'Cancelada' },
  { 'Data de Cadastro do Lead': '04/03/2026', Corretor: 'Bia', Equipe: 'B', 'Mídia': 'Zap', 'Grupo de mídia': 'Portais', 'Pretensão': 'Locação',
    'Data da visita': '06/03/2026', 'Status da visita': 'Realizada', 'Data da proposta': '08/03/2026', 'Status da proposta': 'Aceita',
    'Data de Fechamento': '12/03/2026', Valor: '3500', 'Comissão': '3500' },
  { 'Data de Cadastro do Lead': '15/02/2026', Corretor: 'Bia', Equipe: 'B', 'Mídia': 'Zap', 'Grupo de mídia': 'Portais', 'Pretensão': 'Venda' }
]).rows;

test('normaliza cabeçalhos, datas, números e pretensão', () => {
  assert.strictEqual(rows[0].valor_fechamento, 500000);
  assert.strictEqual(rows[0].comissao, 30000);
  assert.strictEqual(rows[1].pretensao, 'Locação');
  assert.strictEqual(rows[0].data_lead.getDate(), 2);
  assert.strictEqual(Model.parseNumber('1.234.567,89'), 1234567.89);
  assert.strictEqual(Model.parseNumber('1234.5'), 1234.5);
  assert.strictEqual(Model.detectKind(['Referência', 'Proprietário', 'Bairro']), 'imoveis');
});

test('funil conta cada etapa pela própria data', () => {
  const f = M.funnel(rows, range);
  assert.deepStrictEqual([f.leads, f.visitas, f.propostas, f.fechamentos], [3, 3, 2, 2]);
  assert.strictEqual(f.valor, 503500);
  assert.strictEqual(f.conv.fechamentos, 1);
  const c = M.funnelWithComparison(rows, range);
  assert.strictEqual(c.anterior.leads, 1);
  assert.strictEqual(c.variacao.leads, 2);
});

test('VGV e VGL separam venda e locação', () => {
  const v = M.vglVgv(rows, range);
  assert.strictEqual(v.cards.vgv, 500000);
  assert.strictEqual(v.cards.vgl, 3500);
  assert.strictEqual(v.cards.unidades_vendidas, 1);
  assert.strictEqual(v.ranking_vgv[0].nome, 'Ana');
  assert.strictEqual(v.tabela[0].dias_ate_fechamento, 18);
});

test('eficiência por canal calcula participação', () => {
  const e = M.eficienciaCanal(rows, range);
  const portais = e.grupos.find((g) => g.nome === 'Portais');
  assert.strictEqual(portais.share_fechamentos, 1);
  assert.ok(Math.abs(portais.share_leads - 2 / 3) < 1e-9);
});

test('lead time em dias', () => {
  const lt = M.leadTime(rows, range);
  assert.strictEqual(lt.geral[0].media, (3 + 3 + 2) / 3);
  assert.strictEqual(lt.geral[3].media, (18 + 8) / 2);
  assert.strictEqual(lt.venda[3].media, 18);
});

test('filtros por dimensão', () => {
  assert.strictEqual(M.applyFilters(rows, { corretor: 'Bia' }).length, 2);
  assert.strictEqual(M.applyFilters(rows, { corretor: '' }).length, 4);
});

test('carteira ignora inativos e valores fora da faixa no R$/m²', () => {
  const im = Model.normalizeImoveis([
    { 'Referência': 'ap1', 'Proprietário': 'X', Bairro: 'Batel', 'Pretensão': 'Venda', Valor: '600000', 'Área': '60', Status: 'Ativo' },
    { 'Referência': 'ap2', 'Proprietário': 'Y', Bairro: 'Batel', 'Pretensão': 'Venda', Valor: '400000', 'Área': '40', Status: 'Inativo' },
    { 'Referência': 'ap3', 'Proprietário': 'X', Bairro: 'Batel', 'Pretensão': 'Venda', Valor: '1000', 'Área': '40', Status: 'Ativo' }
  ]).rows;
  const c = M.carteira(im, {});
  assert.strictEqual(im[0].imovel_ref, 'AP1');
  assert.strictEqual(c.cards.proprietarios, 2);
  assert.strictEqual(c.cards.ativos, 2);
  assert.strictEqual(c.preco_m2[0].preco_m2, 10000);
});
