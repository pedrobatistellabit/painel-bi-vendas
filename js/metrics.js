/*
 * Cálculo dos indicadores dos relatórios do Kenlo Inteligência.
 * Funções puras sobre as linhas normalizadas por model.js.
 *
 * Regra de contagem (igual ao Funil Imobiliário do Kenlo): cada etapa é um
 * evento contado pela própria data — leads pela data do lead, visitas pela
 * data da visita, propostas pela data da proposta e fechamentos pela data de
 * fechamento. Os relatórios de Lead Time usam a coorte pela data do lead.
 */
(function (root) {
  'use strict';

  const DAY = 864e5;
  const STAGES = [
    { key: 'leads', label: 'Leads', date: 'data_lead' },
    { key: 'visitas', label: 'Visitas', date: 'data_visita' },
    { key: 'propostas', label: 'Propostas', date: 'data_proposta' },
    { key: 'fechamentos', label: 'Fechamentos', date: 'data_fechamento' }
  ];

  function inRange(d, range) {
    return d instanceof Date && (!range || (d >= range.start && d <= range.end));
  }

  // Período anterior com a mesma duração, terminando no dia antes do início.
  function previousRange(range) {
    const len = range.end - range.start;
    const end = new Date(range.start.getTime() - 1);
    return { start: new Date(end.getTime() - len), end: end };
  }

  function pctChange(cur, prev) {
    if (!prev) return cur ? null : 0;
    return (cur - prev) / prev;
  }

  function ratio(a, b) { return b ? a / b : null; }

  function sum(rows, field) {
    return rows.reduce(function (s, r) { return s + (r[field] || 0); }, 0);
  }

  // Filtros de dimensão (unidade, equipe, corretor...). Valores vazios = todos.
  function applyFilters(rows, filters) {
    const keys = Object.keys(filters || {}).filter(function (k) {
      const v = filters[k];
      return v != null && v !== '' && !(Array.isArray(v) && !v.length);
    });
    if (!keys.length) return rows;
    return rows.filter(function (r) {
      return keys.every(function (k) {
        const v = filters[k];
        return Array.isArray(v) ? v.indexOf(r[k]) >= 0 : r[k] === v;
      });
    });
  }

  function funnel(rows, range) {
    const out = {};
    STAGES.forEach(function (s) {
      out[s.key] = rows.filter(function (r) { return inRange(r[s.date], range); }).length;
    });
    const closed = rows.filter(function (r) { return inRange(r.data_fechamento, range); });
    out.valor = sum(closed, 'valor_fechamento');
    out.comissao = sum(closed, 'comissao');
    out.conv = {
      visitas: ratio(out.visitas, out.leads),
      propostas: ratio(out.propostas, out.visitas),
      fechamentos: ratio(out.fechamentos, out.propostas),
      total: ratio(out.fechamentos, out.leads)
    };
    return out;
  }

  function funnelWithComparison(rows, range) {
    const cur = funnel(rows, range);
    const prev = funnel(rows, previousRange(range));
    const delta = {};
    ['leads', 'visitas', 'propostas', 'fechamentos', 'valor', 'comissao'].forEach(function (k) {
      delta[k] = pctChange(cur[k], prev[k]);
    });
    return { atual: cur, anterior: prev, variacao: delta };
  }

  function monthKey(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
  function dayKey(d) { return monthKey(d) + '-' + String(d.getDate()).padStart(2, '0'); }

  function monthsBetween(range) {
    const out = [];
    const d = new Date(range.start.getFullYear(), range.start.getMonth(), 1);
    while (d <= range.end) { out.push(monthKey(d)); d.setMonth(d.getMonth() + 1); }
    return out;
  }

  function daysBetween(range) {
    const out = [];
    const d = new Date(range.start.getFullYear(), range.start.getMonth(), range.start.getDate());
    while (d <= range.end) { out.push(dayKey(d)); d.setDate(d.getDate() + 1); }
    return out;
  }

  // Série temporal de cada etapa: { labels, leads:[], visitas:[], ... }.
  function timeline(rows, range, granularity) {
    const keyFn = granularity === 'dia' ? dayKey : monthKey;
    const labels = granularity === 'dia' ? daysBetween(range) : monthsBetween(range);
    const idx = {};
    labels.forEach(function (l, i) { idx[l] = i; });
    const out = { labels: labels };
    STAGES.forEach(function (s) {
      const arr = labels.map(function () { return 0; });
      rows.forEach(function (r) {
        if (inRange(r[s.date], range)) {
          const i = idx[keyFn(r[s.date])];
          if (i != null) arr[i]++;
        }
      });
      out[s.key] = arr;
    });
    return out;
  }

  // Contagem por status para visitas ou propostas, por mês.
  function statusByMonth(rows, range, stage) {
    const dateField = stage === 'visitas' ? 'data_visita' : 'data_proposta';
    const statusField = stage === 'visitas' ? 'status_visita' : 'status_proposta';
    const labels = monthsBetween(range);
    const series = {};
    rows.forEach(function (r) {
      if (!inRange(r[dateField], range)) return;
      const st = r[statusField] || 'Sem status';
      if (!series[st]) series[st] = labels.map(function () { return 0; });
      const i = labels.indexOf(monthKey(r[dateField]));
      if (i >= 0) series[st][i]++;
    });
    return { labels: labels, series: series };
  }

  // Indicadores do funil agrupados por uma dimensão (equipe, corretor, mídia...).
  function groupFunnel(rows, range, dim) {
    const groups = {};
    rows.forEach(function (r) {
      const g = r[dim] || 'Não informado';
      (groups[g] = groups[g] || []).push(r);
    });
    return Object.keys(groups).map(function (g) {
      const f = funnel(groups[g], range);
      return {
        nome: g, leads: f.leads, visitas: f.visitas, propostas: f.propostas,
        fechamentos: f.fechamentos, valor: f.valor, comissao: f.comissao,
        conv_visita: f.conv.visitas, conv_proposta: f.conv.propostas,
        conv_fechamento: f.conv.fechamentos, conv_total: f.conv.total
      };
    }).filter(function (g) { return g.leads || g.visitas || g.propostas || g.fechamentos; })
      .sort(function (a, b) { return b.fechamentos - a.fechamentos || b.valor - a.valor || b.leads - a.leads; });
  }

  // Status de visitas/propostas por uma dimensão: { nomes, status, matriz }.
  function statusByGroup(rows, range, dim, stage) {
    const dateField = stage === 'visitas' ? 'data_visita' : 'data_proposta';
    const statusField = stage === 'visitas' ? 'status_visita' : 'status_proposta';
    const table = {};
    const statuses = {};
    rows.forEach(function (r) {
      if (!inRange(r[dateField], range)) return;
      const g = r[dim] || 'Não informado';
      const st = r[statusField] || 'Sem status';
      statuses[st] = true;
      table[g] = table[g] || {};
      table[g][st] = (table[g][st] || 0) + 1;
    });
    const status = Object.keys(statuses).sort();
    const nomes = Object.keys(table).sort(function (a, b) {
      const ta = status.reduce(function (s, k) { return s + (table[a][k] || 0); }, 0);
      const tb = status.reduce(function (s, k) { return s + (table[b][k] || 0); }, 0);
      return tb - ta;
    });
    return {
      nomes: nomes, status: status,
      matriz: nomes.map(function (n) { return status.map(function (s) { return table[n][s] || 0; }); })
    };
  }

  // Relatório VGL / VGV.
  function vglVgv(rows, range) {
    const closed = rows.filter(function (r) { return inRange(r.data_fechamento, range); });
    const loc = closed.filter(function (r) { return r.pretensao === 'Locação'; });
    const ven = closed.filter(function (r) { return r.pretensao === 'Venda'; });

    function rankBy(list) {
      const by = {};
      list.forEach(function (r) {
        const k = r.corretor || 'Não informado';
        by[k] = (by[k] || 0) + (r.valor_fechamento || 0);
      });
      return Object.keys(by).map(function (k) { return { nome: k, valor: by[k] }; })
        .sort(function (a, b) { return b.valor - a.valor; }).slice(0, 10);
    }

    function byMarket(list, dim) {
      const out = {};
      list.forEach(function (r) {
        const k = r[dim] || 'Não informado';
        const m = r.mercado || 'Não informado';
        out[k] = out[k] || {};
        out[k][m] = (out[k][m] || 0) + (r.valor_fechamento || 0);
      });
      return out;
    }

    return {
      cards: {
        vgl: sum(loc, 'valor_fechamento'), unidades_locadas: loc.length, comissao_locacao: sum(loc, 'comissao'),
        vgv: sum(ven, 'valor_fechamento'), unidades_vendidas: ven.length, comissao_venda: sum(ven, 'comissao')
      },
      ranking_vgv: rankBy(ven),
      ranking_vgl: rankBy(loc),
      vgv_unidade: byMarket(ven, 'unidade'),
      vgl_unidade: byMarket(loc, 'unidade'),
      midias: byMarket(closed, 'midia'),
      tabela: closed.map(function (r) {
        return {
          imovel_ref: r.imovel_ref, pretensao: r.pretensao, mercado: r.mercado, corretor: r.corretor,
          proprietario: r.proprietario, data_lead: r.data_lead, data_fechamento: r.data_fechamento,
          dias_ate_fechamento: r.data_lead ? Math.round((r.data_fechamento - r.data_lead) / DAY) : null,
          midia: r.midia, valor: r.valor_fechamento, comissao: r.comissao
        };
      }).sort(function (a, b) { return b.data_fechamento - a.data_fechamento; })
    };
  }

  // Relatório Leads por Imóvel.
  function leadsPorImovel(rows, range) {
    const leads = rows.filter(function (r) { return inRange(r.data_lead, range); });
    function distinct(f) {
      const s = {};
      leads.forEach(function (r) { if (r[f]) s[r[f]] = true; });
      return Object.keys(s).length;
    }
    function top(f, n) {
      const c = {};
      leads.forEach(function (r) { if (r[f]) c[r[f]] = (c[r[f]] || 0) + 1; });
      return Object.keys(c).map(function (k) { return { nome: k, leads: c[k] }; })
        .sort(function (a, b) { return b.leads - a.leads; }).slice(0, n);
    }
    const det = {};
    leads.forEach(function (r) {
      const k = (r.midia || 'Não informado') + '|' + (r.imovel_ref || '');
      if (!det[k]) {
        det[k] = {
          midia: r.midia || 'Não informado', leads: 0, imovel_ref: r.imovel_ref,
          empreendimento: r.empreendimento, cidade: r.cidade, bairro: r.bairro, cep: r.cep
        };
      }
      det[k].leads++;
    });
    const pontos = {};
    leads.forEach(function (r) {
      if (r.lat == null || r.lng == null) return;
      const k = r.imovel_ref || (r.lat + ',' + r.lng);
      if (!pontos[k]) pontos[k] = { ref: r.imovel_ref, bairro: r.bairro, lat: r.lat, lng: r.lng, leads: 0 };
      pontos[k].leads++;
    });
    return {
      cards: { leads: leads.length, imoveis: distinct('imovel_ref'), cidades: distinct('cidade'), bairros: distinct('bairro') },
      top_imoveis: top('imovel_ref', 10),
      top_bairros: top('bairro', 10),
      tabela: Object.keys(det).map(function (k) { return det[k]; }).sort(function (a, b) { return b.leads - a.leads; }),
      pontos: Object.keys(pontos).map(function (k) { return pontos[k]; })
    };
  }

  // Eficiência por canal: participação de cada grupo de mídia nos leads e fechamentos.
  function eficienciaCanal(rows, range) {
    const grupos = groupFunnel(rows, range, 'grupo_midia');
    const totLeads = grupos.reduce(function (s, g) { return s + g.leads; }, 0);
    const totFech = grupos.reduce(function (s, g) { return s + g.fechamentos; }, 0);
    grupos.forEach(function (g) {
      g.share_leads = ratio(g.leads, totLeads);
      g.share_fechamentos = ratio(g.fechamentos, totFech);
    });
    return { grupos: grupos, midias: groupFunnel(rows, range, 'midia') };
  }

  function mean(arr) { return arr.length ? arr.reduce(function (s, v) { return s + v; }, 0) / arr.length : null; }
  function median(arr) {
    if (!arr.length) return null;
    const s = arr.slice().sort(function (a, b) { return a - b; });
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  // Lead Time: tempo médio (dias) entre as etapas, coorte pela data do lead.
  // Só entram leads que andaram no funil (têm ao menos a etapa seguinte).
  function leadTime(rows, range) {
    const cohort = rows.filter(function (r) { return inRange(r.data_lead, range); });
    function diffs(list, a, b) {
      return list.filter(function (r) { return r[a] && r[b] && r[b] >= r[a]; })
        .map(function (r) { return (r[b] - r[a]) / DAY; });
    }
    function block(list) {
      const steps = [
        ['lead_visita', 'data_lead', 'data_visita', 'Lead → Visita'],
        ['visita_proposta', 'data_visita', 'data_proposta', 'Visita → Proposta'],
        ['proposta_fechamento', 'data_proposta', 'data_fechamento', 'Proposta → Fechamento'],
        ['lead_fechamento', 'data_lead', 'data_fechamento', 'Lead → Fechamento (total)']
      ];
      return steps.map(function (s) {
        const d = diffs(list, s[1], s[2]);
        return { key: s[0], label: s[3], media: mean(d), mediana: median(d), n: d.length };
      });
    }
    function byDim(dim) {
      const groups = {};
      cohort.forEach(function (r) { const g = r[dim] || 'Não informado'; (groups[g] = groups[g] || []).push(r); });
      return Object.keys(groups).map(function (g) {
        const b = block(groups[g]);
        return {
          nome: g, lead_visita: b[0].media, visita_proposta: b[1].media,
          proposta_fechamento: b[2].media, lead_fechamento: b[3].media, fechamentos: b[3].n
        };
      }).filter(function (g) { return g.lead_visita != null; })
        .sort(function (a, b) { return (a.lead_fechamento == null) - (b.lead_fechamento == null) || a.lead_fechamento - b.lead_fechamento; });
    }
    return {
      geral: block(cohort),
      venda: block(cohort.filter(function (r) { return r.pretensao === 'Venda'; })),
      locacao: block(cohort.filter(function (r) { return r.pretensao === 'Locação'; })),
      por_corretor: byDim('corretor'),
      por_grupo_midia: byDim('grupo_midia')
    };
  }

  // Carteira de imóveis / proprietários.
  function carteira(imoveis, filters) {
    const list = applyFilters(imoveis, filters);
    const ativos = list.filter(function (r) { return !r.status || /^\s*(ativ|dispon)/i.test(r.status); });
    const props = {};
    list.forEach(function (r) { if (r.proprietario) props[r.proprietario] = true; });
    function countBy(f, n) {
      const c = {};
      list.forEach(function (r) { const k = r[f] || 'Não informado'; c[k] = (c[k] || 0) + 1; });
      return Object.keys(c).map(function (k) { return { nome: k, imoveis: c[k] }; })
        .sort(function (a, b) { return b.imoveis - a.imoveis; }).slice(0, n || Infinity);
    }
    // Preço por m² e ticket médio da própria carteira, por bairro e pretensão.
    // Faixas de exclusão iguais às do Kenlo (Visão de Mercado - Preço por m²).
    function valido(r) {
      if (r.valor == null) return false;
      if (r.pretensao === 'Venda') return r.valor >= 50000 && r.valor <= 100000000;
      if (r.pretensao === 'Locação') return r.valor >= 10 && r.valor <= 100000;
      return true;
    }
    const m2 = {};
    ativos.filter(valido).forEach(function (r) {
      const k = (r.bairro || 'Não informado') + '|' + (r.pretensao || '');
      m2[k] = m2[k] || { bairro: r.bairro || 'Não informado', cidade: r.cidade, pretensao: r.pretensao, imoveis: 0, soma_valor: 0, soma_area: 0, valor_com_area: 0 };
      m2[k].imoveis++;
      m2[k].soma_valor += r.valor;
      if (r.area_m2 > 0) { m2[k].soma_area += r.area_m2; m2[k].valor_com_area += r.valor; }
    });
    const precoM2 = Object.keys(m2).map(function (k) {
      const g = m2[k];
      return {
        bairro: g.bairro, cidade: g.cidade, pretensao: g.pretensao, imoveis: g.imoveis,
        ticket_medio: g.soma_valor / g.imoveis,
        preco_m2: g.soma_area ? g.valor_com_area / g.soma_area : null
      };
    }).sort(function (a, b) { return b.imoveis - a.imoveis; });

    const venda = ativos.filter(function (r) { return r.pretensao === 'Venda' && valido(r); });
    const loc = ativos.filter(function (r) { return r.pretensao === 'Locação' && valido(r); });
    return {
      cards: {
        proprietarios: Object.keys(props).length, imoveis: list.length, ativos: ativos.length,
        cidades: countBy('cidade').length, bairros: countBy('bairro').length,
        vgv_estoque: sum(venda, 'valor'), vgl_estoque: sum(loc, 'valor'),
        ticket_venda: venda.length ? sum(venda, 'valor') / venda.length : null,
        ticket_locacao: loc.length ? sum(loc, 'valor') / loc.length : null
      },
      top_bairros: countBy('bairro', 20),
      por_cidade: countBy('cidade'),
      preco_m2: precoM2,
      tabela: list
    };
  }

  // Captação de novos imóveis por mês (pela data de cadastro).
  function captacaoMensal(imoveis, range) {
    const labels = monthsBetween(range);
    const venda = labels.map(function () { return 0; });
    const loc = labels.map(function () { return 0; });
    imoveis.forEach(function (r) {
      if (!inRange(r.data_cadastro, range)) return;
      const i = labels.indexOf(monthKey(r.data_cadastro));
      if (i < 0) return;
      if (r.pretensao === 'Locação') loc[i]++; else venda[i]++;
    });
    return { labels: labels, venda: venda, locacao: loc };
  }

  function distinctValues(rows, field) {
    const s = {};
    rows.forEach(function (r) { if (r[field]) s[r[field]] = true; });
    return Object.keys(s).sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); });
  }

  const api = {
    STAGES: STAGES, previousRange: previousRange, pctChange: pctChange, applyFilters: applyFilters,
    funnel: funnel, funnelWithComparison: funnelWithComparison, timeline: timeline,
    statusByMonth: statusByMonth, groupFunnel: groupFunnel, statusByGroup: statusByGroup,
    vglVgv: vglVgv, leadsPorImovel: leadsPorImovel, eficienciaCanal: eficienciaCanal,
    leadTime: leadTime, carteira: carteira, captacaoMensal: captacaoMensal,
    distinctValues: distinctValues, monthKey: monthKey
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KMetrics = api;
})(this);
