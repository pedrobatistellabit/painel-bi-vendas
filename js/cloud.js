/*
 * Conexão com o Supabase: login, leitura da base ativa e importação em lotes.
 * Só é usado quando js/config.js tem a URL e a chave pública do projeto;
 * sem isso o painel funciona no modo local (dados só no navegador).
 */
(function (root) {
  'use strict';

  const Model = root.KModel || (typeof require === 'function' ? require('./model.js') : null);
  const cfg = root.KENLO_BI_CONFIG || {};
  const enabled = !!(cfg.supabaseUrl && cfg.supabaseKey);
  const PAGE = 1000;
  const BATCH = 500;

  const DATE_FIELDS = ['data_lead', 'data_visita', 'data_proposta', 'data_fechamento', 'data_cadastro'];
  const NUMBER_FIELDS = ['lat', 'lng', 'valor_fechamento', 'comissao', 'valor', 'area_m2'];
  const FIELDS = {
    atendimentos: Object.keys(Model.ATENDIMENTO_FIELDS),
    imoveis: Object.keys(Model.IMOVEL_FIELDS)
  };
  // No banco a coluna "id" do lead se chama "codigo" (a chave é importacao_id + linha).
  const RENAME = { atendimentos: { id: 'codigo' }, imoveis: {} };

  let client = null;
  function sb() {
    if (!enabled) throw new Error('Supabase não configurado');
    if (!client) {
      if (!root.supabase || !root.supabase.createClient) throw new Error('A biblioteca do Supabase não carregou. Verifique a conexão com a internet.');
      client = root.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
    }
    return client;
  }

  function check(res) {
    if (res.error) throw new Error(traduzir(res.error.message || String(res.error)));
    return res.data;
  }

  function traduzir(msg) {
    const m = String(msg);
    if (/Invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.';
    if (/Email not confirmed/i.test(m)) return 'Confirme seu e-mail pelo link que enviamos antes de entrar.';
    if (/User already registered/i.test(m)) return 'Este e-mail já tem cadastro. Use "Entrar" ou "Esqueci a senha".';
    if (/Password should be at least/i.test(m)) return 'A senha precisa ter pelo menos 6 caracteres.';
    if (/Email logins are disabled|Signups not allowed/i.test(m)) return 'O login por e-mail está desativado no servidor. Avise o administrador do painel.';
    if (/Email address not authorized/i.test(m)) return 'O servidor ainda não está configurado para enviar e-mails a este endereço. Avise o administrador (configuração de SMTP no Supabase).';
    if (/rate limit|too many/i.test(m)) return 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.';
    if (/Failed to fetch|NetworkError/i.test(m)) return 'Sem conexão com o servidor. Verifique a internet.';
    if (/row-level security|permission denied|42501/i.test(m)) return 'Seu usuário não tem permissão para esta ação.';
    return m;
  }

  function redirectUrl() { return location.href.split('#')[0]; }

  function toDb(kind, r, importacaoId, linha) {
    const o = { importacao_id: importacaoId, linha: linha };
    FIELDS[kind].forEach(function (f) {
      let v = r[f];
      if (v === undefined || v === '' || (typeof v === 'number' && !isFinite(v))) v = null;
      if (v != null) {
        if (DATE_FIELDS.indexOf(f) >= 0) v = v instanceof Date && !isNaN(v) ? v.toISOString() : null;
        else if (NUMBER_FIELDS.indexOf(f) < 0) v = String(v);
      }
      o[RENAME[kind][f] || f] = v;
    });
    return o;
  }

  function fromDb(kind, row) {
    const r = {};
    FIELDS[kind].forEach(function (f) {
      let v = row[RENAME[kind][f] || f];
      if (v != null && DATE_FIELDS.indexOf(f) >= 0) v = new Date(v);
      else if (v != null && NUMBER_FIELDS.indexOf(f) >= 0) v = Number(v);
      r[f] = v == null ? null : v;
    });
    return r;
  }

  async function fetchAll(table, importacaoId) {
    const out = [];
    for (let from = 0; ; from += PAGE) {
      const rows = check(await sb().from(table).select('*').eq('importacao_id', importacaoId)
        .order('linha', { ascending: true }).range(from, from + PAGE - 1));
      out.push.apply(out, rows);
      if (rows.length < PAGE) return out;
    }
  }

  const api = {
    enabled: enabled,

    async session() {
      const s = check(await sb().auth.getSession());
      return s.session;
    },
    onAuthChange(cb) { sb().auth.onAuthStateChange(function (event, session) { cb(event, session); }); },
    async signIn(email, password) {
      return check(await sb().auth.signInWithPassword({ email: email.trim().toLowerCase(), password: password }));
    },
    async signUp(email, password) {
      return check(await sb().auth.signUp({
        email: email.trim().toLowerCase(), password: password, options: { emailRedirectTo: redirectUrl() }
      }));
    },
    async resetPassword(email) {
      return check(await sb().auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: redirectUrl() }));
    },
    async updatePassword(password) { return check(await sb().auth.updateUser({ password: password })); },
    async signOut() { await sb().auth.signOut(); },

    async role() { return check(await sb().rpc('papel_atual')); },

    // Base ativa: { atendimentos, imoveis, atualizado_em, importacoes }
    async load() {
      const imps = check(await sb().from('importacoes').select('*').eq('status', 'ativa'));
      const data = { atendimentos: [], imoveis: [], atualizado_em: null, importacoes: imps };
      for (const imp of imps) {
        const rows = await fetchAll(imp.tipo, imp.id);
        data[imp.tipo] = rows.map(function (r) { return fromDb(imp.tipo, r); });
        const d = new Date(imp.ativada_em || imp.criado_em);
        if (!data.atualizado_em || d > data.atualizado_em) data.atualizado_em = d;
      }
      return data;
    },

    // Envia uma base nova; a anterior só é trocada no fim, de uma vez.
    async upload(kind, rows, arquivos, onProgress) {
      const imp = check(await sb().from('importacoes').insert({ tipo: kind, arquivos: arquivos }).select().single());
      for (let i = 0; i < rows.length; i += BATCH) {
        const lote = rows.slice(i, i + BATCH).map(function (r, j) { return toDb(kind, r, imp.id, i + j + 1); });
        check(await sb().from(kind).insert(lote));
        if (onProgress) onProgress(Math.min(i + BATCH, rows.length), rows.length);
      }
      return check(await sb().rpc('ativar_importacao', { p_id: imp.id }));
    },

    async clear() { check(await sb().rpc('limpar_dados')); },

    async members() { return check(await sb().from('membros').select('*').order('email')); },
    async addMember(email, papel) {
      return check(await sb().from('membros').upsert({ email: email.trim().toLowerCase(), papel: papel }));
    },
    async removeMember(email) { return check(await sb().from('membros').delete().eq('email', email)); },

    // exposto para testes
    _toDb: toDb, _fromDb: fromDb
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KCloud = api;
})(this);
