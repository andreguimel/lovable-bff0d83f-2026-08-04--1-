/**
 * FB-06 — Cobertura do padrão Block Experience V2 para os 17 blocos.
 *
 * Cada bloco passa pelos mesmos checks:
 *  - registrado com meta completo (label, short, icon, accent, handles);
 *  - `fields[]` declarado;
 *  - `preview()` retorna texto útil quando configurado;
 *  - `validate()` produz mensagem acionável quando incompleto;
 *  - `status()` reporta configured/incomplete/attention/error.
 *
 * Além disso, testa ações CRUD (duplicar, remover, cancelar via
 * `replaceNodeData`) para garantir compatibilidade com a store.
 */
import { describe, it, expect, beforeEach } from "bun:test";
import { blockRegistry } from "../blocks/registry";
import { useBuilderStore } from "../state/store";
import type { FieldSpec, SidebarCtx } from "../fields/types";
import "../blocks/definitions";

const KINDS = [
  "start",
  "end",
  "message",
  "question",
  "send_image",
  "send_audio",
  "send_video",
  "send_document",
  "wait",
  "wait_reply",
  "condition",
  "ai",
  "transfer",
  "assign_agent",
  "tag",
  "http_request",
  "webhook",
] as const;

function reset() {
  useBuilderStore.getState()._reset();
}

const ctx: SidebarCtx = {
  flowId: "f",
  agents: [
    { id: "a1", name: "Suporte", is_active: true },
    { id: "a2", name: "Vendas", is_active: false },
  ],
  channels: [{ id: "c1", name: "WhatsApp Cloud" }],
};

describe("FB-06 · Registry cobre os 17 blocos com padrão V2", () => {
  for (const kind of KINDS) {
    it(`bloco ${kind} está registrado e completo`, () => {
      const def = blockRegistry.get(kind);
      expect(def).toBeDefined();
      const meta = def!.meta;
      expect(typeof meta.label).toBe("string");
      expect(meta.label.length).toBeGreaterThan(0);
      expect(typeof meta.short).toBe("string");
      expect(meta.short.length).toBeGreaterThan(0);
      expect(meta.icon).toBeDefined();
      expect(typeof meta.accent).toBe("string");
      expect(meta.accent).toMatch(/^oklch/);
      expect(meta.handles).toBeDefined();
      expect(Array.isArray((def as { fields?: FieldSpec[] }).fields)).toBe(true);
      expect(typeof def!.status).toBe("function");
    });
  }

  it("todos os blocos declaram meta.hints (arch-ready para IA/library)", () => {
    // start/end são system, mas mesmo eles ganham hints em FB-06
    const missing = KINDS.filter((k) => {
      const def = blockRegistry.get(k);
      return !def?.meta.hints;
    });
    expect(missing).toEqual([]);
  });
});

