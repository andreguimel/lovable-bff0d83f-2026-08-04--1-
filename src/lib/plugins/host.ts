/**
 * Plugin Host — pontos de extensão nomeados. Módulos internos e (futuramente)
 * plugins externos registram capacidades sem tocar no core.
 *
 * Extension points canônicos:
 *   - `inbox.messageActions`      → botão extra na barra de ações de mensagem
 *   - `crm.contactTabs`           → aba adicional no drawer de contato
 *   - `dashboard.widgets`         → widget adicional no dashboard
 *   - `flows.nodeTypes`           → novo tipo de nó no editor
 *   - `settings.sections`         → nova seção nos ajustes
 */

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  author?: string;
  permissions?: string[];
  events?: string[];
  dependencies?: string[];
  hooks?: string[];
}

type Registration<T> = { manifest: PluginManifest; value: T };

const store = new Map<string, Registration<unknown>[]>();

export function register<T>(extensionPoint: string, manifest: PluginManifest, value: T) {
  const bucket = store.get(extensionPoint) ?? [];
  bucket.push({ manifest, value });
  store.set(extensionPoint, bucket);
}

export function query<T>(extensionPoint: string): Registration<T>[] {
  return (store.get(extensionPoint) as Registration<T>[] | undefined) ?? [];
}

export function listPoints(): string[] {
  return Array.from(store.keys());
}
