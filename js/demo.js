/*
 * Dados de demonstração (fictícios) no mesmo formato normalizado de model.js,
 * para explorar o painel antes de importar as planilhas reais do Kenlo.
 */
(function (root) {
  'use strict';

  function rng(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const UNIDADES = ['Centro', 'Zona Sul'];
  const EQUIPES = { Centro: ['Equipe Alfa', 'Equipe Beta'], 'Zona Sul': ['Equipe Gama'] };
  const CORRETORES = {
    'Equipe Alfa': ['Ana Souza', 'Bruno Lima', 'Carla Mendes'],
    'Equipe Beta': ['Diego Rocha', 'Elisa Prado', 'Fábio Nunes'],
    'Equipe Gama': ['Gabriela Reis', 'Heitor Alves', 'Isabela Costa', 'João Martins']
  };
  const MIDIAS = [
    ['Zap Imóveis', 'Portais nacionais', 0.22], ['Viva Real', 'Portais nacionais', 0.18], ['OLX', 'Portais nacionais', 0.12],
    ['Site próprio', 'Site / SEO', 0.14], ['Google Ads', 'Anúncios pagos', 0.1], ['Meta Ads', 'Anúncios pagos', 0.1],
    ['Instagram', 'Redes sociais', 0.06], ['Indicação', 'Indicação / Relacionamento', 0.05], ['Placa', 'Offline', 0.03]
  ];
  const CIDADE = 'Curitiba';
  const BAIRROS = [
    ['Batel', -25.4428, -49.2900, 11500], ['Água Verde', -25.4500, -49.2800, 8800], ['Centro', -25.4296, -49.2713, 7200],
    ['Bigorrilho', -25.4350, -49.2950, 10200], ['Portão', -25.4750, -49.2950, 6900], ['Cabral', -25.4100, -49.2600, 8400],
    ['Ecoville', -25.4450, -49.3300, 9600], ['Boa Vista', -25.3850, -49.2450, 6100], ['Cristo Rei', -25.4370, -49.2500, 8000],
    ['Santa Felicidade', -25.4050, -49.3300, 7000]
  ];
  const TIPOS = [['Apartamento', 0.6], ['Casa', 0.25], ['Sala comercial', 0.08], ['Terreno', 0.07]];
  const NOMES = ['Silva', 'Santos', 'Oliveira', 'Pereira', 'Ferreira', 'Almeida', 'Ribeiro', 'Carvalho', 'Gomes', 'Barbosa', 'Araújo', 'Moreira'];
  const PRIMEIROS = ['Maria', 'José', 'Paulo', 'Lucia', 'Marcos', 'Fernanda', 'Rafael', 'Juliana', 'Ricardo', 'Patrícia', 'André', 'Camila'];
  const EMPREENDIMENTOS = ['Residencial Araucária', 'Edifício Jardim Botânico', 'Torre Batel', 'Vila Barigui'];

  function pickWeighted(r, list, wi) {
    let x = r() * list.reduce(function (s, l) { return s + l[wi]; }, 0);
    for (let i = 0; i < list.length; i++) { x -= list[i][wi]; if (x <= 0) return list[i]; }
    return list[list.length - 1];
  }
  function pick(r, list) { return list[Math.floor(r() * list.length)]; }
  function addDays(d, n) { return new Date(d.getTime() + n * 864e5); }

  function generate(today) {
    const r = rng(20261009);
    today = today || new Date();
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const start = new Date(end.getFullYear() - 2, end.getMonth(), 1);

    // Carteira
    const imoveis = [];
    for (let i = 1; i <= 480; i++) {
      const b = pick(r, BAIRROS);
      const tipo = pickWeighted(r, TIPOS, 1)[0];
      const pret = r() < 0.62 ? 'Venda' : 'Locação';
      const mercado = pret === 'Venda' && r() < 0.18 ? 'Primário' : 'Secundário';
      const area = Math.round(tipo === 'Terreno' ? 250 + r() * 500 : tipo === 'Casa' ? 90 + r() * 200 : tipo === 'Sala comercial' ? 30 + r() * 80 : 45 + r() * 120);
      const m2 = b[3] * (0.8 + r() * 0.4) * (tipo === 'Terreno' ? 0.45 : 1);
      const valor = pret === 'Venda' ? Math.round(area * m2 / 1000) * 1000 : Math.round(area * m2 * 0.0048 / 10) * 10;
      const unidade = b[0] === 'Portão' || b[0] === 'Água Verde' || b[0] === 'Ecoville' ? 'Zona Sul' : 'Centro';
      const prop = pick(r, PRIMEIROS) + ' ' + pick(r, NOMES);
      imoveis.push({
        imovel_ref: (tipo === 'Apartamento' ? 'AP' : tipo === 'Casa' ? 'CA' : tipo === 'Terreno' ? 'TE' : 'SA') + String(1000 + i),
        proprietario: prop,
        telefone: '(41) 9' + String(Math.floor(r() * 9e7) + 1e7).replace(/(\d{4})(\d{4})/, '$1-$2'),
        email: prop.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(' ', '.') + '@exemplo.com.br',
        endereco: 'Rua ' + pick(r, NOMES) + ', ' + Math.floor(r() * 2000 + 10),
        cidade: CIDADE, bairro: b[0], tipo_imovel: tipo, pretensao: pret, mercado: mercado, unidade: unidade,
        captador: pick(r, CORRETORES[pick(r, EQUIPES[unidade])]),
        valor: valor, area_m2: area,
        status: r() < 0.85 ? 'Ativo' : 'Inativo',
        data_cadastro: addDays(start, Math.floor(r() * ((end - start) / 864e5))),
        empreendimento: mercado === 'Primário' ? pick(r, EMPREENDIMENTOS) : '',
        lat: b[1] + (r() - 0.5) * 0.012, lng: b[2] + (r() - 0.5) * 0.012
      });
    }

    // Atendimentos
    const atendimentos = [];
    const totalDays = Math.floor((end - start) / 864e5);
    const statusVisita = [['Realizada', 0.7], ['Cancelada', 0.15], ['Não compareceu', 0.1], ['Agendada', 0.05]];
    const statusProposta = [['Aceita', 0.35], ['Em negociação', 0.3], ['Recusada', 0.3], ['Cancelada', 0.05]];
    for (let i = 1; i <= 6000; i++) {
      const d = Math.floor(Math.pow(r(), 0.85) * totalDays);
      const dataLead = addDays(start, d);
      const imv = pick(r, imoveis);
      const unidade = imv.unidade;
      const equipe = pick(r, EQUIPES[unidade]);
      const corretor = pick(r, CORRETORES[equipe]);
      const m = pickWeighted(r, MIDIAS, 2);
      const skill = 0.8 + (corretor.charCodeAt(0) % 5) * 0.1;
      const mBoost = m[1] === 'Indicação / Relacionamento' ? 1.8 : m[1] === 'Portais nacionais' ? 0.9 : 1;
      const row = {
        id: 'L' + i, data_lead: dataLead, corretor: corretor, equipe: equipe, unidade: unidade,
        captador: imv.captador, midia: m[0], grupo_midia: m[1], pretensao: imv.pretensao, mercado: imv.mercado,
        imovel_ref: imv.imovel_ref, empreendimento: imv.empreendimento, tipo_imovel: imv.tipo_imovel,
        cidade: imv.cidade, bairro: imv.bairro, cep: '80' + String(Math.floor(r() * 900) + 100) + '-000',
        lat: imv.lat, lng: imv.lng, proprietario: imv.proprietario,
        data_visita: null, status_visita: null, data_proposta: null, status_proposta: null,
        data_fechamento: null, valor_fechamento: null, comissao: null
      };
      if (r() < 0.32 * skill * mBoost) {
        row.data_visita = addDays(dataLead, Math.round(1 + r() * 9));
        row.status_visita = pickWeighted(r, statusVisita, 1)[0];
        if (row.status_visita === 'Realizada' && r() < 0.42 * skill) {
          row.data_proposta = addDays(row.data_visita, Math.round(1 + r() * 14));
          row.status_proposta = pickWeighted(r, statusProposta, 1)[0];
          if (row.status_proposta === 'Aceita' && r() < 0.85) {
            row.data_fechamento = addDays(row.data_proposta, Math.round(3 + r() * (imv.pretensao === 'Venda' ? 40 : 10)));
            row.valor_fechamento = Math.round(imv.valor * (imv.pretensao === 'Venda' ? 0.92 + r() * 0.06 : 1));
            row.comissao = Math.round(row.valor_fechamento * (imv.pretensao === 'Venda' ? 0.06 : 1));
          }
        }
      }
      ['data_visita', 'data_proposta', 'data_fechamento'].forEach(function (f) {
        if (row[f] && row[f] > end) {
          row[f] = null;
          if (f === 'data_visita') { row.status_visita = 'Agendada'; row.data_proposta = null; row.status_proposta = null; row.data_fechamento = null; row.valor_fechamento = null; row.comissao = null; }
          if (f === 'data_proposta') { row.status_proposta = null; row.data_fechamento = null; row.valor_fechamento = null; row.comissao = null; }
          if (f === 'data_fechamento') { row.valor_fechamento = null; row.comissao = null; row.status_proposta = 'Em negociação'; }
        }
      });
      atendimentos.push(row);
    }
    return { atendimentos: atendimentos, imoveis: imoveis, atualizado_em: new Date() };
  }

  const api = { generate: generate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KDemo = api;
})(this);
