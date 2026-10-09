/* Interface do painel: estado, filtros, abas e renderização dos relatórios. */
(function () {
  'use strict';

  const M = window.KMetrics;
  const Model = window.KModel;
  const STORE_KEY = 'kenlo-bi-dados-v1';
  const TAB_KEY = 'kenlo-bi-aba';

  // ---------- formatação ----------
  const nfInt = new Intl.NumberFormat('pt-BR');
  const nfDec = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
  const nfBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  const nfBRLc = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 });
  const nfPct = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 });
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

  const fmt = {
    int: function (v) { return v == null ? '–' : nfInt.format(v); },
    dec: function (v) { return v == null ? '–' : nfDec.format(v); },
    brl: function (v) { return v == null ? '–' : nfBRL.format(v); },
    brlc: function (v) { return v == null ? '–' : (Math.abs(v) < 10000 ? nfBRL.format(v) : nfBRLc.format(v)); },
    pct: function (v) { return v == null ? '–' : nfPct.format(v); },
    days: function (v) { return v == null ? '–' : nfDec.format(v) + ' d'; },
    date: function (v) { return v instanceof Date ? v.toLocaleDateString('pt-BR') : '–'; },
    text: function (v) { return v == null || v === '' ? '–' : String(v); }
  };
  function monthLabel(key) {
    const p = key.split('-');
    return p.length === 3 ? p[2] + '/' + p[1] : MESES[Number(p[1]) - 1] + '/' + p[0].slice(2);
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ---------- estado ----------
  const state = {
    data: { atendimentos: [], imoveis: [], atualizado_em: null, fonte: '' },
    filters: { preset: 'ano', inicio: '', fim: '' },
    tab: 'funil'
  };

  const DATE_KEYS = ['data_lead', 'data_visita', 'data_proposta', 'data_fechamento', 'data_cadastro'];
  function save() {
    if (window.KCloud && window.KCloud.enabled) return; // no modo equipe os dados ficam no banco, não no navegador
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state.data));
    } catch (e) { /* armazenamento indisponível ou cheio: segue só em memória */ }
  }
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return false;
      const d = JSON.parse(raw);
      ['atendimentos', 'imoveis'].forEach(function (k) {
        (d[k] || []).forEach(function (r) {
          DATE_KEYS.forEach(function (f) { if (r[f]) r[f] = new Date(r[f]); });
        });
      });
      d.atualizado_em = d.atualizado_em ? new Date(d.atualizado_em) : null;
      state.data = d;
      return d.atendimentos.length > 0 || d.imoveis.length > 0;
    } catch (e) { return false; }
  }

  // ---------- período ----------
  function today() { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function dataEnd() {
    let max = null;
    state.data.atendimentos.forEach(function (r) {
      DATE_KEYS.forEach(function (f) { if (r[f] && (!max || r[f] > max)) max = r[f]; });
    });
    const t = today();
    return max && max < t ? new Date(max.getFullYear(), max.getMonth(), max.getDate()) : t;
  }
  function endOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999); }
  function isoDate(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

  function currentRange() {
    const f = state.filters;
    const e = dataEnd();
    let s;
    switch (f.preset) {
      case '30d': s = new Date(e.getTime() - 29 * 864e5); break;
      case 'mes': s = new Date(e.getFullYear(), e.getMonth(), 1); break;
      case 'mes-ant': {
        const st = new Date(e.getFullYear(), e.getMonth() - 1, 1);
        return { start: st, end: endOfDay(new Date(e.getFullYear(), e.getMonth(), 0)) };
      }
      case '3m': s = new Date(e.getFullYear(), e.getMonth() - 2, 1); break;
      case '12m': s = new Date(e.getFullYear(), e.getMonth() - 11, 1); break;
      case 'custom': {
        const a = Model.parseDate(f.inicio) || new Date(e.getFullYear(), 0, 1);
        const b = Model.parseDate(f.fim) || e;
        return { start: a, end: endOfDay(b) };
      }
      default: s = new Date(e.getFullYear(), 0, 1);
    }
    return { start: s, end: endOfDay(e) };
  }

  const DIM_FILTERS = [
    ['unidade', 'Unidade'], ['equipe', 'Equipe'], ['corretor', 'Corretor'], ['captador', 'Captador'],
    ['pretensao', 'Pretensão'], ['mercado', 'Mercado'], ['grupo_midia', 'Grupo de mídia'],
    ['midia', 'Mídia'], ['tipo_imovel', 'Tipo de imóvel'], ['cidade', 'Cidade']
  ];
  const IMOVEL_FILTER_KEYS = ['unidade', 'captador', 'pretensao', 'mercado', 'tipo_imovel', 'cidade'];

  function dimFilters(keys) {
    const out = {};
    DIM_FILTERS.forEach(function (d) {
      if (keys && keys.indexOf(d[0]) < 0) return;
      if (state.filters[d[0]]) out[d[0]] = state.filters[d[0]];
    });
    return out;
  }
  function rowsAt() { return M.applyFilters(state.data.atendimentos, dimFilters()); }
  function rowsIm() { return M.applyFilters(state.data.imoveis, dimFilters(IMOVEL_FILTER_KEYS)); }

  function renderFilters() {
    const form = document.getElementById('filters');
    const all = state.data.atendimentos.concat(state.data.imoveis);
    const f = state.filters;
    const presets = [['30d', 'Últimos 30 dias'], ['mes', 'Mês atual'], ['mes-ant', 'Mês anterior'], ['3m', 'Últimos 3 meses'],
      ['ano', 'Ano atual'], ['12m', 'Últimos 12 meses'], ['custom', 'Personalizado']];
    const r = currentRange();
    let html = '<div class="field"><label for="f-preset">Período</label><select id="f-preset" name="preset">' +
      presets.map(function (p) { return '<option value="' + p[0] + '"' + (f.preset === p[0] ? ' selected' : '') + '>' + p[1] + '</option>'; }).join('') +
      '</select></div>' +
      '<div class="field"><label for="f-inicio">De</label><input type="date" id="f-inicio" name="inicio" value="' + isoDate(r.start) + '"></div>' +
      '<div class="field"><label for="f-fim">Até</label><input type="date" id="f-fim" name="fim" value="' + isoDate(r.end) + '"></div>';
    DIM_FILTERS.forEach(function (d) {
      const values = M.distinctValues(all, d[0]);
      if (values.length < 2 && !f[d[0]]) return;
      html += '<div class="field"><label for="f-' + d[0] + '">' + d[1] + '</label><select id="f-' + d[0] + '" name="' + d[0] + '">' +
        '<option value="">Todos</option>' +
        values.map(function (v) { return '<option' + (f[d[0]] === v ? ' selected' : '') + '>' + esc(v) + '</option>'; }).join('') +
        '</select></div>';
    });
    html += '<button class="btn reset" type="button" id="f-reset">Limpar filtros</button>';
    form.innerHTML = html;
  }

  document.getElementById('filters').addEventListener('change', function (ev) {
    const t = ev.target;
    if (t.name === 'inicio' || t.name === 'fim') {
      state.filters.preset = 'custom';
      state.filters.inicio = document.getElementById('f-inicio').value;
      state.filters.fim = document.getElementById('f-fim').value;
    } else if (t.name === 'preset') {
      state.filters.preset = t.value;
      if (t.value === 'custom') {
        state.filters.inicio = document.getElementById('f-inicio').value;
        state.filters.fim = document.getElementById('f-fim').value;
      }
    } else {
      state.filters[t.name] = t.value;
    }
    renderFilters();
    renderTab();
  });
  document.getElementById('filters').addEventListener('click', function (ev) {
    if (ev.target.id !== 'f-reset') return;
    state.filters = { preset: 'ano', inicio: '', fim: '' };
    renderFilters();
    renderTab();
  });
  document.getElementById('filters').addEventListener('submit', function (ev) { ev.preventDefault(); });

  // ---------- cores e gráficos ----------
  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  function series(i) { return css('--s' + ((i % 8) + 1)); }
  const charts = [];
  function destroyCharts() { while (charts.length) charts.pop().destroy(); }

  function baseOptions(o) {
    o = o || {};
    const grid = css('--grid');
    const fg2 = css('--fg-2');
    const money = o.money;
    const axisFmt = function (v) { return money ? fmt.brlc(v) : (o.percent ? fmt.pct(v) : fmt.int(v)); };
    const valueAxis = { beginAtZero: true, grid: { color: grid }, border: { display: false }, ticks: { color: fg2, callback: axisFmt, maxTicksLimit: 6 }, stacked: !!o.stacked };
    const catAxis = { grid: { display: false }, border: { color: grid }, ticks: { color: fg2, autoSkip: true, maxRotation: 0 }, stacked: !!o.stacked };
    return {
      responsive: true, maintainAspectRatio: false, animation: false,
      indexAxis: o.horizontal ? 'y' : 'x',
      interaction: { mode: o.lineMode ? 'index' : 'nearest', intersect: !o.lineMode, axis: o.horizontal ? 'y' : 'x' },
      plugins: {
        legend: { display: !!o.legend, position: 'top', align: 'start', labels: { color: fg2, usePointStyle: true, pointStyle: 'rectRounded', boxWidth: 10, boxHeight: 10, padding: 14 } },
        tooltip: {
          backgroundColor: css('--surface'), titleColor: css('--fg'), bodyColor: css('--fg-2'),
          borderColor: css('--line'), borderWidth: 1, padding: 10, boxPadding: 4, usePointStyle: true,
          callbacks: {
            label: function (ctx) {
              const v = o.horizontal ? ctx.parsed.x : ctx.parsed.y;
              const txt = money ? fmt.brl(v) : o.percent ? fmt.pct(v) : o.days ? fmt.days(v) : fmt.int(v);
              return (ctx.dataset.label ? ctx.dataset.label + ': ' : '') + txt;
            }
          }
        }
      },
      scales: o.horizontal ? { x: valueAxis, y: catAxis } : { x: catAxis, y: valueAxis }
    };
  }

  function barDataset(label, data, color, stacked) {
    return {
      label: label, data: data, backgroundColor: color,
      borderRadius: stacked ? 0 : 4, borderSkipped: 'start',
      borderColor: css('--surface'), borderWidth: stacked ? 1 : 0,
      maxBarThickness: 24, categoryPercentage: 0.8, barPercentage: 0.9
    };
  }

  function chart(canvasId, config) {
    const el = document.getElementById(canvasId);
    if (!el || !window.Chart) return;
    charts.push(new window.Chart(el, config));
  }

  // Barras simples (uma série): sem legenda, o título já diz o que é.
  function simpleBar(canvasId, labels, values, opts) {
    opts = opts || {};
    chart(canvasId, {
      type: 'bar',
      data: { labels: labels, datasets: [barDataset(opts.label || '', values, opts.color || series(0))] },
      options: baseOptions(opts)
    });
  }

  // Barras empilhadas/agrupadas: { labels, series: {nome: []} }.
  function multiBar(canvasId, labels, seriesMap, opts) {
    opts = opts || {};
    const names = Object.keys(seriesMap);
    chart(canvasId, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: names.map(function (n, i) {
          const slot = opts.domain && opts.domain.indexOf(n) >= 0 ? opts.domain.indexOf(n) : i;
          return barDataset(n, seriesMap[n], opts.colors ? opts.colors[i] : series(slot), opts.stacked);
        })
      },
      options: baseOptions(Object.assign({ legend: names.length > 1 }, opts))
    });
  }

  function lineChart(canvasId, labels, seriesMap, opts) {
    opts = opts || {};
    const names = Object.keys(seriesMap);
    chart(canvasId, {
      type: 'line',
      data: {
        labels: labels,
        datasets: names.map(function (n, i) {
          return {
            label: n, data: seriesMap[n], borderColor: series(i), backgroundColor: series(i),
            borderWidth: 2, pointRadius: 0, pointHoverRadius: 5, pointHoverBorderWidth: 2,
            pointHoverBorderColor: css('--surface'), cubicInterpolationMode: 'monotone'
          };
        })
      },
      options: baseOptions(Object.assign({ legend: names.length > 1, lineMode: true }, opts))
    });
  }

  // Mais de 8 categorias viram "Outros" (cores fixas por entidade, sem gerar novos tons).
  function foldTop(items, n) {
    if (items.length <= n) return items;
    const top = items.slice(0, n - 1);
    const rest = items.slice(n - 1);
    const outros = { nome: 'Outros' };
    Object.keys(items[0]).forEach(function (k) {
      if (typeof items[0][k] === 'number') outros[k] = rest.reduce(function (s, r) { return s + (r[k] || 0); }, 0);
    });
    return top.concat([outros]);
  }

  // Cor segue a entidade: cada dimensão tem uma ordem fixa calculada sobre todos os dados.
  const FIXED_DOMAINS = { mercado: ['Primário', 'Secundário', 'Não informado'], pretensao: ['Venda', 'Locação', 'Não informado'] };
  function domain(field) {
    if (FIXED_DOMAINS[field]) return FIXED_DOMAINS[field];
    const blank = /^status/.test(field) ? 'Sem status' : 'Não informado';
    const c = {};
    state.data.atendimentos.forEach(function (r) { if (r[field]) c[r[field]] = (c[r[field]] || 0) + 1; });
    return Object.keys(c).sort(function (a, b) { return c[b] - c[a]; }).concat([blank]);
  }

  // ---------- componentes ----------
  function tile(label, value, delta, opts) {
    opts = opts || {};
    let d = '';
    if (delta !== undefined) {
      if (delta == null) d = '<span class="delta">sem base anterior</span>';
      else {
        const cls = delta > 0 ? 'up' : delta < 0 ? 'down' : '';
        d = '<span class="delta ' + cls + '">' + (delta > 0 ? '+' : '') + fmt.pct(delta) + ' vs período anterior</span>';
      }
    }
    if (opts.note) d += '<span class="delta">' + esc(opts.note) + '</span>';
    return '<div class="tile' + (opts.hero ? ' hero' : '') + '"><span class="label">' + esc(label) + '</span><span class="value">' + value + '</span>' + d + '</div>';
  }

  function panel(title, body, hint, extra) {
    return '<section class="panel"><div class="panel-head"><h3>' + esc(title) + '</h3>' + (extra || '') + '</div>' +
      (hint ? '<p class="hint">' + hint + '</p>' : '') + body + '</section>';
  }
  function canvas(id, size) { return '<div class="chart-box ' + (size || '') + '"><canvas id="' + id + '" role="img"></canvas></div>'; }
  function tableSlot(id) { return '<div id="' + id + '"></div>'; }

  const tables = {};
  function table(slotId, columns, rows, opts) {
    opts = opts || {};
    tables[slotId] = { columns: columns, rows: rows, opts: opts, sort: opts.sort || null, dir: opts.dir || -1 };
    drawTable(slotId);
  }
  function drawTable(slotId) {
    const el = document.getElementById(slotId);
    const t = tables[slotId];
    if (!el || !t) return;
    let rows = t.rows.slice();
    if (t.sort) {
      const k = t.sort;
      rows.sort(function (a, b) {
        const x = a[k], y = b[k];
        if (x == null && y == null) return 0;
        if (x == null) return 1;
        if (y == null) return -1;
        if (x instanceof Date || typeof x === 'number') return (x - y) * t.dir;
        return String(x).localeCompare(String(y), 'pt-BR') * t.dir;
      });
    }
    const limit = t.opts.limit || 500;
    const shown = rows.slice(0, limit);
    const isNum = function (c) { return ['int', 'brl', 'pct', 'days', 'dec'].indexOf(c.type) >= 0; };
    let html = '<div class="table-wrap"><table><thead><tr>' + t.columns.map(function (c) {
      const sort = t.sort === c.key ? (t.dir > 0 ? 'ascending' : 'descending') : 'none';
      return '<th data-key="' + c.key + '" aria-sort="' + sort + '" class="' + (isNum(c) ? 'num' : '') + '" tabindex="0">' + esc(c.label) + '</th>';
    }).join('') + '</tr></thead><tbody>';
    if (!shown.length) html += '<tr><td colspan="' + t.columns.length + '" class="empty">Nenhum registro no período e filtros selecionados.</td></tr>';
    shown.forEach(function (r) {
      html += '<tr' + (t.opts.highlight && t.opts.highlight(r) ? ' class="best"' : '') + '>' + t.columns.map(function (c) {
        return '<td class="' + (isNum(c) ? 'num' : '') + '">' + esc((fmt[c.type] || fmt.text)(r[c.key])) + '</td>';
      }).join('') + '</tr>';
    });
    html += '</tbody></table></div><div class="table-foot"><span>' +
      (rows.length > limit ? 'Mostrando ' + fmt.int(limit) + ' de ' + fmt.int(rows.length) + ' linhas. A exportação traz todas.' : fmt.int(rows.length) + ' linha' + (rows.length === 1 ? '' : 's')) +
      '</span><button class="btn" type="button" data-export="' + slotId + '">Exportar CSV</button></div>';
    el.innerHTML = html;
  }
  document.getElementById('main').addEventListener('click', function (ev) {
    const th = ev.target.closest('th[data-key]');
    if (th) {
      const slot = th.closest('[id]').id;
      const t = tables[slot];
      const k = th.dataset.key;
      if (t.sort === k) t.dir = -t.dir; else { t.sort = k; t.dir = -1; }
      drawTable(slot);
      return;
    }
    const exp = ev.target.closest('[data-export]');
    if (exp) exportCSV(exp.dataset.export);
  });
  document.getElementById('main').addEventListener('keydown', function (ev) {
    if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches('th[data-key]')) { ev.preventDefault(); ev.target.click(); }
  });

  function exportCSV(slotId) {
    const t = tables[slotId];
    const cell = function (c, v) {
      if (v == null) return '';
      if (v instanceof Date) return v.toLocaleDateString('pt-BR');
      if (typeof v === 'number') return c.type === 'pct' ? String(Math.round(v * 1000) / 10).replace('.', ',') : String(Math.round(v * 100) / 100).replace('.', ',');
      const s = String(v);
      return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [t.columns.map(function (c) { return c.label + (c.type === 'pct' ? ' (%)' : ''); }).join(';')];
    t.rows.forEach(function (r) { lines.push(t.columns.map(function (c) { return cell(c, r[c.key]); }).join(';')); });
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (t.opts.file || slotId) + '.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function legendHTML(items) {
    return '<div class="legend">' + items.map(function (it) {
      return '<span><i style="background:' + it[1] + '"></i>' + esc(it[0]) + '</span>';
    }).join('') + '</div>';
  }

  function rangeText(r) { return fmt.date(r.start) + ' a ' + fmt.date(r.end); }
  function needsAt() {
    return state.data.atendimentos.length ? '' :
      '<div class="note"><strong>Sem atendimentos carregados.</strong> Importe o Relatório Detalhado (funil) exportado do Kenlo ou carregue a demonstração.</div>';
  }

  // ---------- relatórios ----------
  const REPORTS = [
    { id: 'funil', label: 'Funil Imobiliário', render: renderFunil },
    { id: 'corretores', label: 'Corretores', render: renderCorretores },
    { id: 'vgv', label: 'VGL · VGV', render: renderVgv },
    { id: 'canais', label: 'Eficiência por Canal', render: renderCanais },
    { id: 'leads-imovel', label: 'Leads por Imóvel', render: renderLeadsImovel },
    { id: 'lead-time', label: 'Lead Time', render: renderLeadTime },
    { id: 'carteira', label: 'Proprietários e Carteira', render: renderCarteira },
    { id: 'detalhado', label: 'Relatório Detalhado', render: renderDetalhado }
  ];

  function head(title, text) {
    return '<div class="report-head"><h2>' + esc(title) + '</h2><p>' + text + '</p></div>';
  }

  function renderFunil(main) {
    const r = currentRange();
    const rows = rowsAt();
    const c = M.funnelWithComparison(rows, r);
    const a = c.atual;
    const v = c.variacao;
    const fColors = [css('--f1'), css('--f2'), css('--f3'), css('--f4')];
    const max = Math.max(a.leads, 1);
    const stages = [['Leads', a.leads, null], ['Visitas', a.visitas, a.conv.visitas], ['Propostas', a.propostas, a.conv.propostas], ['Fechamentos', a.fechamentos, a.conv.fechamentos]];
    const funnelHTML = '<div class="funnel">' + stages.map(function (s, i) {
      return '<div class="funnel-row"><span class="name">' + s[0] + '</span><div class="bar-track"><div class="bar" style="width:' +
        (s[1] / max * 100).toFixed(2) + '%;background:' + fColors[i] + '"></div></div><span class="num">' + fmt.int(s[1]) + '</span>' +
        (s[2] != null ? '<span class="conv">' + fmt.pct(s[2]) + ' da etapa anterior</span>' : '') + '</div>';
    }).join('') + '<div class="funnel-row"><span class="name">Conversão total</span><span class="conv" style="margin:0">' + fmt.pct(a.conv.total) + ' dos leads viraram fechamento</span></div></div>';

    const months = M.timeline(rows, r, 'mes');
    const ml = months.labels.map(monthLabel);
    const equipes = M.groupFunnel(rows, r, 'equipe');
    const best = equipes.length ? equipes[0].nome : null;

    main.innerHTML = head('Funil Imobiliário', 'Eventos do período ' + rangeText(r) + '. Cada etapa conta pela própria data (lead, visita, proposta, fechamento), comparada com o período anterior de mesma duração.') +
      needsAt() +
      '<div class="tiles">' +
      tile('Leads', fmt.int(a.leads), v.leads) + tile('Visitas', fmt.int(a.visitas), v.visitas) +
      tile('Propostas', fmt.int(a.propostas), v.propostas) + tile('Fechamentos', fmt.int(a.fechamentos), v.fechamentos) +
      tile('Valor total dos imóveis fechados', fmt.brlc(a.valor), v.valor) + tile('Comissão', fmt.brlc(a.comissao), v.comissao) +
      '</div>' +
      '<div class="grid-2">' +
      panel('Conversão por etapa', funnelHTML) +
      panel('Performance mensal', '<div class="mini-grid">' +
        ['leads', 'visitas', 'propostas', 'fechamentos'].map(function (k) {
          return '<div><p class="hint">' + k.charAt(0).toUpperCase() + k.slice(1) + '</p>' + canvas('pm-' + k, 'short') + '</div>';
        }).join('') + '</div>') +
      '</div>' +
      '<div class="grid-2">' +
      panel('Visitas por status', canvas('st-visitas')) +
      panel('Propostas por status', canvas('st-propostas')) +
      '</div>' +
      panel('Performance geral por equipe', tableSlot('t-equipes'), best ? 'Em destaque, a equipe com mais fechamentos no período: <strong>' + esc(best) + '</strong>.' : '');

    ['leads', 'visitas', 'propostas', 'fechamentos'].forEach(function (k, i) {
      simpleBar('pm-' + k, ml, months[k], { label: k, color: fColors[i] });
    });
    const sv = M.statusByMonth(rows, r, 'visitas');
    multiBar('st-visitas', sv.labels.map(monthLabel), sv.series, { stacked: true, domain: domain('status_visita') });
    const sp = M.statusByMonth(rows, r, 'propostas');
    multiBar('st-propostas', sp.labels.map(monthLabel), sp.series, { stacked: true, domain: domain('status_proposta') });
    table('t-equipes', groupColumns('Equipe'), equipes, { highlight: function (x) { return x.nome === best; }, sort: 'fechamentos', file: 'performance-equipes' });
  }

  function groupColumns(nome) {
    return [
      { key: 'nome', label: nome }, { key: 'leads', label: 'Leads', type: 'int' }, { key: 'visitas', label: 'Visitas', type: 'int' },
      { key: 'propostas', label: 'Propostas', type: 'int' }, { key: 'fechamentos', label: 'Fechamentos', type: 'int' },
      { key: 'conv_visita', label: 'Lead→Visita', type: 'pct' }, { key: 'conv_proposta', label: 'Visita→Proposta', type: 'pct' },
      { key: 'conv_fechamento', label: 'Proposta→Fech.', type: 'pct' }, { key: 'conv_total', label: 'Conv. total', type: 'pct' },
      { key: 'valor', label: 'Valor fechado', type: 'brl' }, { key: 'comissao', label: 'Comissão', type: 'brl' }
    ];
  }

  function renderCorretores(main) {
    const r = currentRange();
    const rows = rowsAt();
    const g = M.groupFunnel(rows, r, 'corretor');
    const top = g.slice(0, 10);
    const sv = M.statusByGroup(rows, r, 'corretor', 'visitas');
    const sp = M.statusByGroup(rows, r, 'corretor', 'propostas');
    const ativos = g.length;
    const tot = M.funnel(rows, r);
    main.innerHTML = head('Ranking de Corretores', 'Leads recebidos, visitas, propostas, fechamentos e comissão de cada corretor em ' + rangeText(r) + '.') +
      needsAt() +
      '<div class="tiles">' + tile('Corretores com movimento', fmt.int(ativos)) +
      tile('Leads por corretor', fmt.dec(ativos ? tot.leads / ativos : null)) +
      tile('Fechamentos por corretor', fmt.dec(ativos ? tot.fechamentos / ativos : null)) +
      tile('Comissão média por corretor', fmt.brlc(ativos ? tot.comissao / ativos : null)) + '</div>' +
      '<div class="grid-2">' +
      panel('Top 10 por fechamentos', canvas('c-top', 'tall')) +
      panel('Top 10 por comissão', canvas('c-com', 'tall')) +
      '</div>' +
      panel('Performance geral por corretor', tableSlot('t-corretores')) +
      '<div class="grid-2">' +
      panel('Status de visitas por corretor', canvas('c-sv', 'tall')) +
      panel('Status de propostas por corretor', canvas('c-sp', 'tall')) +
      '</div>';
    simpleBar('c-top', top.map(function (x) { return x.nome; }), top.map(function (x) { return x.fechamentos; }), { horizontal: true, label: 'Fechamentos' });
    const byCom = g.slice().sort(function (a, b) { return b.comissao - a.comissao; }).slice(0, 10);
    simpleBar('c-com', byCom.map(function (x) { return x.nome; }), byCom.map(function (x) { return x.comissao; }), { horizontal: true, money: true, label: 'Comissão' });
    function statusChart(id, s, field) {
      const n = s.nomes.slice(0, 12);
      const map = {};
      s.status.forEach(function (st, j) { map[st] = n.map(function (_, i) { return s.matriz[i][j]; }); });
      multiBar(id, n, map, { stacked: true, horizontal: true, domain: domain(field) });
    }
    statusChart('c-sv', sv, 'status_visita');
    statusChart('c-sp', sp, 'status_proposta');
    table('t-corretores', groupColumns('Corretor'), g, { sort: 'fechamentos', file: 'ranking-corretores' });
  }

  function renderVgv(main) {
    const r = currentRange();
    const v = M.vglVgv(rowsAt(), r);
    const c = v.cards;
    main.innerHTML = head('VGL · VGV', 'Valor Geral de Locação e de Vendas dos fechamentos em ' + rangeText(r) + ', com ranking de corretores, unidades e mídias de fechamento.') +
      needsAt() +
      '<div class="tiles">' +
      tile('Valor Geral de Vendas (VGV)', fmt.brlc(c.vgv), undefined, { hero: true }) + tile('Unidades vendidas', fmt.int(c.unidades_vendidas)) + tile('Comissão de vendas', fmt.brlc(c.comissao_venda)) +
      tile('Valor Geral de Locação (VGL)', fmt.brlc(c.vgl), undefined, { hero: true }) + tile('Unidades locadas', fmt.int(c.unidades_locadas)) + tile('Comissão de locação', fmt.brlc(c.comissao_locacao)) +
      '</div>' +
      '<div class="grid-2">' +
      panel('Top 10 corretores por VGV', canvas('v-rk-vgv', 'tall')) +
      panel('Top 10 corretores por VGL', canvas('v-rk-vgl', 'tall')) +
      '</div><div class="grid-2">' +
      panel('VGV por unidade', canvas('v-un-vgv'), 'Por tipo de mercado: Primário (lançamentos) e Secundário (prontos).') +
      panel('VGL por unidade', canvas('v-un-vgl')) +
      '</div>' +
      panel('Mídias de fechamento', canvas('v-midias', 'tall'), 'Valor fechado por mídia de origem do lead, por tipo de mercado.') +
      panel('Tabela geral de fechamentos', tableSlot('t-vgv'));
    simpleBar('v-rk-vgv', v.ranking_vgv.map(function (x) { return x.nome; }), v.ranking_vgv.map(function (x) { return x.valor; }), { horizontal: true, money: true, label: 'VGV' });
    simpleBar('v-rk-vgl', v.ranking_vgl.map(function (x) { return x.nome; }), v.ranking_vgl.map(function (x) { return x.valor; }), { horizontal: true, money: true, label: 'VGL', color: series(2) });
    function byMarket(id, obj, horizontal) {
      const names = Object.keys(obj).sort(function (a, b) {
        const sa = Object.values(obj[a]).reduce(function (s, x) { return s + x; }, 0);
        const sb = Object.values(obj[b]).reduce(function (s, x) { return s + x; }, 0);
        return sb - sa;
      }).slice(0, 12);
      const mercados = ['Primário', 'Secundário', 'Não informado'].filter(function (m) { return names.some(function (n) { return obj[n][m]; }); });
      const map = {};
      mercados.forEach(function (m) { map[m] = names.map(function (n) { return obj[n][m] || 0; }); });
      multiBar(id, names, map, { stacked: true, money: true, horizontal: horizontal, domain: domain('mercado') });
    }
    byMarket('v-un-vgv', v.vgv_unidade);
    byMarket('v-un-vgl', v.vgl_unidade);
    byMarket('v-midias', v.midias, true);
    table('t-vgv', [
      { key: 'imovel_ref', label: 'Referência' }, { key: 'pretensao', label: 'Pretensão' }, { key: 'mercado', label: 'Mercado' },
      { key: 'corretor', label: 'Corretor' }, { key: 'proprietario', label: 'Proprietário' }, { key: 'data_lead', label: 'Cadastro do lead', type: 'date' },
      { key: 'data_fechamento', label: 'Fechamento', type: 'date' }, { key: 'dias_ate_fechamento', label: 'Dias até fechar', type: 'int' },
      { key: 'midia', label: 'Mídia' }, { key: 'valor', label: 'Valor', type: 'brl' }, { key: 'comissao', label: 'Comissão', type: 'brl' }
    ], v.tabela, { file: 'vgl-vgv' });
  }

  function renderCanais(main) {
    const r = currentRange();
    const rows = rowsAt();
    const e = M.eficienciaCanal(rows, r);
    const tot = M.funnel(rows, r);
    const grupos = foldTop(e.grupos, 8);
    const names = grupos.map(function (g) { return g.nome; });
    const days = (r.end - r.start) / 864e5 <= 62;
    const groupRows = {};
    rows.forEach(function (x) { const k = x.grupo_midia || 'Não informado'; (groupRows[k] = groupRows[k] || []).push(x); });
    main.innerHTML = head('Eficiência por Canal', 'Desempenho de cada grupo de mídia e de cada mídia no funil, em ' + rangeText(r) + '.') +
      needsAt() +
      '<div class="tiles">' + tile('Leads', fmt.int(tot.leads)) + tile('Visitas', fmt.int(tot.visitas)) + tile('Propostas', fmt.int(tot.propostas)) +
      tile('Fechamentos', fmt.int(tot.fechamentos)) + tile('Conversão lead → fechamento', fmt.pct(tot.conv.total)) + '</div>' +
      '<div class="grid-2">' +
      panel('Leads por grupo de mídia (%)', canvas('m-sl')) +
      panel('Fechamentos por grupo de mídia (%)', canvas('m-sf')) +
      '</div><div class="grid-2">' +
      panel('Leads por grupo de mídia', canvas('m-l')) +
      panel('Fechamentos por grupo de mídia', canvas('m-f')) +
      '</div><div class="grid-2">' +
      panel('Visitas por grupo de mídia e status', canvas('m-v', 'tall')) +
      panel('Propostas por grupo de mídia e status', tableSlot('t-prop')) +
      '</div>' +
      panel('Leads, visitas, propostas e fechamentos em visão ' + (days ? 'diária' : 'mensal'), '<div class="mini-grid">' +
        ['leads', 'visitas', 'propostas', 'fechamentos'].map(function (k) {
          return '<div><p class="hint">' + k.charAt(0).toUpperCase() + k.slice(1) + '</p>' + canvas('m-t-' + k, 'short') + '</div>';
        }).join('') + '</div>', days ? '' : 'Períodos acima de 62 dias são agrupados por mês.', legendHTML(names.map(function (n, i) { return [n, series(i)]; }))) +
      panel('Performance por mídia', tableSlot('t-midias'));

    simpleBar('m-sl', names, grupos.map(function (g) { return g.share_leads || 0; }), { percent: true, horizontal: true, label: 'Leads' });
    simpleBar('m-sf', names, grupos.map(function (g) { return g.share_fechamentos || 0; }), { percent: true, horizontal: true, label: 'Fechamentos', color: series(2) });
    simpleBar('m-l', names, grupos.map(function (g) { return g.leads; }), { horizontal: true, label: 'Leads' });
    simpleBar('m-f', names, grupos.map(function (g) { return g.fechamentos; }), { horizontal: true, label: 'Fechamentos', color: series(2) });
    const sv = M.statusByGroup(rows, r, 'grupo_midia', 'visitas');
    const map = {};
    sv.status.forEach(function (st, j) { map[st] = sv.nomes.map(function (_, i) { return sv.matriz[i][j]; }); });
    multiBar('m-v', sv.nomes, map, { stacked: true, horizontal: true, domain: domain('status_visita') });
    const sp = M.statusByGroup(rows, r, 'grupo_midia', 'propostas');
    const pivot = sp.nomes.map(function (n, i) {
      const o = { nome: n, total: 0 };
      sp.status.forEach(function (st, j) { o['s' + j] = sp.matriz[i][j]; o.total += sp.matriz[i][j]; });
      return o;
    });
    table('t-prop', [{ key: 'nome', label: 'Grupo de mídia' }].concat(sp.status.map(function (st, j) { return { key: 's' + j, label: st, type: 'int' }; }), [{ key: 'total', label: 'Total', type: 'int' }]), pivot, { sort: 'total', file: 'propostas-por-grupo-midia' });

    // séries por grupo, mesma cor por grupo em todos os gráficos
    const groupNames = names.filter(function (n) { return n !== 'Outros'; });
    ['leads', 'visitas', 'propostas', 'fechamentos'].forEach(function (k) {
      const seriesMap = {};
      let labels = [];
      groupNames.forEach(function (n) {
        const t = M.timeline(groupRows[n] || [], r, days ? 'dia' : 'mes');
        labels = t.labels;
        seriesMap[n] = t[k];
      });
      if (names.indexOf('Outros') >= 0) {
        const others = rows.filter(function (x) { return groupNames.indexOf(x.grupo_midia || 'Não informado') < 0; });
        const t = M.timeline(others, r, days ? 'dia' : 'mes');
        labels = t.labels;
        seriesMap.Outros = t[k];
      }
      lineChart('m-t-' + k, labels.map(monthLabel), seriesMap, { legend: false });
    });
    table('t-midias', groupColumns('Mídia'), e.midias, { sort: 'leads', file: 'performance-midias' });
  }

  function renderLeadsImovel(main) {
    const r = currentRange();
    const l = M.leadsPorImovel(rowsAt(), r);
    main.innerHTML = head('Leads por Imóvel', 'Quais imóveis, bairros e cidades geraram leads em ' + rangeText(r) + ', e por qual mídia.') +
      needsAt() +
      '<div class="tiles">' + tile('Total de leads', fmt.int(l.cards.leads)) + tile('Imóveis com leads', fmt.int(l.cards.imoveis)) +
      tile('Cidades', fmt.int(l.cards.cidades)) + tile('Bairros', fmt.int(l.cards.bairros)) + '</div>' +
      '<div class="grid-2">' +
      panel('Top 10 imóveis', canvas('i-im', 'tall')) +
      panel('Top 10 bairros', canvas('i-ba', 'tall')) +
      '</div>' +
      panel('Mapa de leads', canvas('i-map', 'tall'), l.pontos.length ? 'Cada ponto é um imóvel, posicionado pela latitude e longitude; o tamanho indica a quantidade de leads.' : 'A planilha importada não tem latitude e longitude dos imóveis.') +
      panel('Leads por mídia de origem e imóvel', tableSlot('t-li'));
    simpleBar('i-im', l.top_imoveis.map(function (x) { return x.nome; }), l.top_imoveis.map(function (x) { return x.leads; }), { horizontal: true, label: 'Leads' });
    simpleBar('i-ba', l.top_bairros.map(function (x) { return x.nome; }), l.top_bairros.map(function (x) { return x.leads; }), { horizontal: true, label: 'Leads', color: series(2) });
    if (l.pontos.length && window.Chart) {
      const maxL = Math.max.apply(null, l.pontos.map(function (p) { return p.leads; }));
      const opts = baseOptions({});
      opts.scales = {
        x: { grid: { color: css('--grid') }, ticks: { color: css('--fg-3'), maxTicksLimit: 5 }, title: { display: true, text: 'Longitude', color: css('--fg-3') } },
        y: { grid: { color: css('--grid') }, ticks: { color: css('--fg-3'), maxTicksLimit: 5 }, title: { display: true, text: 'Latitude', color: css('--fg-3') } }
      };
      opts.plugins.tooltip.callbacks.label = function (ctx) { const p = ctx.raw; return (p.ref || '') + ' · ' + (p.bairro || '') + ': ' + fmt.int(p.leads) + ' leads'; };
      chart('i-map', {
        type: 'bubble',
        data: {
          datasets: [{
            data: l.pontos.map(function (p) { return { x: p.lng, y: p.lat, r: 4 + 10 * Math.sqrt(p.leads / maxL), ref: p.ref, bairro: p.bairro, leads: p.leads }; }),
            backgroundColor: series(0) + '99', borderColor: css('--surface'), borderWidth: 2
          }]
        },
        options: opts
      });
    }
    table('t-li', [
      { key: 'midia', label: 'Mídia de origem' }, { key: 'leads', label: 'Leads', type: 'int' }, { key: 'imovel_ref', label: 'Referência' },
      { key: 'empreendimento', label: 'Empreendimento' }, { key: 'cidade', label: 'Cidade' }, { key: 'bairro', label: 'Bairro' }, { key: 'cep', label: 'CEP' }
    ], l.tabela, { sort: 'leads', file: 'leads-por-imovel' });
  }

  function renderLeadTime(main) {
    const r = currentRange();
    const lt = M.leadTime(rowsAt(), r);
    const g = lt.geral;
    main.innerHTML = head('Lead Time', 'Tempo médio, em dias, entre as etapas do funil para os leads que entraram em ' + rangeText(r) + '. Só entram leads que avançaram para a etapa seguinte.') +
      needsAt() +
      '<div class="tiles">' + g.map(function (s) {
        return tile(s.label, fmt.days(s.media), undefined, { note: 'mediana ' + fmt.days(s.mediana) + ' · ' + fmt.int(s.n) + ' leads' });
      }).join('') + '</div>' +
      panel('Venda × Locação', canvas('lt-vl'), 'Tempo médio de cada etapa, separado por pretensão.') +
      '<div class="grid-2">' +
      panel('Lead time por corretor', tableSlot('t-lt-c')) +
      panel('Lead time por grupo de mídia', tableSlot('t-lt-m')) +
      '</div>';
    multiBar('lt-vl', g.map(function (s) { return s.label; }), {
      Venda: lt.venda.map(function (s) { return s.media; }), 'Locação': lt.locacao.map(function (s) { return s.media; })
    }, { days: true, domain: domain('pretensao') });
    const cols = function (n) {
      return [{ key: 'nome', label: n }, { key: 'lead_visita', label: 'Lead→Visita', type: 'days' }, { key: 'visita_proposta', label: 'Visita→Proposta', type: 'days' },
        { key: 'proposta_fechamento', label: 'Proposta→Fech.', type: 'days' }, { key: 'lead_fechamento', label: 'Lead→Fech.', type: 'days' }, { key: 'fechamentos', label: 'Fechamentos', type: 'int' }];
    };
    table('t-lt-c', cols('Corretor'), lt.por_corretor, { file: 'lead-time-corretores' });
    table('t-lt-m', cols('Grupo de mídia'), lt.por_grupo_midia, { file: 'lead-time-midias' });
  }

  function renderCarteira(main) {
    const r = currentRange();
    const im = rowsIm();
    if (!state.data.imoveis.length) {
      main.innerHTML = head('Proprietários e Carteira', 'Proprietários, imóveis por bairro, preço por m² e captação.') +
        '<div class="note"><strong>Sem carteira de imóveis carregada.</strong> Exporte o Relatório Proprietários (ou um bloco do Explorer com referência, proprietário, bairro, valor e área) e importe aqui.</div>';
      return;
    }
    const c = M.carteira(im, {});
    const cap = M.captacaoMensal(im, r);
    main.innerHTML = head('Proprietários e Carteira', 'Proprietários e imóveis da carteira, distribuição por bairro, ticket médio e preço por m² da carteira ativa. A captação usa o período selecionado.') +
      '<div class="tiles">' + tile('Proprietários', fmt.int(c.cards.proprietarios)) + tile('Imóveis', fmt.int(c.cards.imoveis)) +
      tile('Imóveis ativos', fmt.int(c.cards.ativos)) + tile('Bairros', fmt.int(c.cards.bairros)) +
      tile('VGV em estoque', fmt.brlc(c.cards.vgv_estoque)) + tile('VGL em estoque', fmt.brlc(c.cards.vgl_estoque)) +
      tile('Ticket médio de venda', fmt.brlc(c.cards.ticket_venda)) + tile('Ticket médio de locação', fmt.brlc(c.cards.ticket_locacao)) + '</div>' +
      '<div class="grid-2">' +
      panel('Imóveis por bairro (top 20)', canvas('k-ba', 'tall')) +
      panel('Captação de novos imóveis', canvas('k-cap', 'tall'), 'Imóveis cadastrados por mês, por pretensão.') +
      '</div>' +
      panel('Preço por m² e ticket médio por bairro', tableSlot('t-m2'), 'Carteira ativa. Ficam fora vendas abaixo de R$ 50 mil ou acima de R$ 100 milhões e locações abaixo de R$ 10 ou acima de R$ 100 mil, como no Kenlo.') +
      panel('Relatório de proprietários', tableSlot('t-prop-det'));
    simpleBar('k-ba', c.top_bairros.map(function (x) { return x.nome; }), c.top_bairros.map(function (x) { return x.imoveis; }), { horizontal: true, label: 'Imóveis' });
    multiBar('k-cap', cap.labels.map(monthLabel), { Venda: cap.venda, 'Locação': cap.locacao }, { domain: domain('pretensao') });
    table('t-m2', [
      { key: 'bairro', label: 'Bairro' }, { key: 'cidade', label: 'Cidade' }, { key: 'pretensao', label: 'Pretensão' },
      { key: 'imoveis', label: 'Imóveis', type: 'int' }, { key: 'ticket_medio', label: 'Ticket médio', type: 'brl' }, { key: 'preco_m2', label: 'R$/m²', type: 'brl' }
    ], c.preco_m2, { sort: 'imoveis', file: 'preco-m2-bairro' });
    table('t-prop-det', [
      { key: 'imovel_ref', label: 'Referência' }, { key: 'proprietario', label: 'Proprietário' }, { key: 'telefone', label: 'Telefone' },
      { key: 'email', label: 'E-mail' }, { key: 'endereco', label: 'Endereço' }, { key: 'bairro', label: 'Bairro' }, { key: 'cidade', label: 'Cidade' },
      { key: 'tipo_imovel', label: 'Tipo' }, { key: 'pretensao', label: 'Pretensão' }, { key: 'valor', label: 'Valor', type: 'brl' },
      { key: 'area_m2', label: 'Área (m²)', type: 'int' }, { key: 'status', label: 'Status' }, { key: 'data_cadastro', label: 'Cadastro', type: 'date' }
    ], c.tabela, { sort: 'data_cadastro', file: 'proprietarios' });
  }

  function renderDetalhado(main) {
    const r = currentRange();
    const inR = function (d) { return d && d >= r.start && d <= r.end; };
    const rows = rowsAt().filter(function (x) { return inR(x.data_lead) || inR(x.data_visita) || inR(x.data_proposta) || inR(x.data_fechamento); });
    main.innerHTML = head('Relatório Detalhado', 'Todos os atendimentos com algum evento do funil em ' + rangeText(r) + '. Clique no título de uma coluna para ordenar.') +
      needsAt() + panel('Atendimentos', tableSlot('t-det'));
    table('t-det', [
      { key: 'id', label: 'Lead' }, { key: 'data_lead', label: 'Data do lead', type: 'date' }, { key: 'corretor', label: 'Corretor' },
      { key: 'equipe', label: 'Equipe' }, { key: 'unidade', label: 'Unidade' }, { key: 'midia', label: 'Mídia' }, { key: 'grupo_midia', label: 'Grupo de mídia' },
      { key: 'pretensao', label: 'Pretensão' }, { key: 'mercado', label: 'Mercado' }, { key: 'imovel_ref', label: 'Imóvel' }, { key: 'bairro', label: 'Bairro' },
      { key: 'data_visita', label: 'Visita', type: 'date' }, { key: 'status_visita', label: 'Status visita' },
      { key: 'data_proposta', label: 'Proposta', type: 'date' }, { key: 'status_proposta', label: 'Status proposta' },
      { key: 'data_fechamento', label: 'Fechamento', type: 'date' }, { key: 'valor_fechamento', label: 'Valor', type: 'brl' }, { key: 'comissao', label: 'Comissão', type: 'brl' }
    ], rows, { sort: 'data_lead', file: 'relatorio-detalhado' });
  }

  // ---------- abas ----------
  function renderTabs() {
    document.getElementById('tabs').innerHTML = REPORTS.map(function (t) {
      return '<button class="tab" role="tab" type="button" data-tab="' + t.id + '" aria-selected="' + (state.tab === t.id) + '">' + esc(t.label) + '</button>';
    }).join('');
  }
  document.getElementById('tabs').addEventListener('click', function (ev) {
    const b = ev.target.closest('[data-tab]');
    if (!b) return;
    state.tab = b.dataset.tab;
    try { localStorage.setItem(TAB_KEY, state.tab); } catch (e) { /* opcional */ }
    if (history.replaceState) history.replaceState(null, '', '#' + state.tab);
    renderTabs();
    renderTab();
  });

  function renderTab() {
    destroyCharts();
    const main = document.getElementById('main');
    const rep = REPORTS.find(function (t) { return t.id === state.tab; }) || REPORTS[0];
    const wrap = document.createElement('div');
    wrap.className = 'report';
    main.innerHTML = '';
    main.appendChild(wrap);
    // innerHTML precisa existir antes dos gráficos, então cada render escreve no wrap.
    rep.render(wrap);
    if (!window.Chart) {
      wrap.insertAdjacentHTML('afterbegin', '<div class="note"><strong>Os gráficos não carregaram.</strong> Verifique a conexão com a internet (a biblioteca de gráficos vem de cdnjs.cloudflare.com). Tabelas e indicadores seguem funcionando.</div>');
    }
  }

  function renderSource() {
    const d = state.data;
    const el = document.getElementById('source');
    if (!d.atendimentos.length && !d.imoveis.length) { el.innerHTML = '<span class="chip">sem dados</span>'; return; }
    if (d.vazio) {
      el.innerHTML = '<span class="chip demo">demonstração</span><span>A equipe ainda não tem dados. ' +
        (auth.role === 'admin' ? 'Use "Importar planilhas" para enviar a primeira base.' : 'Um administrador precisa importar as planilhas.') + '</span>';
      return;
    }
    const chip = { demo: '<span class="chip demo">demonstração</span>', nuvem: '<span class="chip">dados da equipe</span>' }[d.fonte] || '<span class="chip">importado</span>';
    el.innerHTML = chip +
      '<span>Última atualização: ' + (d.atualizado_em ? d.atualizado_em.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '–') +
      ' · ' + fmt.int(d.atendimentos.length) + ' atendimentos · ' + fmt.int(d.imoveis.length) + ' imóveis</span>';
  }

  function renderAll() { renderSource(); renderFilters(); renderTabs(); renderTab(); }

  // ---------- importação ----------
  function parseCSV(text) {
    const first = text.split(/\r?\n/, 1)[0];
    const delim = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : (first.indexOf('\t') >= 0 ? '\t' : ',');
    const rows = [];
    let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === delim) { row.push(cur); cur = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cur); rows.push(row); row = []; cur = '';
      } else cur += ch;
    }
    if (cur || row.length) { row.push(cur); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (c) { return String(c).trim() !== ''; }); });
  }

  // Encontra a linha de cabeçalho (exportações às vezes trazem título antes).
  function toObjects(matrix) {
    const known = Object.assign({}, Model.ATENDIMENTO_FIELDS, Model.IMOVEL_FIELDS);
    let hi = 0, best = -1;
    for (let i = 0; i < Math.min(matrix.length, 15); i++) {
      const n = Object.keys(Model.mapHeaders(matrix[i].map(String), known)).length;
      if (n > best) { best = n; hi = i; }
    }
    const headers = matrix[hi].map(function (h, i) { return String(h).trim() || 'col' + i; });
    return matrix.slice(hi + 1).map(function (r) {
      const o = {};
      headers.forEach(function (h, i) { o[h] = r[i] == null ? '' : r[i]; });
      return o;
    });
  }

  function readFile(file) {
    return new Promise(function (resolve, reject) {
      const fr = new FileReader();
      const isText = /\.(csv|txt)$/i.test(file.name);
      fr.onerror = function () { reject(new Error('não foi possível ler o arquivo')); };
      fr.onload = function () {
        try {
          if (isText) {
            let text = fr.result;
            if (text.indexOf('�') >= 0) {
              // provavelmente Latin-1 (Excel brasileiro); relê
              const fr2 = new FileReader();
              fr2.onload = function () { resolve(toObjects(parseCSV(fr2.result))); };
              fr2.readAsText(file, 'windows-1252');
              return;
            }
            resolve(toObjects(parseCSV(text.replace(/^﻿/, ''))));
          } else {
            if (!window.XLSX) throw new Error('a biblioteca de Excel não carregou; salve a planilha como CSV');
            const wb = window.XLSX.read(fr.result, { type: 'array', cellDates: true });
            const ws = wb.Sheets[wb.SheetNames[0]];
            resolve(toObjects(window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true })));
          }
        } catch (e) { reject(e); }
      };
      if (isText) fr.readAsText(file, 'utf-8'); else fr.readAsArrayBuffer(file);
    });
  }

  const LABELS = {
    data_lead: 'data do lead', corretor: 'corretor', midia: 'mídia', data_visita: 'data da visita',
    data_proposta: 'data da proposta', data_fechamento: 'data de fechamento', valor_fechamento: 'valor',
    proprietario: 'proprietário', imovel_ref: 'referência', bairro: 'bairro', valor: 'valor', area_m2: 'área'
  };

  // Lê e normaliza os arquivos; devolve { atendimentos, imoveis, arquivos, linhas de log }.
  async function parseFiles(files) {
    const out = { atendimentos: [], imoveis: [], arquivos: { atendimentos: [], imoveis: [] }, lines: [] };
    for (const f of files) {
      try {
        const objs = await readFile(f);
        if (!objs.length) { out.lines.push('✗ ' + f.name + ': nenhuma linha encontrada'); continue; }
        const kind = Model.detectKind(Object.keys(objs[0]));
        const res = kind === 'atendimentos' ? Model.normalizeAtendimentos(objs) : Model.normalizeImoveis(objs);
        out[kind].push.apply(out[kind], res.rows);
        out.arquivos[kind].push(f.name);
        const important = kind === 'atendimentos'
          ? ['data_lead', 'corretor', 'midia', 'data_visita', 'data_proposta', 'data_fechamento', 'valor_fechamento']
          : ['imovel_ref', 'proprietario', 'bairro', 'valor', 'area_m2'];
        const miss = important.filter(function (k) { return res.missing.indexOf(k) >= 0; }).map(function (k) { return LABELS[k] || k; });
        out.lines.push('✓ ' + f.name + ': ' + fmt.int(res.rows.length) + ' linhas de ' + (kind === 'atendimentos' ? 'atendimentos' : 'imóveis') +
          ' · colunas reconhecidas: ' + Object.keys(res.mapping).length + (miss.length ? '\n  sem coluna para: ' + miss.join(', ') : ''));
      } catch (e) {
        out.lines.push('✗ ' + f.name + ': ' + e.message);
      }
    }
    return out;
  }

  let importing = false;
  async function importFiles(files) {
    if (importing || !files.length) return;
    const log = document.getElementById('import-log');
    importing = true;
    log.textContent = 'Lendo ' + files.length + ' arquivo' + (files.length > 1 ? 's' : '') + '…';
    try {
      const p = await parseFiles(files);
      const lines = p.lines;
      if (!p.atendimentos.length && !p.imoveis.length) { log.textContent = lines.join('\n'); return; }

      if (cloudOn()) {
        // Uma planilha por tipo substitui a base daquele tipo para toda a equipe.
        for (const kind of ['atendimentos', 'imoveis']) {
          if (!p[kind].length) continue;
          const nome = kind === 'atendimentos' ? 'atendimentos' : 'imóveis';
          await Cloud.upload(kind, p[kind], p.arquivos[kind], function (feito, total) {
            log.textContent = lines.join('\n') + '\nEnviando ' + nome + ': ' + fmt.int(feito) + ' de ' + fmt.int(total) + '…';
          });
          lines.push('↑ ' + fmt.int(p[kind].length) + ' ' + nome + ' salvos para a equipe');
        }
        log.textContent = lines.join('\n') + '\nAtualizando o painel…';
        await loadCloud();
        log.textContent = lines.join('\n') + '\nPronto. Toda a equipe já vê os dados novos.';
        return;
      }

      const keepDemo = state.data.fonte === 'demo' ? { atendimentos: [], imoveis: [] } : state.data;
      state.data = {
        atendimentos: p.atendimentos.length ? p.atendimentos : keepDemo.atendimentos,
        imoveis: p.imoveis.length ? p.imoveis : keepDemo.imoveis,
        atualizado_em: new Date(), fonte: 'importado'
      };
      save();
      renderAll();
      log.textContent = lines.join('\n');
    } catch (e) {
      log.textContent += '\n✗ Não foi possível salvar: ' + e.message + '\nA base anterior continua valendo.';
    } finally {
      importing = false;
    }
  }

  const dlg = document.getElementById('import-dialog');
  const btnClear = document.getElementById('btn-clear');
  const btnClearConfirm = document.getElementById('btn-clear-confirm');
  document.getElementById('btn-import').addEventListener('click', function () {
    document.getElementById('import-log').textContent = '';
    btnClearConfirm.hidden = true;
    btnClear.hidden = false;
    dlg.showModal();
  });
  document.getElementById('btn-close').addEventListener('click', function () { dlg.close(); });
  btnClear.addEventListener('click', function () {
    if (!cloudOn()) {
      try { localStorage.removeItem(STORE_KEY); } catch (e) { /* ok */ }
      useDemo();
      document.getElementById('import-log').textContent = 'Dados importados removidos. A demonstração foi carregada.';
      return;
    }
    btnClear.hidden = true;
    btnClearConfirm.hidden = false;
    document.getElementById('import-log').textContent = 'Isto apaga atendimentos e carteira para toda a equipe. A lista de pessoas com acesso continua.';
  });
  btnClearConfirm.addEventListener('click', async function () {
    const log = document.getElementById('import-log');
    btnClearConfirm.disabled = true;
    try {
      await Cloud.clear();
      await loadCloud();
      log.textContent = 'Dados apagados.';
    } catch (e) {
      log.textContent = '✗ ' + e.message;
    } finally {
      btnClearConfirm.disabled = false;
      btnClearConfirm.hidden = true;
      btnClear.hidden = false;
    }
  });
  document.getElementById('file-input').addEventListener('change', function (ev) { importFiles(Array.from(ev.target.files)); ev.target.value = ''; });
  const drop = document.getElementById('drop');
  ['dragenter', 'dragover'].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
  ['dragleave', 'drop'].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
  drop.addEventListener('drop', function (e) { importFiles(Array.from(e.dataTransfer.files)); });

  function useDemo() {
    const d = window.KDemo.generate(new Date());
    state.data = { atendimentos: d.atendimentos, imoveis: d.imoveis, atualizado_em: d.atualizado_em, fonte: 'demo' };
    renderAll();
  }
  document.getElementById('btn-demo').addEventListener('click', function () {
    try { localStorage.removeItem(STORE_KEY); } catch (e) { /* ok */ }
    useDemo();
  });

  // ---------- modo equipe (Supabase) ----------
  const Cloud = window.KCloud || { enabled: false };
  const auth = { session: null, role: null, mode: 'entrar' };
  function cloudOn() { return Cloud.enabled; }

  async function loadCloud() {
    const d = await Cloud.load();
    if (!d.atendimentos.length && !d.imoveis.length) {
      const demo = window.KDemo.generate(new Date());
      state.data = { atendimentos: demo.atendimentos, imoveis: demo.imoveis, atualizado_em: demo.atualizado_em, fonte: 'demo', vazio: true };
    } else {
      state.data = { atendimentos: d.atendimentos, imoveis: d.imoveis, atualizado_em: d.atualizado_em, fonte: 'nuvem' };
    }
    renderAll();
  }

  function setAuthMode(mode, msg, kind) {
    auth.mode = mode;
    const t = {
      entrar: ['Entre com o e-mail liberado pela sua imobiliária.', 'Entrar', 'Primeiro acesso? Criar senha'],
      criar: ['Crie uma senha para o e-mail liberado pela sua imobiliária. Enviaremos um link de confirmação.', 'Criar senha', 'Já tenho senha. Entrar'],
      recuperar: ['Informe seu e-mail para receber o link de troca de senha.', 'Enviar link', 'Voltar para entrar'],
      'nova-senha': ['Escolha uma nova senha.', 'Salvar senha', 'Voltar para entrar'],
      'sem-acesso': ['', 'Tentar de novo', 'Sair e entrar com outro e-mail']
    }[mode];
    document.getElementById('auth-sub').textContent = t[0];
    document.getElementById('auth-submit').textContent = t[1];
    document.getElementById('auth-toggle').textContent = t[2];
    document.getElementById('auth-email-field').hidden = mode === 'nova-senha' || mode === 'sem-acesso';
    document.getElementById('auth-password-field').hidden = mode === 'recuperar' || mode === 'sem-acesso';
    document.getElementById('auth-forgot').hidden = mode !== 'entrar';
    document.getElementById('auth-password').autocomplete = mode === 'entrar' ? 'current-password' : 'new-password';
    const m = document.getElementById('auth-msg');
    m.textContent = msg || '';
    m.className = 'auth-msg' + (kind ? ' ' + kind : '');
  }

  function showAuth(mode, msg, kind) {
    document.body.classList.add('auth-mode');
    document.getElementById('auth').hidden = false;
    setAuthMode(mode, msg, kind);
  }
  function hideAuth() {
    document.body.classList.remove('auth-mode');
    document.getElementById('auth').hidden = true;
  }

  function renderUser() {
    const isAdmin = auth.role === 'admin';
    const email = auth.session && auth.session.user ? auth.session.user.email : '';
    const u = document.getElementById('user');
    u.hidden = !email;
    u.textContent = email ? email + (isAdmin ? ' · administrador' : ' · leitor') : '';
    document.getElementById('btn-logout').hidden = false;
    document.getElementById('btn-team').hidden = !isAdmin;
    document.getElementById('btn-import').hidden = !isAdmin;
    document.getElementById('btn-demo').hidden = true;
    btnClear.textContent = 'Apagar dados da equipe';
  }

  async function enterApp() {
    auth.role = await Cloud.role();
    if (!auth.role) {
      showAuth('sem-acesso');
      document.getElementById('auth-sub').textContent = 'O e-mail ' + auth.session.user.email +
        ' ainda não tem acesso a este painel. Peça a um administrador para incluí-lo em "Equipe" e depois clique em "Tentar de novo".';
      return;
    }
    hideAuth();
    renderUser();
    await loadCloud();
  }

  document.getElementById('auth-form').addEventListener('submit', async function (ev) {
    ev.preventDefault();
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const btn = document.getElementById('auth-submit');
    const m = document.getElementById('auth-msg');
    btn.disabled = true;
    m.className = 'auth-msg';
    m.textContent = 'Aguarde…';
    try {
      if (auth.mode === 'entrar') {
        const r = await Cloud.signIn(email, password);
        auth.session = r.session;
        await enterApp();
      } else if (auth.mode === 'criar') {
        const r = await Cloud.signUp(email, password);
        if (r.session) { auth.session = r.session; await enterApp(); }
        else setAuthMode('entrar', 'Enviamos um link de confirmação para ' + email.trim() + '. Clique nele e depois entre com a senha criada.', 'ok');
      } else if (auth.mode === 'recuperar') {
        await Cloud.resetPassword(email);
        setAuthMode('entrar', 'Se o e-mail tiver cadastro, enviamos um link para trocar a senha.', 'ok');
      } else if (auth.mode === 'nova-senha') {
        await Cloud.updatePassword(password);
        auth.session = await Cloud.session();
        await enterApp();
      } else if (auth.mode === 'sem-acesso') {
        await enterApp();
      }
    } catch (e) {
      m.className = 'auth-msg error';
      m.textContent = e.message;
    } finally {
      btn.disabled = false;
    }
  });
  document.getElementById('auth-toggle').addEventListener('click', async function () {
    if (auth.mode === 'entrar') setAuthMode('criar');
    else if (auth.mode === 'sem-acesso') { await Cloud.signOut(); auth.session = null; setAuthMode('entrar'); }
    else setAuthMode('entrar');
  });
  document.getElementById('auth-forgot').addEventListener('click', function () { setAuthMode('recuperar'); });
  document.getElementById('btn-logout').addEventListener('click', async function () {
    await Cloud.signOut();
    auth.session = null;
    auth.role = null;
    state.data = { atendimentos: [], imoveis: [], atualizado_em: null, fonte: '' };
    destroyCharts();
    showAuth('entrar');
  });

  // Equipe
  const teamDlg = document.getElementById('team-dialog');
  function teamMsg(text, kind) {
    const m = document.getElementById('team-msg');
    m.textContent = text || '';
    m.className = 'auth-msg' + (kind ? ' ' + kind : '');
  }
  async function renderTeam() {
    const el = document.getElementById('team-list');
    try {
      const list = await Cloud.members();
      const me = auth.session.user.email.toLowerCase();
      el.innerHTML = list.map(function (m) {
        const self = m.email === me;
        return '<div class="team-row"><span class="email">' + esc(m.email) + (self ? ' (você)' : '') + '</span>' +
          '<select data-role="' + esc(m.email) + '" aria-label="Papel de ' + esc(m.email) + '"' + (self ? ' disabled' : '') + '>' +
          '<option value="leitor"' + (m.papel === 'leitor' ? ' selected' : '') + '>Leitor</option>' +
          '<option value="admin"' + (m.papel === 'admin' ? ' selected' : '') + '>Administrador</option></select>' +
          (self ? '' : '<button class="btn" type="button" data-remove="' + esc(m.email) + '">Remover</button>') + '</div>';
      }).join('');
    } catch (e) { teamMsg(e.message, 'error'); }
  }
  document.getElementById('btn-team').addEventListener('click', function () { teamMsg(''); teamDlg.showModal(); renderTeam(); });
  document.getElementById('team-close').addEventListener('click', function () { teamDlg.close(); });
  document.getElementById('team-form').addEventListener('submit', async function (ev) {
    ev.preventDefault();
    const email = document.getElementById('team-email').value;
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { teamMsg('Digite um e-mail válido.', 'error'); return; }
    try {
      await Cloud.addMember(email, document.getElementById('team-role').value);
      document.getElementById('team-email').value = '';
      teamMsg(email.trim().toLowerCase() + ' foi incluído. No primeiro acesso, a pessoa usa "Primeiro acesso? Criar senha".', 'ok');
      renderTeam();
    } catch (e) { teamMsg(e.message, 'error'); }
  });
  document.getElementById('team-list').addEventListener('change', async function (ev) {
    const email = ev.target.dataset.role;
    if (!email) return;
    try { await Cloud.addMember(email, ev.target.value); teamMsg('Papel de ' + email + ' atualizado.', 'ok'); }
    catch (e) { teamMsg(e.message, 'error'); renderTeam(); }
  });
  document.getElementById('team-list').addEventListener('click', async function (ev) {
    const email = ev.target.dataset && ev.target.dataset.remove;
    if (!email) return;
    if (ev.target.dataset.confirm !== '1') {
      ev.target.dataset.confirm = '1';
      ev.target.textContent = 'Confirmar remoção';
      ev.target.classList.add('danger');
      return;
    }
    try { await Cloud.removeMember(email); teamMsg(email + ' não tem mais acesso.', 'ok'); renderTeam(); }
    catch (e) { teamMsg(e.message, 'error'); }
  });

  async function startCloud() {
    showAuth('entrar', 'Conectando…');
    let recovery = /type=recovery/.test(location.hash);
    Cloud.onAuthChange(function (event, session) {
      if (event === 'PASSWORD_RECOVERY') { recovery = true; auth.session = session; showAuth('nova-senha'); }
    });
    try {
      auth.session = await Cloud.session();
      if (recovery && auth.session) { showAuth('nova-senha'); return; }
      if (!auth.session) { setAuthMode('entrar'); return; }
      await enterApp();
    } catch (e) {
      showAuth('entrar', e.message, 'error');
    }
  }

  // Tema: redesenha os gráficos quando o tema muda.
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', renderTab);
  }
  new MutationObserver(renderTab).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  // ---------- início ----------
  const hash = (location.hash || '').slice(1);
  let saved = null;
  try { saved = localStorage.getItem(TAB_KEY); } catch (e) { /* opcional */ }
  state.tab = REPORTS.some(function (t) { return t.id === hash; }) ? hash : (REPORTS.some(function (t) { return t.id === saved; }) ? saved : 'funil');
  if (cloudOn()) startCloud();
  else if (load()) renderAll();
  else useDemo();
})();
