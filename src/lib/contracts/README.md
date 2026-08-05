# Contracts

Zod schemas versionados. Fonte única de verdade para DTOs de:

- Entradas de Server Functions
- Saídas de Server Functions
- Payloads de eventos (`domain_events`)
- Mensagens Realtime
- Webhooks entrantes/saintes
- RPCs

Convenção de versionamento: `DomainDTOv1`, `DomainDTOv2`. Nunca quebrar
`v1` em uso — criar `v2` e migrar consumidores.

```ts
import { z } from "zod";

export const ContactDTOv1 = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  email: z.string().email().nullable(),
  phone: z.string().nullable(),
});
export type ContactDTOv1 = z.infer<typeof ContactDTOv1>;
```
