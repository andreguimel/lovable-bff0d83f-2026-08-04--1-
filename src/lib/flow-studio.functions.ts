import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText, NoObjectGeneratedError, Output } from "ai";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { CANONICAL_BLOCK_KINDS } from "@/features/flow-builder/blocks/kinds";

// FB-12.1 — deriva da fonte canônica única de kinds (nunca duplicar a lista).
const VALID_KINDS = CANONICAL_BLOCK_KINDS;

const AI_MODEL = "google/gemini-2.5-flash";

// ---------- Generate flow from natural language ----------
export const generateFlowWithAI = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        prompt: z.string().min(3).max(1500),
        flowId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("IA indisponível — configure LOVABLE_API_KEY.");

    const gateway = createLovableAiGatewayProvider(apiKey);
    const model = gateway(AI_MODEL);

    const NodeSchema = z.object({
      key: z.string(),
      node_type: z.enum(VALID_KINDS),
      label: z.string(),
      body: z.string().nullable(),
      expression: z.string().nullable(),
      seconds: z.number().nullable(),
      tag: z.string().nullable(),
    });
    const EdgeSchema = z.object({
      from: z.string(),
      to: z.string(),
      handle: z.string().nullable(),
      label: z.string().nullable(),
    });
    const Schema = z.object({
      nodes: z.array(NodeSchema).min(2).max(30),
      edges: z.array(EdgeSchema).min(1).max(60),
    });

    const system = `Você é um arquiteto de fluxos de automação para atendimento e vendas via WhatsApp.
Gere um fluxo COMPLETO com nós e conexões seguindo estas regras:
- Sempre inclua exatamente 1 nó "start" e ao menos 1 "end".
- Use "message" para textos, "question" para perguntas, "wait_reply" para pausar esperando resposta.
- Use "condition" para decisões (o body vai em "expression" — ex: "resposta contains 'sim'"). Depois disso, crie 2 arestas com handle "true" e "false".
- Use "ai" quando precisar de resposta gerada por IA, "transfer" para humanos, "tag" para marcar contato.
- IDs de nó ("key") devem ser strings curtas ("s", "m1", "q1", etc.), únicos e referenciados nas arestas.
- Escreva mensagens em português brasileiro, tom profissional e amigável, com variáveis como {{contact.name}} quando fizer sentido.
- Máx 15 nós. Fluxo linear a menos que haja decisão.`;

    try {
      const result = await generateText({
        model,
        system,
        prompt: `Objetivo do fluxo: ${data.prompt}\n\nRetorne um JSON válido com "nodes" e "edges".`,
        output: Output.object({ schema: Schema }),
      });
      const parsed = result.output;

      const idMap = new Map<string, string>();
      for (const n of parsed.nodes) idMap.set(n.key, crypto.randomUUID());

      let x = 0;
      const positioned = parsed.nodes.map((n, i) => ({
        id: idMap.get(n.key)!,
        node_type: n.node_type,
        position: { x: (x = i * 260), y: 0 },
        data: cleanData(n),
      }));

      const edges = parsed.edges
        .filter((e) => idMap.has(e.from) && idMap.has(e.to))
        .map((e) => ({
          id: crypto.randomUUID(),
          source_node_id: idMap.get(e.from)!,
          target_node_id: idMap.get(e.to)!,
          source_handle: e.handle ?? null,
          label: e.label ?? null,
        }));

      return { nodes: positioned, edges };
    } catch (err) {
      if (NoObjectGeneratedError.isInstance(err)) {
        throw new Error("A IA não conseguiu estruturar um fluxo válido. Tente reformular.");
      }
      throw err;
    }
  });

function cleanData(n: {
  label: string;
  body: string | null;
  expression: string | null;
  seconds: number | null;
  tag: string | null;
}): Record<string, string | number> {
  const d: Record<string, string | number> = { label: n.label };
  if (n.body) d.body = n.body;
  if (n.expression) d.expression = n.expression;
  if (typeof n.seconds === "number") d.seconds = n.seconds;
  if (n.tag) d.tag = n.tag;
  return d;
}

// ---------- Copilot free-form actions ----------
const CopilotAction = z.enum(["improve", "loops", "optimize", "document"]);

export const runFlowCopilotAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        action: CopilotAction,
        context: z.string().max(6000),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("IA indisponível — configure LOVABLE_API_KEY.");
    const gateway = createLovableAiGatewayProvider(apiKey);
    const model = gateway(AI_MODEL);

    const brief = {
      improve:
        "Você é um consultor de fluxos de automação. Analise a estrutura abaixo e sugira 5 melhorias objetivas (UX, redação, conversão). Bullets curtos, em português.",
      loops:
        "Analise se há loops, nós órfãos ou caminhos sem saída no fluxo abaixo. Liste os problemas encontrados e como corrigi-los. Português, direto.",
      optimize:
        "Sugira como reduzir passos, tempo de execução e uso de IA no fluxo abaixo, mantendo o resultado. Bullets curtos.",
      document:
        "Gere uma documentação clara e estruturada em markdown do fluxo abaixo (objetivo, gatilho, principais caminhos, saídas). Português.",
    }[data.action];

    const result = await generateText({
      model,
      system: brief,
      prompt: `Estrutura do fluxo:\n${data.context || "(vazio)"}`,
    });
    return { output: result.text };
  });
