import { useState, useMemo, useEffect } from "react";
import { Search, History, Smile, ThumbsUp, Heart, Rocket, PartyPopper } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const LOCAL_STORAGE_KEY = "zenda_recent_emojis";
const MAX_RECENTS = 16;

export interface EmojiData {
  emoji: string;
  name: string;
  keywords: string[];
}

export interface EmojiCategory {
  id: string;
  label: string;
  icon: typeof Smile;
  emojis: EmojiData[];
}

export const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    id: "faces",
    label: "Rostos",
    icon: Smile,
    emojis: [
      { emoji: "😀", name: "Rosto sorridente", keywords: ["sorriso", "happy", "feliz", "smile"] },
      { emoji: "😃", name: "Rosto alegre", keywords: ["alegria", "happy", "feliz"] },
      { emoji: "😄", name: "Sorrindo com olhos felizes", keywords: ["rindo", "happy"] },
      { emoji: "😁", name: "Rosto radiante", keywords: ["dentes", "grin"] },
      { emoji: "😅", name: "Suando de rir", keywords: ["suor", "alivio"] },
      { emoji: "😂", name: "Chorando de rir", keywords: ["gargalhada", "lol", "joy"] },
      { emoji: "🤣", name: "Rolando de rir", keywords: ["rofl", "lol", "risada"] },
      { emoji: "😊", name: "Sorriso tímido", keywords: ["corado", "blush"] },
      { emoji: "😇", name: "Anjinho", keywords: ["anjo", "halo"] },
      { emoji: "🙂", name: "Leve sorriso", keywords: ["ok", "normal"] },
      { emoji: "🙃", name: "De ponta-cabeça", keywords: ["sarcasmo", "upside"] },
      { emoji: "😉", name: "Piscadela", keywords: ["piscar", "wink"] },
      { emoji: "😍", name: "Olhos de coração", keywords: ["amor", "love"] },
      { emoji: "🥰", name: "Apaixonado", keywords: ["coracoes", "love"] },
      { emoji: "😘", name: "Mandar beijo", keywords: ["beijo", "kiss"] },
      { emoji: "😋", name: "Saboreando", keywords: ["hum", "delicia", "yum"] },
      { emoji: "😛", name: "Língua para fora", keywords: ["tongue", "brincadeira"] },
      { emoji: "😜", name: "Piscando com língua", keywords: ["zueira", "crazy"] },
      { emoji: "🤪", name: "Maluco", keywords: ["louco", "zany"] },
      { emoji: "😎", name: "Óculos de sol", keywords: ["cool", "estilo", "top"] },
      { emoji: "🤩", name: "Estrelas nos olhos", keywords: ["star", "fã", "incrivel"] },
      { emoji: "🥳", name: "Festeiro", keywords: ["festa", "party", "parabens"] },
      { emoji: "😏", name: "Sorriso maroto", keywords: ["smirk", "deboche"] },
      { emoji: "😒", name: "Descontente", keywords: ["chateado", "unamused"] },
      { emoji: "😔", name: "Pensativo", keywords: ["triste", "sad"] },
      { emoji: "😟", name: "Preocupado", keywords: ["worried", "receio"] },
      { emoji: "😕", name: "Confuso", keywords: ["duvida", "confused"] },
      { emoji: "🙁", name: "Cara triste", keywords: ["slight_frown"] },
      { emoji: "😣", name: "Resistindo", keywords: ["persevering"] },
      { emoji: "😭", name: "Chorando muito", keywords: ["choro", "sob", "triste"] },
      { emoji: "😱", name: "Gritando de medo", keywords: ["susto", "scream", "assustado"] },
      { emoji: "🤯", name: "Mente explodindo", keywords: ["shock", "choque", "caramba"] },
      { emoji: "😳", name: "Envergonhado", keywords: ["vergonha", "blushed"] },
      { emoji: "🤔", name: "Pensando", keywords: ["duvida", "duvidoso", "thinking"] },
      { emoji: "🤗", name: "Abraço", keywords: ["hug", "carinho"] },
      { emoji: "🤫", name: "Segredo", keywords: ["psiu", "shhh", "quiet"] },
      { emoji: "🤐", name: "Boca fechada", keywords: ["zipper", "calado"] },
      { emoji: "😴", name: "Dormindo", keywords: ["sono", "zzz", "sleep"] },
      { emoji: "😷", name: "Máscara", keywords: ["doente", "saude"] },
      { emoji: "😈", name: "Diabinho", keywords: ["devil", "maldade"] },
      { emoji: "💩", name: "Cocozinho", keywords: ["poop", "engracado"] },
      { emoji: "🤖", name: "Robô", keywords: ["robot", "ia", "bot"] },
    ],
  },
  {
    id: "gestures",
    label: "Mãos & Gestos",
    icon: ThumbsUp,
    emojis: [
      { emoji: "👍", name: "Joinha", keywords: ["like", "ok", "concordo", "positivo", "top"] },
      { emoji: "👎", name: "Desjoinha", keywords: ["dislike", "ruim", "negativo"] },
      { emoji: "👏", name: "Palmas", keywords: ["parabens", "clapping", "bravos"] },
      { emoji: "🙌", name: "Mãos para cima", keywords: ["celebracao", "hallelujah"] },
      { emoji: "🤝", name: "Aperto de mão", keywords: ["acordo", "fechado", "negocio", "parceria"] },
      { emoji: "🙏", name: "Mãos postas", keywords: ["por favor", "obrigado", "amem", "rezar", "gratidão"] },
      { emoji: "✌️", name: "Paz e amor", keywords: ["vitoria", "peace"] },
      { emoji: "🤞", name: "Dedos cruzados", keywords: ["sorte", "hope"] },
      { emoji: "🤟", name: "Te amo gestual", keywords: ["love", "rock"] },
      { emoji: "🤘", name: "Rock on", keywords: ["metal", "rock"] },
      { emoji: "👌", name: "Perfeito", keywords: ["ok", "perfeicao"] },
      { emoji: "🤌", name: "Gesto italiano", keywords: ["o que", "calma"] },
      { emoji: "🤏", name: "Um pouquinho", keywords: ["pouco", "small"] },
      { emoji: "👈", name: "Apontar esquerda", keywords: ["point_left"] },
      { emoji: "👉", name: "Apontar direita", keywords: ["point_right"] },
      { emoji: "👆", name: "Apontar cima", keywords: ["point_up"] },
      { emoji: "👇", name: "Apontar baixo", keywords: ["point_down"] },
      { emoji: "✋", name: "Mão levantada", keywords: ["pare", "stop", "highfive"] },
      { emoji: "👋", name: "Acenando", keywords: ["oi", "tchau", "wave", "ola"] },
      { emoji: "💪", name: "Muque / Força", keywords: ["forca", "foco", "biceps", "strong"] },
      { emoji: "🧠", name: "Cérebro", keywords: ["ideia", "brain", "mente"] },
      { emoji: "👀", name: "Olhares", keywords: ["olhando", "atento", "eyes"] },
    ],
  },
  {
    id: "symbols",
    label: "Corações & Símbolos",
    icon: Heart,
    emojis: [
      { emoji: "❤️", name: "Coração vermelho", keywords: ["amor", "love", "heart"] },
      { emoji: "🧡", name: "Coração laranja", keywords: ["orange_heart"] },
      { emoji: "💛", name: "Coração amarelo", keywords: ["yellow_heart"] },
      { emoji: "💚", name: "Coração verde", keywords: ["green_heart"] },
      { emoji: "💙", name: "Coração azul", keywords: ["blue_heart"] },
      { emoji: "💜", name: "Coração roxo", keywords: ["purple_heart"] },
      { emoji: "🖤", name: "Coração preto", keywords: ["black_heart"] },
      { emoji: "🤍", name: "Coração branco", keywords: ["white_heart"] },
      { emoji: "💖", name: "Coração brilhante", keywords: ["sparkling_heart"] },
      { emoji: "💗", name: "Coração crescendo", keywords: ["growing_heart"] },
      { emoji: "💔", name: "Coração partido", keywords: ["broken_heart"] },
      { emoji: "✨", name: "Brilhos / Sparkles", keywords: ["magia", "novidade", "ia", "clean"] },
      { emoji: "🔥", name: "Fogo / Em alta", keywords: ["quente", "fire", "urgente", "booster"] },
      { emoji: "⭐", name: "Estrela", keywords: ["favorito", "star", "destaque"] },
      { emoji: "🌟", name: "Estrela brilhante", keywords: ["star2"] },
      { emoji: "⚡", name: "Raio / Rápido", keywords: ["zap", "fast", "energia"] },
      { emoji: "💥", name: "Explosão", keywords: ["boom", "impacto"] },
      { emoji: "💯", name: "Nota 100", keywords: ["perfeito", "hundred"] },
      { emoji: "✅", name: "Check verde", keywords: ["confirmado", "ok", "concluido", "sucesso"] },
      { emoji: "❌", name: "X vermelho", keywords: ["cancelado", "erro", "nao"] },
      { emoji: "⚠️", name: "Aviso", keywords: ["alerta", "warning", "atencao"] },
      { emoji: "🚫", name: "Proibido", keywords: ["bloqueado", "no"] },
      { emoji: "💬", name: "Balão de conversa", keywords: ["mensagem", "chat"] },
      { emoji: "📌", name: "Pino / Fixar", keywords: ["pin", "importante"] },
    ],
  },
  {
    id: "objects",
    label: "Objetos & Trabalho",
    icon: Rocket,
    emojis: [
      { emoji: "🚀", name: "Foguete / Lançamento", keywords: ["rocket", "crescimento", "decolar", "meta"] },
      { emoji: "📱", name: "Celular", keywords: ["smartphone", "whatsapp", "ligacao"] },
      { emoji: "💻", name: "Notebook", keywords: ["computador", "laptop", "trabalho"] },
      { emoji: "📧", name: "E-mail", keywords: ["email", "mensagem", "carta"] },
      { emoji: "📞", name: "Telefone", keywords: ["chamada", "phone", "ligar"] },
      { emoji: "📅", name: "Calendário", keywords: ["agendamento", "data", "reuniao"] },
      { emoji: "⏰", name: "Despertador", keywords: ["tempo", "hora", "urgente"] },
      { emoji: "📊", name: "Gráfico de barras", keywords: ["relatorio", "metrica", "vendas"] },
      { emoji: "📈", name: "Gráfico ascendente", keywords: ["crescimento", "lucro", "alta"] },
      { emoji: "📉", name: "Gráfico descendente", keywords: ["queda", "baixa"] },
      { emoji: "💰", name: "Saco de dinheiro", keywords: ["vendas", "pix", "pagamento", "financeiro"] },
      { emoji: "💳", name: "Cartão de crédito", keywords: ["cartao", "compra", "checkout"] },
      { emoji: "🧾", name: "Comprovante / Recibo", keywords: ["fatura", "nota", "boleto"] },
      { emoji: "📦", name: "Caixa / Encomenda", keywords: ["produto", "entrega", "envio"] },
      { emoji: "🛒", name: "Carrinho de compras", keywords: ["loja", "ecommerce", "pedido"] },
      { emoji: "🎁", name: "Presente / Bônus", keywords: ["gift", "desconto", "oferta"] },
      { emoji: "🏷️", name: "Etiqueta", keywords: ["tag", "categoria"] },
      { emoji: "🔒", name: "Cadeado fechado", keywords: ["seguranca", "privado"] },
      { emoji: "🔑", name: "Chave", keywords: ["acesso", "key"] },
      { emoji: "💡", name: "Lâmpada / Ideia", keywords: ["idea", "dica", "insights"] },
    ],
  },
  {
    id: "events",
    label: "Festas & Eventos",
    icon: PartyPopper,
    emojis: [
      { emoji: "🎉", name: "Confetes", keywords: ["festa", "celebracao", "parabens", "conquista"] },
      { emoji: "🎊", name: "Bola de confete", keywords: ["confetti"] },
      { emoji: "🎈", name: "Balão", keywords: ["aniversario", "bexiga"] },
      { emoji: "🎂", name: "Bolo de aniversário", keywords: ["cake", "parabens"] },
      { emoji: "☕", name: "Café", keywords: ["cafe", "coffee", "pausa"] },
      { emoji: "🍻", name: "Canecas de cerveja", keywords: ["brinde", "cheers"] },
      { emoji: "🏆", name: "Troféu", keywords: ["campeao", "vencedor", "1lugar"] },
      { emoji: "🥇", name: "Medalha de ouro", keywords: ["gold", "primeiro"] },
      { emoji: "🎯", name: "Alvo / Meta", keywords: ["target", "objetivo", "foco"] },
      { emoji: "🎮", name: "Controle de videogame", keywords: ["game", "jogos"] },
    ],
  },
];

