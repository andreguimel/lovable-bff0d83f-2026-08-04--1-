# Performance Budget

| Métrica              | Alvo          | Bloqueia RC1? |
| -------------------- | ------------- | -------------- |
| LCP                  | < 2500 ms     | sim            |
| TBT                  | < 200 ms      | sim            |
| CLS                  | < 0.1         | sim            |
| Initial JS (gzip)    | < 180 kB      | sim            |
| Route JS (gzip)      | < 90 kB       | não (warn)     |
| API p95 (server fn)  | < 400 ms      | sim            |
| Realtime reconnect   | < 3 s         | não            |

## Como medir

- Bundle: `bunx vite-bundle-visualizer` gera `docs/audits/bundle.html`.
- Runtime: Playwright + Lighthouse CI (fase C).
- Server: percentis de `pipeline_duration_ms` em `/api/public/metrics`.

## Lazy candidates

- `@xyflow/react` (Flow editor)
- `recharts` (Reports)
- `cmdk` (Command Palette)
- `react-grid-layout` (Dashboard grid)
