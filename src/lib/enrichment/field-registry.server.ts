/**
 * Built-in contact fields the Enrichment Agent can write in Phase 2.
 *
 * Custom fields (CPF/CNPJ/RG/CEP/PIX/etc.) are recognized in extraction
 * output but recorded as `unknown_field` in history until a later phase
 * wires them into `custom_fields` + `contact_field_values`. This keeps
 * Phase 2 bounded while preserving audit visibility.
 */

export type BuiltInContactField = "name" | "email" | "phone" | "company_name" | "job_title";

export type FieldRegistryEntry = {
  key: BuiltInContactField;
  column: BuiltInContactField; // 1:1 with public.contacts columns in Phase 2
  normalize: (v: string) => string;
  validate: (v: string) => boolean;
};

const trim = (v: string) => v.trim();
const lower = (v: string) => v.trim().toLowerCase();
const digitsOnly = (v: string) => v.replace(/\D+/g, "");

export const BUILT_IN_FIELDS: Record<BuiltInContactField, FieldRegistryEntry> = {
  name: {
    key: "name",
    column: "name",
    normalize: (v) => trim(v).replace(/\s+/g, " "),
    validate: (v) => v.length >= 2 && v.length <= 200,
  },
  email: {
    key: "email",
    column: "email",
    normalize: lower,
    validate: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 254,
  },
  phone: {
    key: "phone",
    column: "phone",
    normalize: (v) => {
      const d = digitsOnly(v);
      return d.startsWith("55") ? `+${d}` : d.length >= 10 ? `+55${d}` : d;
    },
    validate: (v) => digitsOnly(v).length >= 8 && digitsOnly(v).length <= 15,
  },
  company_name: {
    key: "company_name",
    column: "company_name",
    normalize: (v) => trim(v).replace(/\s+/g, " "),
    validate: (v) => v.length >= 2 && v.length <= 200,
  },
  job_title: {
    key: "job_title",
    column: "job_title",
    normalize: (v) => trim(v).replace(/\s+/g, " "),
    validate: (v) => v.length >= 2 && v.length <= 120,
  },
};

export function isBuiltInField(key: string): key is BuiltInContactField {
  return key in BUILT_IN_FIELDS;
}

export function getBuiltInField(key: string): FieldRegistryEntry | null {
  return isBuiltInField(key) ? BUILT_IN_FIELDS[key] : null;
}
