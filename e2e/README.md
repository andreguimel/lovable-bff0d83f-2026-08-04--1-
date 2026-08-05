# Guardião — E2E Test Suite

Suíte end-to-end (13 cenários) que valida a aba Guardião ponta-a-ponta:
incidentes, listener global, subscription Realtime, endpoint público de cron,
histórico de saúde (snapshots + sparkline) e o fluxo principal da UI.


## Como rodar

Pré-requisitos (já presentes no sandbox Lovable):

- Servidor de preview em `http://localhost:8080`
- Python 3 + Playwright (`import playwright` funciona sem `pip install`)
- Sessão Supabase injetada automaticamente
  (`LOVABLE_BROWSER_AUTH_STATUS=injected`)

```bash
bash e2e/run.sh                       # roda todos os 11 cenários
bash e2e/run.sh --only test_panel_loads
bash e2e/run.sh --keep-going          # não para no primeiro FAIL
bash e2e/run.sh --headed              # janela visível (debug local)
```

Após a execução:

- Código de saída `0` se tudo passou, `1` no primeiro FAIL (ou último com
  `--keep-going`), `2` para argumento inválido.
- `e2e/report.json` — `{results: [{name, status, duration_ms, error}]}`.
- Screenshots em `/tmp/browser/guardian_e2e/screenshots/`
  (`<test>_fail_*.png` sempre que um cenário falha).

## Cenários cobertos

| # | Cenário                          | O que valida                                                             |
|---|----------------------------------|--------------------------------------------------------------------------|
| 1 | `test_cron_endpoint_auth`        | `/api/public/guardian-cron` responde 401 sem `apikey`                    |
| 2 | `test_panel_loads`               | `/settings/audit` renderiza cabeçalho e ação "Analisar agora"            |
| 3 | `test_scan_button`               | "Analisar agora" dispara scan e mantém painel montado                    |
| 4 | `test_incident_listener_toast`   | Erro sintético → toast global do Guardião aparece                        |
| 5 | `test_realtime_channel_open`     | Painel abre WebSocket `realtime` do Supabase                             |
| 6 | `test_incident_persists_in_panel`| Incidente sintético persiste e aparece após reload                       |
| 7 | `test_list_incidents_server_fn`  | `guardianListIncidents` responde do cliente autenticado                  |
| 8 | `test_reporter_dedupes`          | Dois erros idênticos → apenas um toast (dedup por fingerprint)           |
| 9 | `test_toast_cta_navigates`       | Botão "Analisar" no toast navega para `/settings/audit`                  |
|10 | `test_cron_endpoint_authorized`  | `apikey` válida devolve 200 + `{ok:true}` do cron público                |
|11 | `test_no_console_errors`         | Painel não emite erros não-Guardião no console                           |

Cada cenário roda em contexto de browser isolado (sessão restaurada via
localStorage + cookies antes de qualquer navegação autenticada).

## Debug

- **Falha específica:** rode `bash e2e/run.sh --only test_x --headed`; a
  janela abre visível e o screenshot fica em
  `/tmp/browser/guardian_e2e/screenshots/test_x_fail_0.png`.
- **Sessão ausente:** se `LOVABLE_BROWSER_AUTH_STATUS != injected`, a suíte
  aborta com mensagem clara. Faça login no preview e reexecute.
- **Alterar cenários:** edite `e2e/test_guardian.py`; helpers ficam em
  `e2e/lib.py` (restauração de sessão, disparo de erro sintético,
  leitura via `guardianListIncidents`).
