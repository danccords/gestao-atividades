# Gestão de Atividades de Engenharia — ALLOS

**App:** https://danccords.github.io/gestao-atividades/  
**Supabase:** projeto `gestao-atividades` (organização ALLOS Engenharia, região São Paulo)

> Já está tudo configurado. O passo a passo abaixo serve de referência caso precise refazer.

App web (funciona no computador e no celular) para organizar projetos e atividades da equipe, no estilo Monday, com anotações privadas no estilo Notion. Os dados ficam no **Supabase**.

## O que o app faz

| Área | Quem vê | O que dá pra fazer |
|---|---|---|
| **Projetos** | Toda a equipe | Cards com progresso, atrasos e responsáveis de cada projeto |
| **Atividades** (dentro do projeto) | Toda a equipe | Tabela estilo Monday (agrupada por status ou por responsável) ou Kanban. Cada atividade tem responsável, prazo, status, % de progresso, prioridade, descrição e comentários |
| **Minhas atividades** | Cada pessoa | Suas atividades separadas em *Atrasadas*, *Vencem em breve*, *No prazo*... O admin pode ver as de qualquer pessoa ou de todo mundo |
| **Anotações** | **Só o dono** | Páginas com títulos, listas, checklist, citações, código, links. Atalhos: `#` título, `-` lista, `[]` checklist, `>` citação. Salva sozinho |
| **Equipe** | Toda a equipe (só o admin edita) | Cadastro dos e-mails de quem pode entrar, papel (admin/colaborador), ativar/desativar, mensagem de convite pronta |

**Avisos de prazo** (padrão: 3 dias antes, ajustável):
1. **No app**: sino com contador, alertas vermelhos/amarelos em "Minhas atividades" e contador no menu.
2. **Notificação no aparelho**: ao abrir o app, a pessoa recebe uma notificação do celular/computador (precisa clicar em "Ativar notificações" uma vez).
3. **E-mail diário** (opcional, passo 7): de segunda a sexta às 8h, cada pessoa recebe a lista das atividades dela atrasadas ou vencendo.

**Permissões**
- **Administrador**: cria projetos e atividades, cadastra a equipe (a aba Equipe só aparece para admins), aprova ou recusa solicitações.
- **Colaborador**: vê os projetos e as atividades aprovadas; **solicita** novas atividades para ele mesmo, que ficam *aguardando aprovação* até um admin aprovar definindo **prazo** e **prioridade** (ou recusar com um motivo).
- **Administradores têm acesso livre a todas as atividades**, mesmo as passadas por outro admin. **Colaboradores só alteram as atividades em que são o responsável** (avançam etapas, status e atualizações); prazo, prioridade e responsável só admins. Os demais colaboradores apenas visualizam.
- Essas regras são aplicadas **no banco de dados** (não só na tela).
- As anotações são privadas de verdade: nem o administrador consegue ler as de outra pessoa.

**Fluxo por etapas (progresso mensurável)**
- Em **Modelos de etapas** (menu, só admins) ficam os fluxos da empresa, cada etapa com o **% acumulado** que ela representa (ex.: Projeto/Detalhamento → Levantamento/3D 30%, Detalhamento 2D 65%, Revisão interna 85%, Liberado p/ fabricação 100%). Vêm 4 modelos prontos; dá para criar, editar e desativar.
- Ao criar/aprovar uma atividade escolhe-se o modelo (ou *Livre*). A atividade recebe uma **cópia** das etapas, que pode ser ajustada só naquela atividade por quem passou.
- O **progresso e o status são calculados pelo banco**: % = última etapa concluída. Quem concluiu, concluiu: não há aprovação de etapa. Quando a atividade chega a 100%, o admin que passou recebe um aviso no sino (e notificação no aparelho, se ativada).
- **Colaborador em reunião sem o gestor**: cria a solicitação com o **prazo combinado** e a origem (ex.: "Reunião com cliente X"). O admin aprova definindo prazo real, prioridade, tamanho e o modelo de etapas. O prazo sugerido fica registrado. Se já começou, marca "Já iniciei" e pode ir concluindo etapas antes da aprovação.
- **Pedido de novo prazo**: o responsável pede, quem passou aprova ou recusa.
- **Impedimento**: aguardando cliente / fornecedor / informação interna / bloqueado, com observação.
- **Tamanho P/M/G** pesa no progresso do projeto (P=1, M=2, G=3).
- **Para você decidir**: na tela inicial e no sino aparecem solicitações e pedidos de prazo esperando você.
- **Histórico** automático de cada atividade (quem aprovou, mudou prazo, concluiu etapa...).
- **Subatividades pesam no progresso**: cada uma pertence a uma etapa e preenche o intervalo dela (ex.: etapa 30% → 65% com 2 de 4 feitas = 47%). O botão "Concluir etapa" só libera quando todas as subatividades daquela etapa estiverem feitas. Em atividades *Livres*, sem subatividades o % é manual; com subatividades, o % vem delas (até 99%) e o "Concluído" é marcado pelo responsável.

