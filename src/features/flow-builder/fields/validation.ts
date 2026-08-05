/**
 * FB-04 — Utilitário puro (sem React) de mapeamento de erros de campo.
 *
 * Separado do renderer para permitir testes fora do DOM e reuso em
 * qualquer superfície que consuma o mesmo contrato de campos.
 */
import { isEmpty, type FieldSpec } from "./types";

export interface FieldIssue {
  path?: string;
  message: string;
  severity: "error" | "warning";
}

export function makeErrorLookup(
  fields: FieldSpec[],
  data: Record<string, unknown>,
  blockIssues: FieldIssue[],
): (path: string) => string | null {
  const map = new Map<string, string>();
  for (const f of fields) {
    if ("required" in f && f.required && "key" in f && f.key) {
      if (isEmpty(data[f.key])) {
        map.set(f.key, `${("label" in f && f.label) || f.key} é obrigatório`);
      }
    }
  }
  for (const i of blockIssues) {
    if (i.severity !== "error") continue;
    if (i.path) map.set(i.path, i.message);
  }
  return (path: string) => map.get(path) ?? null;
}
