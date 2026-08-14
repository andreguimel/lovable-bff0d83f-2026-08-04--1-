import { describe, expect, it } from "vitest";
import { z } from "zod";

const UpsertSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, "Nome obrigatório"),
  role: z.string().nullish(),
  department: z.string().nullish(),
  specialty: z.string().nullish(),
  prompt: z.string().nullish(),
  personality: z.string().nullish(),
  greeting: z.string().nullish(),
  model: z.string().min(1),
  temperature: z.number().min(0).max(2),
  language: z.string().min(2),
  channel_ids: z.array(z.string().uuid()).default([]),
  enabled_tools: z.array(z.string()).default([]),
  max_turns: z.number().int().min(1).max(20).default(6),
  is_active: z.boolean().default(true),
  avatar_url: z.string().url().nullish(),
  top_p: z.number().min(0).max(1).nullish(),
  max_tokens: z.number().int().positive().nullish(),
  frequency_penalty: z.number().min(-2).max(2).nullish(),
  presence_penalty: z.number().min(-2).max(2).nullish(),
  status: z.string().nullish(),
  version: z.number().int().nullish(),
});

describe("Agent Identity Persistence Schema", () => {
  it("preserves department and specialty fields during upsert validation", () => {
    const input = {
      name: "Agente Comercial",
      role: "SDR Outbound",
      department: "Vendas",
      specialty: "Qualificação de Leads B2B",
      model: "google/gemini-2.5-flash",
      temperature: 0.7,
      language: "pt-BR",
      top_p: 0.9,
      max_tokens: 2048,
      frequency_penalty: 0.5,
      presence_penalty: 0.2,
    };

    const validated = UpsertSchema.parse(input);
    expect(validated.department).toBe("Vendas");
    expect(validated.specialty).toBe("Qualificação de Leads B2B");
    expect(validated.top_p).toBe(0.9);
    expect(validated.max_tokens).toBe(2048);
    expect(validated.frequency_penalty).toBe(0.5);
    expect(validated.presence_penalty).toBe(0.2);
  });
});