---

## Passo a passo para colocar no ar (cerca de 30 minutos)

### 1. Criar o projeto no Supabase
1. Entre em <https://supabase.com> → **New project**.
2. Dê um nome (ex.: `atividades-engenharia`), crie uma senha do banco e escolha a região **South America (São Paulo)**.

### 2. Criar o banco de dados
1. No menu lateral: **SQL Editor** → **New query**.
2. Abra o arquivo `supabase/schema.sql`, copie tudo, cole e clique em **Run**.
3. Ainda no SQL Editor, rode isto com **o seu e-mail e nome** (isso faz de você o administrador):
   ```sql
   insert into public.team_members (email, name, role)
   values ('seu.email@empresa.com.br', 'Seu Nome', 'admin');
   ```
   Use o e-mail **todo em minúsculas**.

### 3. Pegar as chaves e colocar no app
1. **Project Settings → API** (ou **API Keys**).
2. Copie a **Project URL** e a chave pública (**anon public** ou **publishable**).
3. Abra `config.js` e cole nos campos `SUPABASE_URL` e `SUPABASE_ANON_KEY`.
   Aproveite e ajuste `COMPANY_NAME` e `DUE_SOON_DAYS` (dias de antecedência do aviso).

> ⚠️ Nunca use a chave **service_role / secret** no app. A chave pública pode ficar no app; quem protege os dados são as regras do banco.

### 4. Publicar o app (para gerar o link que a equipe vai usar)
O Supabase guarda os dados, mas não hospeda o site. O jeito mais fácil e gratuito:

1. Acesse <https://app.netlify.com/drop>.
2. Arraste a pasta do app inteira para a página.
3. Pronto: ele gera um endereço tipo `https://nome-aleatorio.netlify.app`. Crie uma conta grátis para manter o site e trocar o nome (Site settings → Change site name, ex.: `atividades-suaempresa.netlify.app`).

Para atualizar depois, é só arrastar a pasta de novo em **Deploys**.
(Alternativas: Vercel, Cloudflare Pages ou GitHub Pages. Funciona igual: é só um site estático.)

### 5. Configurar o login no Supabase
Em **Authentication**:
1. **URL Configuration** → em **Site URL** coloque o endereço do app (ex.: `https://atividades-suaempresa.netlify.app`) e adicione o mesmo em **Redirect URLs**.
2. **Sign In / Providers → Email**: deixe ativado. Recomendo manter **Confirm email** ligado.
3. **(Recomendado) Hooks** → **Add hook** → **Before User Created** → tipo **Postgres** → schema `public`, função `hook_before_user_created`. Isso impede que alguém fora da lista da equipe crie conta.
4. **(Importante para equipes) SMTP**: o e-mail padrão do Supabase só envia poucas mensagens por hora e serve só para testes. Configure um SMTP próprio em **Authentication → Emails → SMTP Settings** (o Resend do passo 7 serve: host `smtp.resend.com`, porta `465`, usuário `resend`, senha = sua API key).
5. (Opcional) Em **Emails → Templates** traduza os textos de "Confirm signup" e "Reset password" para português.

### 6. Primeiro acesso e cadastro da equipe
1. Abra o link do app → **Primeiro acesso** → use o e-mail que você cadastrou no passo 2 → crie a senha → confirme pelo e-mail recebido → entre.
2. Vá em **Equipe** e cadastre cada colaborador (nome + e-mail). O app mostra uma **mensagem de convite pronta** para mandar no WhatsApp/e-mail.
3. Cada colaborador faz o mesmo: abre o link → **Primeiro acesso** → cria a senha.

### 7. (Opcional) Aviso de prazo por e-mail
1. Crie uma conta em <https://resend.com> (grátis até 3.000 e-mails/mês). Em **Domains**, verifique o domínio da empresa (para enviar de `avisos@suaempresa.com.br`). Sem domínio verificado, o Resend só envia para o seu próprio e-mail (serve para testar).
2. Crie uma **API Key** no Resend.
3. No Supabase: **Edge Functions** → **Deploy a new function** → **Via Editor**.
   - Nome: `notify-due-tasks`
   - Apague o código de exemplo e cole o conteúdo de `supabase/functions/notify-due-tasks/index.ts` → **Deploy**.
   - Nas configurações da função, **desligue "Verify JWT / Enforce JWT verification"** (a função tem a própria senha, a `CRON_SECRET`).
4. **Edge Functions → Secrets** → adicione:
   | Nome | Valor |
   |---|---|
   | `RESEND_API_KEY` | a chave do Resend |
   | `MAIL_FROM` | `Atividades <avisos@suaempresa.com.br>` |
   | `APP_URL` | endereço do app |
   | `CRON_SECRET` | invente uma senha longa |
   | `DUE_SOON_DAYS` | `3` (opcional) |
