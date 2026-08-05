# Module Template

Toda nova pasta em `src/domain/<módulo>/` DEVE conter:

```
src/domain/<módulo>/
  service.ts          # Application Service — orquestra comandos
  domain.ts           # Regras de negócio puras (funções + tipos)
  repository.ts       # Único autorizado a chamar supabase.*
  types.ts            # Tipos + reexport dos DTOs do lib/contracts
  events.ts           # Emissores de eventos (via emitEvent)
  errors.ts           # Códigos específicos do módulo
  permissions.ts      # Chaves derivadas de src/lib/rbac/registry
  telemetry.ts        # counter/observe do módulo
  README.md           # Contrato público
```

Componentes de UI ficam em `src/components/<módulo>/` e nunca importam
`@/integrations/supabase/*` diretamente — sempre via hook → service.

## Server function canônica

```ts
export const createContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(ContactCreateInput.parse)
  .handler((args) =>
    runPipeline({
      name: "crm.contact.create",
      module: "crm",
      permission: "crm.contact.write",
      args,
      run: ({ input, ctx, correlationId }) =>
        contactService.create(ctx.supabase, ctx.userId, input, correlationId),
    }),
  );
```

## Checklist de release por módulo

- [ ] Services + Repository criados
- [ ] Contracts Zod versionados
- [ ] Permissões declaradas no registry
- [ ] Feature registrada em `FEATURES`
- [ ] Query keys em `qk.<mod>`
- [ ] Eventos declarados em `EVENT_REGISTRY`
- [ ] Health check (quando aplicável)
- [ ] Telemetria: latência + contadores
- [ ] Auditoria via pipeline
- [ ] Testes unitários do domain service
- [ ] README.md
