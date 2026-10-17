# Agenda de Salas – SIAL Paris 2026

Site simples para a promotora controlar a agenda das salas **JBS 1** (azul) e **JBS 2** (laranja) durante o evento, de 17 a 21 de outubro, das 8h às 20h. Feito para uso em tablet.

## Como usar
- **Adicionar reunião**: botão no topo ou toque em um horário livre na grade.
- **Editar / excluir**: toque na reunião.
- **Mover**: segure a reunião por meio segundo e arraste (para outro horário ou para a outra sala). Confirme antes de salvar.
- **Ambas / JBS 1 / JBS 2**: filtra a visualização por sala.
- **Lista**: visão em lista do dia, boa para conferir rápido.
- **Backup / Restaurar**: baixa ou carrega um arquivo com toda a agenda.

## Onde ficam os dados
Dois modos, escolhidos automaticamente:

- **Compartilhado (recomendado)**: com o Supabase configurado, todos os aparelhos veem a mesma agenda, atualizada em tempo real. O banco também bloqueia duas reuniões sobrepostas na mesma sala.
- **Local**: sem configuração, os dados ficam só no navegador do aparelho (localStorage).

### Configurar o backend (uma vez, ~10 minutos)
1. Crie uma conta gratuita em [supabase.com](https://supabase.com) e um projeto novo (região: Europe West, mais perto de Paris).
2. No menu **SQL Editor**, cole o conteúdo de `supabase/schema.sql` e clique em **Run**.
3. Em **Project Settings → API**, copie a **Project URL** e a chave **anon public**.
4. Cole os dois valores em `assets/config.js` e faça commit.
5. Abra o site: o canto superior esquerdo deve mostrar "sincronizado · ao vivo".

A chave "anon" é pública por desenho: qualquer pessoa com o link do site pode ver e editar a agenda. Para um evento de 5 dias com link interno isso é aceitável. Se quiser restringir, o próximo passo é login por e-mail no Supabase.

## Publicar
É um site estático: `index.html` + `assets/`. Basta ativar o GitHub Pages neste repositório (Settings → Pages → Deploy from branch) ou hospedar os arquivos em qualquer servidor.
