/**
 * ZENDA CORE ALIGNMENT 01 — Fase 2
 * Normalização canônica de telefone para identidade única de contato.
 *
 * Regras (BR-aware, safe superset):
 *  - Aceita qualquer input com formatação: "(11) 99999-9999", "+55 11 99999-9999", "5511999999999", "+5511999999999"
 *  - Rejeita entradas sem dígitos suficientes ou ambíguas — retorna null (chamador decide fallback)
 *  - Números brasileiros (10-11 dígitos sem DDI) recebem +55
 *  - Números que já começam com "55" e possuem 12-13 dígitos são tratados como BR já com DDI
 *  - Outros números internacionais precisam vir explicitamente com "+" ou serem 8-15 dígitos com DDI plausível
 *
 * NÃO fundir contatos quando a identidade não pode ser determinada com segurança —
 * o caller deve armazenar o telefone bruto em `phone` mesmo quando `toE164()` retorna null.
 */

const BR_DDD_MIN = 11;
const BR_DDD_MAX = 99;

export type CanonicalPhone = string; // formato: +<DDI><DDD><NUM>, sem espaços

/**
 * Normaliza um telefone para E.164 canônico.
 * Retorna null se o número for insuficiente/ambíguo.
 */
export function toE164(input: string | null | undefined): CanonicalPhone | null {
  if (input === null || input === undefined) return null;
  const raw = String(input).trim();
  if (raw.length === 0) return null;

  const hadPlus = raw.startsWith("+");
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 0) return null;

  // Caso 1: input começa com '+' — respeita o DDI dado (mínimo 8 dígitos totais)
  if (hadPlus) {
    if (digits.length < 8 || digits.length > 15) return null;
    if (digits.startsWith("0")) return null;
    return "+" + digits;
  }

  // Caso 2: já começa com 55 e comprimento típico BR (12 ou 13 dígitos)
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    const ddd = Number(digits.slice(2, 4));
    if (ddd >= BR_DDD_MIN && ddd <= BR_DDD_MAX) return "+" + digits;
  }

  // Caso 3: BR sem DDI (10 ou 11 dígitos), primeiro par é DDD válido
  if (digits.length === 10 || digits.length === 11) {
    const ddd = Number(digits.slice(0, 2));
    if (ddd >= BR_DDD_MIN && ddd <= BR_DDD_MAX) return "+55" + digits;
  }

  // Caso 4: número internacional plausível (8-15 dígitos, não inicia por 0),
  // mas SEM prefixo "+" — só aceitamos se for uma sequência longa (>=11) para
  // reduzir risco de tratar um telefone BR incompleto como internacional.
  if (digits.length >= 11 && digits.length <= 15 && !digits.startsWith("0")) {
    return "+" + digits;
  }

  return null;
}

/**
 * True se dois inputs (possivelmente com formatações distintas) representam o mesmo número canônico.
 * Se qualquer um deles não puder ser normalizado, retorna false (nunca fundir com incerteza).
 */
export function isSamePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = toE164(a);
  const nb = toE164(b);
  if (!na || !nb) return false;
  return na === nb;
}
