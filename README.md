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
Os dados ficam salvos no navegador do aparelho (localStorage). Não há servidor. Se a agenda for usada em mais de um aparelho, use Backup/Restaurar para sincronizar manualmente.

## Publicar
É um site estático: `index.html` + `assets/`. Basta ativar o GitHub Pages neste repositório (Settings → Pages → Deploy from branch) ou hospedar os arquivos em qualquer servidor.