interface EmojiPickerProps {
  onSelectEmoji: (emoji: string) => void;
  trigger?: React.ReactNode;
  align?: "start" | "center" | "end";
  side?: "top" | "bottom" | "left" | "right";
}

function getStoredRecents(): string[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // fallback
  }
  return ["👍", "❤️", "😂", "🚀", "✅", "🙏", "🔥", "✨"];
}

export function EmojiPickerPopover({
  onSelectEmoji,
  trigger,
  align = "start",
  side = "top",
}: EmojiPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<string>("faces");
  const [recents, setRecents] = useState<string[]>(getStoredRecents);

  useEffect(() => {
    if (open) setSearch("");
  }, [open]);

  const handleSelect = (emoji: string) => {
    onSelectEmoji(emoji);
    setRecents((prev) => {
      const next = [emoji, ...prev.filter((e) => e !== emoji)].slice(0, MAX_RECENTS);
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const filteredEmojis = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return null;

    const matched: EmojiData[] = [];
    for (const cat of EMOJI_CATEGORIES) {
      for (const e of cat.emojis) {
        if (
          e.emoji.includes(query) ||
          e.name.toLowerCase().includes(query) ||
          e.keywords.some((k) => k.toLowerCase().includes(query))
        ) {
          matched.push(e);
        }
      }
    }
    return matched;
  }, [search]);

  const activeCategory = useMemo(() => {
    return EMOJI_CATEGORIES.find((c) => c.id === activeTab) ?? EMOJI_CATEGORIES[0];
  }, [activeTab]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger ?? (
          <button
            type="button"
            className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Emoji"
            title="Emoji"
          >
            <Smile className="h-4 w-4" />
          </button>
        )}
      </PopoverTrigger>

      <PopoverContent
        align={align}
        side={side}
        className="w-80 p-2 shadow-xl border border-border/80 bg-popover text-popover-foreground rounded-2xl"
      >
        {/* Search */}
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar emoji (ex: joinha, foguete, coração)…"
            className="w-full rounded-xl border border-input bg-muted/40 py-1.5 pl-8 pr-3 text-xs outline-none focus:border-primary focus:bg-background"
          />
        </div>

        {/* Categories Bar */}
        {!search && (
          <div className="mb-2 flex items-center justify-between border-b border-border/50 pb-1.5 px-0.5">
            <button
              type="button"
              onClick={() => setActiveTab("recents")}
              title="Recentes"
              className={cn(
                "grid h-7 w-7 place-items-center rounded-lg text-xs transition-colors",
                activeTab === "recents"
                  ? "bg-primary/15 text-primary font-bold"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <History className="h-3.5 w-3.5" />
            </button>

            {EMOJI_CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveTab(cat.id)}
                  title={cat.label}
                  className={cn(
                    "grid h-7 w-7 place-items-center rounded-lg text-xs transition-colors",
                    activeTab === cat.id
                      ? "bg-primary/15 text-primary font-bold"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                </button>
              );
            })}
          </div>
        )}

        {/* Emoji Grid */}
        <div className="max-h-56 overflow-y-auto pr-1">
          {search ? (
            filteredEmojis && filteredEmojis.length > 0 ? (
              <div className="grid grid-cols-7 gap-1">
                {filteredEmojis.map((e, idx) => (
                  <button
                    key={`${e.emoji}-${idx}`}
                    type="button"
                    onClick={() => handleSelect(e.emoji)}
                    title={e.name}
                    className="grid h-9 w-9 place-items-center rounded-xl text-xl transition-transform hover:scale-125 hover:bg-accent active:scale-95"
                  >
                    {e.emoji}
                  </button>
                ))}
              </div>
            ) : (
              <p className="py-6 text-center text-xs text-muted-foreground">
                Nenhum emoji encontrado para "{search}".
              </p>
            )
          ) : activeTab === "recents" ? (
            <div>
              <p className="mb-1 text-[11px] font-semibold text-muted-foreground">Recentes</p>
              <div className="grid grid-cols-7 gap-1">
                {recents.map((emoji, idx) => (
                  <button
                    key={`recent-${emoji}-${idx}`}
                    type="button"
                    onClick={() => handleSelect(emoji)}
                    className="grid h-9 w-9 place-items-center rounded-xl text-xl transition-transform hover:scale-125 hover:bg-accent active:scale-95"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <p className="mb-1 text-[11px] font-semibold text-muted-foreground">
                {activeCategory.label}
              </p>
              <div className="grid grid-cols-7 gap-1">
                {activeCategory.emojis.map((e) => (
                  <button
                    key={e.emoji}
                    type="button"
                    onClick={() => handleSelect(e.emoji)}
                    title={e.name}
                    className="grid h-9 w-9 place-items-center rounded-xl text-xl transition-transform hover:scale-125 hover:bg-accent active:scale-95"
                  >
                    {e.emoji}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
