/* IA BRAZIL — configuração de onde os contatos do formulário ficam guardados */

// TROCAR: dados do seu projeto no Supabase (passo a passo completo em scripts/supabase-leads.sql).
// Onde achar: no painel do Supabase, botão "Connect" no topo ou Project Settings > API Keys.
//   supabaseUrl: a "Project URL", algo como https://abcdefghijk.supabase.co
//   supabaseAnonKey: a chave pública "Publishable key" (sb_publishable_...) ou, em projetos
//   antigos, a "anon public". Ela pode ficar no site: as regras do banco só deixam inserir contatos.
// NUNCA cole aqui a chave "secret" ou "service_role": ela ignora as regras e libera tudo.
// Enquanto os dois campos estiverem vazios, o site roda em modo demonstração: os contatos ficam
// salvos só no navegador de quem enviou (serve para testar o fluxo, não para receber de verdade).
window.IABR_CONFIG = {
  supabaseUrl: '',
  supabaseAnonKey: '',
};
