<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Regra global de missões (a partir do Gate de Consolidação — 2026-07-16)

Nenhuma sub-missão pode modificar arquitetura, banco, Runtime Engine, RBAC, RLS, Server Functions, Providers, Pipeline, Event Bus ou Design System global, salvo bug Crítico/Alto comprovado com evidência. Ajustes Médios/Baixos vão para o backlog (`docs/audits/master-audit/backlog.md`). Cada missão termina obrigatoriamente com relatório de conclusão + evidências + decisão explícita **Encerrada** ou **Bloqueada**. Proibido reabrir missões concluídas ou refatorar fora do escopo. O objetivo é finalizar a plataforma, não reiniciar ciclos de melhorias contínuas.

