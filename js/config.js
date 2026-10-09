/*
 * Conexão com o Supabase (opcional).
 *
 * Deixe em branco para o modo local: cada pessoa importa as planilhas no
 * próprio navegador. Preenchido, o painel pede login e todos da equipe veem
 * a mesma base.
 *
 * A chave aqui é a chave PÚBLICA do projeto (publishable / anon). Ela pode
 * ficar no código: quem protege os dados são as regras de acesso do banco
 * (supabase/migrations). Nunca coloque aqui a chave secreta (service_role).
 */
window.KENLO_BI_CONFIG = {
  supabaseUrl: '',
  supabaseKey: ''
};