describe("FB-06 · Preview rico elimina necessidade de abrir o painel", () => {
  beforeEach(reset);

  it("message: mostra o texto entre aspas", () => {
    const def = blockRegistry.get("message")!;
    const p = def.preview!({ body: "Olá {{contact.name}}, tudo bem?" });
    expect(p).toContain("Olá");
    expect(p).toContain("“");
  });

  it("question: mostra 'Pergunta: ...'", () => {
    const def = blockRegistry.get("question")!;
    expect(def.preview!({ body: "Qual é o seu CNPJ?" })).toMatch(/^Pergunta:/);
  });

  it("wait: formata segundos em linguagem humana", () => {
    const def = blockRegistry.get("wait")!;
    expect(def.preview!({ seconds: 5 })).toBe("Aguardar 5 segundos");
    expect(def.preview!({ seconds: 60 })).toBe("Aguardar 1 minuto");
    expect(def.preview!({ seconds: 90 })).toBe("Aguardar 1 minuto 30s");
    expect(def.preview!({ seconds: 0 })).toBeNull();
  });

  it("condition: prefixa com 'Se '", () => {
    const def = blockRegistry.get("condition")!;
    expect(def.preview!({ expression: "contact.tags contém 'VIP'" })).toMatch(/^Se contact/);
  });

  it("http_request: mostra método + host", () => {
    const def = blockRegistry.get("http_request")!;
    expect(def.preview!({ method: "POST", url: "https://api.exemplo.com/leads" }))
      .toBe("POST api.exemplo.com");
  });

  it("webhook: mostra apenas o host", () => {
    const def = blockRegistry.get("webhook")!;
    expect(def.preview!({ url: "https://hooks.zapier.com/x/y" }))
      .toBe("Envia para hooks.zapier.com");
  });

  it("ai: mostra o rótulo do agente quando persistLabelKey preenche", () => {
    const def = blockRegistry.get("ai")!;
    expect(def.preview!({ agent_id: "a1", agent_label: "Suporte" })).toBe("Agente: Suporte");
    expect(def.preview!({ agent_id: "a1" })).toBe("Agente definido");
    expect(def.preview!({})).toBeNull();
  });

  it("assign_agent: mostra responsável definido", () => {
    const def = blockRegistry.get("assign_agent")!;
    expect(def.preview!({ agent_id: "a1", agent_label: "Maria" }))
      .toBe("Responsável: Maria");
  });

  it("tag: mostra #tag", () => {
    const def = blockRegistry.get("tag")!;
    expect(def.preview!({ tag: "VIP" })).toBe("Marca como #VIP");
  });

  it("start/end/wait_reply/transfer: preview padrão explica a ação", () => {
    expect(blockRegistry.get("start")!.preview!({})).toMatch(/partida/i);
    expect(blockRegistry.get("end")!.preview!({})).toMatch(/Fim/);
    expect(blockRegistry.get("wait_reply")!.preview!({})).toMatch(/resposta|responder/i);
    expect(blockRegistry.get("transfer")!.preview!({})).toMatch(/Inbox|humano/i);
  });
});

describe("FB-06 · Validação contextual e acionável", () => {
  it("message vazia: 'Escreva a mensagem…'", () => {
    const r = blockRegistry.get("message")!.validate!({ body: "" });
    expect(r.valid).toBe(false);
    expect(r.issues[0].message).toMatch(/Escreva a mensagem/i);
  });

  it("condition vazia: mensagem contextual (FB-10.5 estruturada ou legado)", () => {
    const r = blockRegistry.get("condition")!.validate!({ expression: "" });
    expect(r.valid).toBe(false);
    expect(r.issues[0].message).toMatch(/condição|campo/i);
  });


  it("webhook sem URL: 'Informe a URL do webhook.'", () => {
    const r = blockRegistry.get("webhook")!.validate!({ url: "" });
    expect(r.issues[0].message).toMatch(/URL do webhook/i);
  });

  it("http_request sem URL: 'Informe a URL do endpoint…'", () => {
    const r = blockRegistry.get("http_request")!.validate!({ method: "GET", url: "" });
    expect(r.issues[0].message).toMatch(/URL/);
  });

  it("wait com 0 segundos: mensagem acionável", () => {
    const r = blockRegistry.get("wait")!.validate!({ seconds: 0 });
    expect(r.valid).toBe(false);
    expect(r.issues[0].message).toMatch(/quantos segundos/i);
  });

  it("ai sem agente: 'Selecione o agente…'", () => {
    const r = blockRegistry.get("ai")!.validate!({});
    expect(r.issues[0].message).toMatch(/Selecione o agente/i);
  });

  it("send_image sem anexo: 'Anexe a imagem…'", () => {
    const r = blockRegistry.get("send_image")!.validate!({});
    expect(r.issues[0].message).toMatch(/Anexe a imagem/i);
  });

  it("tag vazia: reporta warning, não error (bloco permite)", () => {
    const r = blockRegistry.get("tag")!.validate!({ tag: "" });
    expect(r.valid).toBe(true); // warning não invalida
    expect(r.issues[0].severity).toBe("warning");
  });
});

