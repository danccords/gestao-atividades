// =====================================================================
//  CONFIGURAÇÃO — preencha com os dados do seu projeto Supabase
//  (Supabase > Project Settings > API)
// =====================================================================

// URL do projeto, ex.: 'https://abcdefghijk.supabase.co'
export const SUPABASE_URL = 'https://SEU-PROJETO.supabase.co';

// Chave pública ("anon public" ou "publishable key"). Ela PODE ficar no app:
// quem protege os dados são as regras de segurança criadas no schema.sql.
// NUNCA coloque aqui a chave "service_role" / "secret".
export const SUPABASE_ANON_KEY = 'SUA-CHAVE-PUBLICA';

// Nome que aparece no topo do app
export const APP_NAME = 'Gestão de Atividades';
export const COMPANY_NAME = 'ALLOS Engenharia e Projetos';

// Quantos dias antes do prazo a atividade passa a ser "vencendo"
export const DUE_SOON_DAYS = 3;
