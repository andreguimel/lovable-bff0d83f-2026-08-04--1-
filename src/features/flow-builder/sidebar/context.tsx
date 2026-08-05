/**
 * FB-04 — Contexto do SmartSidebar.
 *
 * Provê dados externos (agentes, canais, flowId) para os campos
 * declarativos sem prop-drilling. Usado exclusivamente dentro do
 * SmartSidebar; qualquer novo campo que precise de um recurso
 * externo passa a consumi-lo daqui.
 */
import { createContext, useContext, type ReactNode } from "react";
import type { SidebarCtx } from "../fields/types";

const Ctx = createContext<SidebarCtx | null>(null);

export function SmartSidebarProvider({
  value,
  children,
}: {
  value: SidebarCtx;
  children: ReactNode;
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSidebarCtx(): SidebarCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("SmartSidebar: contexto não encontrado.");
  return v;
}
