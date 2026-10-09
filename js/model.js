/*
 * Modelo de dados do painel e normalização das planilhas exportadas do Kenlo.
 *
 * O painel trabalha com duas tabelas:
 *   - atendimentos: uma linha por lead/atendimento, com as datas de cada etapa
 *     do funil (lead -> visita -> proposta -> fechamento).
 *   - imoveis: a carteira de imóveis com os dados do proprietário.
 *
 * Os cabeçalhos das planilhas são comparados sem acento, sem caixa e sem
 * pontuação, e cada campo aceita vários apelidos (os nomes que aparecem nas
 * exportações do Kenlo Imob / Kenlo Inteligência Explorer).
 */
(function (root) {
  'use strict';

  const ATENDIMENTO_FIELDS = {
    id: ['id', 'codigo', 'codigo do lead', 'id lead', 'lead id', 'codigo atendimento'],
    data_lead: ['data lead', 'data do lead', 'data de cadastro do lead', 'data cadastro lead', 'data entrada', 'data de entrada', 'cadastro do lead'],
    corretor: ['corretor', 'corretor responsavel', 'responsavel', 'nome do corretor'],
    equipe: ['equipe', 'time', 'grupo de corretores'],
    unidade: ['unidade', 'filial', 'loja'],
    captador: ['captador', 'corretor captador'],
    midia: ['midia', 'midias', 'midia de origem', 'origem', 'canal', 'fonte'],
    grupo_midia: ['grupo midia', 'grupo de midia', 'grupo de midias', 'grupo da midia', 'grupo origem'],
    pretensao: ['pretensao', 'finalidade', 'negocio', 'tipo de negocio'],
    mercado: ['mercado', 'tipo de mercado'],
    imovel_ref: ['referencia', 'referencia do imovel', 'ref', 'ref imovel', 'codigo do imovel', 'imovel'],
    empreendimento: ['empreendimento', 'nome do empreendimento', 'condominio'],
    tipo_imovel: ['tipo', 'tipo imovel', 'tipo de imovel', 'categoria'],
    cidade: ['cidade', 'municipio'],
    bairro: ['bairro'],
    cep: ['cep'],
    lat: ['lat', 'latitude'],
    lng: ['lng', 'lon', 'long', 'longitude'],
    proprietario: ['proprietario', 'nome do proprietario'],
    data_visita: ['data visita', 'data da visita', 'visita'],
    status_visita: ['status visita', 'status da visita'],
    data_proposta: ['data proposta', 'data da proposta', 'proposta'],
    status_proposta: ['status proposta', 'status da proposta'],
    data_fechamento: ['data fechamento', 'data de fechamento', 'data do fechamento', 'fechamento'],
    valor_fechamento: ['valor', 'valor fechamento', 'valor do fechamento', 'valor de fechamento', 'valor negociado'],
    comissao: ['comissao', 'valor comissao', 'valor da comissao']
  };

  const IMOVEL_FIELDS = {
    imovel_ref: ATENDIMENTO_FIELDS.imovel_ref,
    proprietario: ATENDIMENTO_FIELDS.proprietario,
    telefone: ['telefone', 'telefone do proprietario', 'celular', 'fone'],
    email: ['email', 'e mail', 'email do proprietario'],
    endereco: ['endereco', 'endereco do imovel', 'logradouro'],
    cidade: ATENDIMENTO_FIELDS.cidade,
    bairro: ATENDIMENTO_FIELDS.bairro,
    tipo_imovel: ATENDIMENTO_FIELDS.tipo_imovel,
    pretensao: ATENDIMENTO_FIELDS.pretensao,
    mercado: ATENDIMENTO_FIELDS.mercado,
    unidade: ATENDIMENTO_FIELDS.unidade,
    captador: ATENDIMENTO_FIELDS.captador,
    valor: ['valor', 'valor do imovel', 'preco', 'valor venda', 'valor locacao', 'valor anunciado'],
    area_m2: ['area', 'area m2', 'area util', 'area privativa', 'metragem', 'm2'],
    status: ['status', 'situacao', 'status do imovel'],
    data_cadastro: ['data cadastro', 'data de cadastro', 'cadastro', 'data captacao', 'data da captacao']
  };

  function slug(s) {
    return String(s == null ? '' : s)
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[²]/g, '2').replace(/[^a-z0-9]+/g, ' ').trim();
  }

  // Monta { cabeçalhoOriginal: campoCanônico } para um conjunto de cabeçalhos.
  function mapHeaders(headers, fields) {
    const lookup = {};
    Object.keys(fields).forEach(function (field) {
      lookup[slug(field)] = field;
      fields[field].forEach(function (alias) { lookup[slug(alias)] = field; });
    });
    const mapping = {};
    const used = {};
    headers.forEach(function (h) {
      const field = lookup[slug(h)];
      if (field && !used[field]) { mapping[h] = field; used[field] = true; }
    });
    return mapping;
  }

  // Aceita Date, serial do Excel, "dd/mm/aaaa [hh:mm]" e ISO.
  function parseDate(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date) return isNaN(v) ? null : v;
    if (typeof v === 'number' && isFinite(v)) {
      if (v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 864e5) + new Date().getTimezoneOffset() * 6e4);
      return null;
    }
    const s = String(v).trim();
    let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/);
    if (m) {
      const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
      return new Date(y, Number(m[2]) - 1, Number(m[1]), Number(m[4] || 0), Number(m[5] || 0));
    }
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return null;
  }

  // Aceita 1.234.567,89 | 1234567.89 | R$ 1.234 | números.
  function parseNumber(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    let s = String(v).replace(/[R$\s%]/g, '');
    if (!s) return null;
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    else if ((s.match(/\./g) || []).length > 1 || /\.\d{3}$/.test(s)) s = s.replace(/\./g, '');
    const n = Number(s);
    return isFinite(n) ? n : null;
  }

  function normPretensao(v) {
    const s = slug(v);
    if (!s) return '';
    if (s.indexOf('loc') === 0 || s.indexOf('alug') === 0) return 'Locação';
    if (s.indexOf('vend') === 0 || s.indexOf('compra') === 0) return 'Venda';
    return String(v).trim();
  }

  function normMercado(v) {
    const s = slug(v);
    if (!s) return '';
    if (s.indexOf('prim') === 0 || s.indexOf('lanc') === 0) return 'Primário';
    if (s.indexOf('sec') === 0 || s.indexOf('pront') === 0 || s.indexOf('terc') === 0) return 'Secundário';
    return String(v).trim();
  }

  const DATE_FIELDS = ['data_lead', 'data_visita', 'data_proposta', 'data_fechamento', 'data_cadastro'];
  const NUMBER_FIELDS = ['valor_fechamento', 'comissao', 'lat', 'lng', 'valor', 'area_m2'];

  function normalizeRows(rows, fields) {
    if (!rows.length) return { rows: [], mapping: {}, missing: Object.keys(fields) };
    const headers = Object.keys(rows[0]);
    const mapping = mapHeaders(headers, fields);
    const out = rows.map(function (raw, i) {
      const r = {};
      Object.keys(fields).forEach(function (f) { r[f] = null; });
      Object.keys(mapping).forEach(function (h) { r[mapping[h]] = raw[h]; });
      DATE_FIELDS.forEach(function (f) { if (f in r) r[f] = parseDate(r[f]); });
      NUMBER_FIELDS.forEach(function (f) { if (f in r) r[f] = parseNumber(r[f]); });
      Object.keys(r).forEach(function (f) {
        if (typeof r[f] === 'string') r[f] = r[f].trim();
        if (r[f] === undefined) r[f] = null;
      });
      if ('pretensao' in r) r.pretensao = normPretensao(r.pretensao);
      if ('mercado' in r) r.mercado = normMercado(r.mercado);
      if ('id' in r && (r.id == null || r.id === '')) r.id = 'L' + (i + 1);
      if ('imovel_ref' in r && r.imovel_ref) r.imovel_ref = String(r.imovel_ref).toUpperCase();
      return r;
    });
    const found = {};
    Object.keys(mapping).forEach(function (h) { found[mapping[h]] = true; });
    return { rows: out, mapping: mapping, missing: Object.keys(fields).filter(function (f) { return !found[f]; }) };
  }

  // Uma planilha é de atendimentos se tiver alguma coluna do funil; senão, é a carteira de imóveis.
  function detectKind(headers) {
    const a = mapHeaders(headers, ATENDIMENTO_FIELDS);
    const fields = Object.keys(a).map(function (h) { return a[h]; });
    const funil = ['data_lead', 'data_visita', 'data_proposta', 'data_fechamento', 'midia', 'status_visita'];
    return funil.some(function (f) { return fields.indexOf(f) >= 0; }) ? 'atendimentos' : 'imoveis';
  }

  const api = {
    ATENDIMENTO_FIELDS: ATENDIMENTO_FIELDS,
    IMOVEL_FIELDS: IMOVEL_FIELDS,
    slug: slug,
    mapHeaders: mapHeaders,
    parseDate: parseDate,
    parseNumber: parseNumber,
    normalizeAtendimentos: function (rows) { return normalizeRows(rows, ATENDIMENTO_FIELDS); },
    normalizeImoveis: function (rows) { return normalizeRows(rows, IMOVEL_FIELDS); },
    detectKind: detectKind
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KModel = api;
})(this);