5. Abra `supabase/cron.sql`, troque `SEU-PROJETO` (está na Project URL) e `SUA-SENHA-DO-CRON` (a mesma `CRON_SECRET`), e rode no **SQL Editor**.
   Para testar na hora, rode o bloco comentado no final do arquivo.

Pela linha de comando (alternativa ao editor):
```bash
supabase functions deploy notify-due-tasks --no-verify-jwt
```

---

## Assistente IA (Gemini)
Botão roxo ✨ no canto da tela. Responde perguntas como "quais são minhas atividades mais urgentes?" ou "o que a equipe tem que fazer hoje?".
- Funciona pela Edge Function `assistente` (código em `supabase/functions/assistente/index.ts`), com a chave guardada no secret `GEMINI_API_KEY` do Supabase.
- A IA só recebe as atividades que a pessoa já pode ver no app. Anotações privadas nunca são enviadas.
- Plano gratuito do Gemini: tem limite diário de uso, e o Google pode usar as perguntas para melhorar os produtos dele. Para tirar isso, ative o faturamento na conta do Google AI Studio.
- Para trocar o modelo, crie o secret `GEMINI_MODEL` (ex.: `gemini-3.6-flash`).

## Backup
O plano grátis do Supabase **não faz backup automático**. Por isso o app tem backup próprio:
- **Equipe → Backup dos dados** (só admin): baixa um arquivo `.json` com projetos, atividades, comentários e a equipe. O app lembra o admin quando passar 7 dias sem backup.
- **Anotações → ⬇ Backup** (cada pessoa): baixa as próprias anotações, que são privadas.
- Para restaurar (no mesmo projeto ou num projeto Supabase novo, depois de rodar o `schema.sql`): **Equipe → Restaurar de um arquivo**.

Guarde os arquivos no OneDrive/Google Drive da empresa.

## Usar no celular como aplicativo
- **Android (Chrome)**: abra o link → menu ⋮ → **Instalar app** (ou "Adicionar à tela inicial").
- **iPhone (Safari)**: abra o link → botão **Compartilhar** → **Adicionar à Tela de Início**.

O app abre em tela cheia, com ícone próprio e menu inferior. No iPhone, as notificações do aparelho só funcionam depois de instalar na tela de início (iOS 16.4 ou mais novo).

---

## Estrutura dos arquivos
```
app/                         ← o site (é esta pasta que vai para o Netlify)
  index.html
  app.js                     ← toda a lógica das telas
  styles.css                 ← visual (computador e celular)
  config.js                  ← URL e chave do Supabase, nome da empresa, dias de aviso
  manifest.webmanifest, sw.js, icons/   ← permitem instalar no celular
supabase/
  schema.sql                 ← tabelas e regras de segurança (rodar 1 vez)
  cron.sql                   ← agendamento do e-mail diário
  functions/notify-due-tasks/index.ts   ← envio do e-mail de aviso
```

## Personalizações comuns
- **Dias de antecedência**: `DUE_SOON_DAYS` em `config.js` (e o secret `DUE_SOON_DAYS` da função de e-mail).
- **Horário do e-mail**: em `cron.sql`, `'0 11 * * 1-5'` = 11h UTC = 8h de Brasília, de segunda a sexta.
- **Nomes/cores dos status**: `STATUS` no começo do `app/app.js`. Para criar um status novo, adicione também na regra `check (status in (...))` da tabela `tasks` no `schema.sql`.
- **Tornar outra pessoa administradora**: aba **Equipe** → mude o papel para *Administrador*.

## Problemas comuns
- **"Acesso não liberado" depois de entrar**: o e-mail não está na aba Equipe (ou está com letra maiúscula diferente / desativado).
- **Não chega e-mail de confirmação**: limite do e-mail padrão do Supabase. Configure o SMTP (passo 5.4). Para destravar alguém na hora: **Authentication → Users** → no usuário, **Confirm user** (ou "Send magic link").
- **Link de confirmação abre uma página errada**: confira a **Site URL** e as **Redirect URLs** (passo 5.1).
- **Mudei o app e o celular mostra a versão antiga**: feche e abra o app de novo (ele busca a versão nova automaticamente quando tem internet).

## Avisos e modelos de anotação
- **Novidades nos seus serviços**: quando outra pessoa (ex.: o gestor) adiciona uma subatividade ou escreve um aviso/comentário num serviço seu, você recebe aviso no sino, na tela e no aparelho (se as notificações estiverem ativadas).
- **Modelos de anotação**: "Nova página" oferece Ata de reunião, Relatório de visita técnica e Checklist de inspeção.
- **PDF**: o botão **PDF** da anotação abre a impressão com cabeçalho da empresa; escolha "Salvar como PDF".
