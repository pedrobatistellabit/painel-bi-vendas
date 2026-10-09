// Conversão entre as linhas do painel e as colunas do banco (Supabase).
const test = require('node:test');
const assert = require('node:assert');
const Cloud = require('../js/cloud.js');

test('sem configuração o modo equipe fica desligado', () => {
  assert.strictEqual(Cloud.enabled, false);
});

test('atendimento vai e volta do banco sem perder dados', () => {
  const r = {
    id: 'L1', data_lead: new Date(2026, 2, 2), corretor: 'Ana', cep: 80420000, lat: -25.44, lng: NaN,
    valor_fechamento: 500000, comissao: null, pretensao: 'Venda', data_visita: null, status_visita: ''
  };
  const db = Cloud._toDb('atendimentos', r, 7, 3);
  assert.strictEqual(db.importacao_id, 7);
  assert.strictEqual(db.linha, 3);
  assert.strictEqual(db.codigo, 'L1');
  assert.ok(!('id' in db));
  assert.strictEqual(db.cep, '80420000');
  assert.strictEqual(db.lng, null);
  assert.strictEqual(db.status_visita, null);
  assert.strictEqual(db.data_lead, r.data_lead.toISOString());
  assert.strictEqual(db.equipe, null);

  const back = Cloud._fromDb('atendimentos', Object.assign({}, db, { valor_fechamento: '500000' }));
  assert.strictEqual(back.id, 'L1');
  assert.strictEqual(back.data_lead.getTime(), r.data_lead.getTime());
  assert.strictEqual(back.valor_fechamento, 500000);
  assert.strictEqual(back.lng, null);
});

test('imóvel converte área e data de cadastro', () => {
  const db = Cloud._toDb('imoveis', { imovel_ref: 'AP1', area_m2: 85, data_cadastro: new Date(2026, 5, 10), valor: 890000 }, 1, 1);
  const back = Cloud._fromDb('imoveis', db);
  assert.strictEqual(back.area_m2, 85);
  assert.strictEqual(back.data_cadastro.getMonth(), 5);
  assert.strictEqual(back.imovel_ref, 'AP1');
});