describe("FB-06 · Status agregado (configured/incomplete/attention)", () => {
  it("message: incomplete quando vazio, configured quando preenchido", () => {
    const def = blockRegistry.get("message")!;
    expect(def.status!({ body: "" })).toBe("incomplete");
    expect(def.status!({ body: "olá" })).toBe("configured");
  });

  it("tag: attention quando warning presente", () => {
    const def = blockRegistry.get("tag")!;
    expect(def.status!({ tag: "" })).toBe("attention");
    expect(def.status!({ tag: "VIP" })).toBe("configured");
  });

  it("start: sempre configured (sem validate)", () => {
    expect(blockRegistry.get("start")!.status!({})).toBe("configured");
  });
});

describe("FB-06 · Ações CRUD compatíveis com fluxos existentes", () => {
  beforeEach(reset);

  it("adicionar + duplicar + remover não quebra em nenhum kind", () => {
    for (const kind of KINDS) {
      reset();
      const id = useBuilderStore.getState().addNode(kind, { x: 0, y: 0 });
      expect(useBuilderStore.getState().nodesById[id]).toBeDefined();
      expect(useBuilderStore.getState().nodesById[id].kind).toBe(kind);

      const dup = useBuilderStore.getState().duplicateNode(id);
      // start é único em muitos fluxos — toleramos null OU id
      expect(dup === null || typeof dup === "string").toBe(true);

      useBuilderStore.getState().removeNode(id);
      expect(useBuilderStore.getState().nodesById[id]).toBeUndefined();
    }
  });


  it("cancelar (replaceNodeData) restaura estado inicial de qualquer bloco", () => {
    const s = useBuilderStore.getState();
    const id = s.addNode("http_request", { x: 0, y: 0 });
    const snapshot = JSON.parse(JSON.stringify(useBuilderStore.getState().nodesById[id].data));
    useBuilderStore.getState().updateNodeData(id, { url: "https://x", extra: 1 });
    expect(useBuilderStore.getState().nodesById[id].data.url).toBe("https://x");
    useBuilderStore.getState().replaceNodeData(id, snapshot);
    expect(useBuilderStore.getState().nodesById[id].data.url).toBe(snapshot.url);
    expect(useBuilderStore.getState().nodesById[id].data.extra).toBeUndefined();
  });
});

describe("FB-06 · Compatibilidade com dados legados", () => {
  it("blocos aceitam data sem campos novos (nada quebra)", () => {
    for (const kind of KINDS) {
      const def = blockRegistry.get(kind)!;
      // preview e validate nunca podem lançar em data vazio
      expect(() => def.preview?.({})).not.toThrow();
      expect(() => def.validate?.({})).not.toThrow();
      expect(() => def.status?.({})).not.toThrow();
    }
  });

  it("ai/assign_agent aceitam agent_id antigo sem agent_label (compat)", () => {
    // Fluxos existentes só têm agent_id — preview cai para 'definido'
    expect(blockRegistry.get("ai")!.preview!({ agent_id: "old" })).toBe("Agente definido");
    expect(blockRegistry.get("assign_agent")!.preview!({ agent_id: "old" }))
      .toBe("Responsável definido");
  });
});

describe("FB-06 · Contrato IA-ready (arch-only)", () => {
  it("message e question expõem aiAssist para futura geração", () => {
    expect(blockRegistry.get("message")!.aiAssist?.generateLabel).toBeDefined();
    expect(blockRegistry.get("question")!.aiAssist?.generateLabel).toBeDefined();
  });

  it("aiAssist.explain de message resume a ação em linguagem natural", () => {
    const def = blockRegistry.get("message")!;
    const text = def.aiAssist?.explain?.({ body: "Olá mundo" });
    expect(text).toContain("Olá mundo");
  });
});

// ctx é exportado só para forçar consumo no bundle de teste
export { ctx };
