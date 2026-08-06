import React from "react";
import { cn } from "@/lib/utils";

// Regex para capturar URLs iniciadas por http://, https:// ou www.
const URL_REGEX = /(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi;

interface Props {
  text: string | null | undefined;
  className?: string;
  linkClassName?: string;
}

export interface TextPart {
  type: "text" | "link";
  content: string;
  href?: string;
}

export function extractTextAndLinks(text: string | null | undefined): TextPart[] {
  if (!text) return [];

  const parts: TextPart[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  URL_REGEX.lastIndex = 0;

  while ((match = URL_REGEX.exec(text)) !== null) {
    const matchText = match[0];
    const matchIndex = match.index;

    if (matchIndex > lastIndex) {
      parts.push({ type: "text", content: text.substring(lastIndex, matchIndex) });
    }

    let cleanUrl = matchText;
    let trailingPunctuation = "";
    while (cleanUrl.length > 0 && /[.,;:!?)\]}$]/.test(cleanUrl[cleanUrl.length - 1])) {
      trailingPunctuation = cleanUrl[cleanUrl.length - 1] + trailingPunctuation;
      cleanUrl = cleanUrl.slice(0, -1);
    }

    if (cleanUrl.length > 0) {
      const href = cleanUrl.toLowerCase().startsWith("www.") ? `https://${cleanUrl}` : cleanUrl;
      parts.push({ type: "link", content: cleanUrl, href });
      if (trailingPunctuation) {
        parts.push({ type: "text", content: trailingPunctuation });
      }
    } else {
      parts.push({ type: "text", content: matchText });
    }

    lastIndex = matchIndex + matchText.length;
  }

  if (lastIndex < text.length) {
    parts.push({ type: "text", content: text.substring(lastIndex) });
  }

  return parts;
}

/**
 * Converte URLs em texto para elementos <a> clicáveis com target="_blank",
 * preservando quebras de linha e aplicando a estilização apropriada.
 */
export function LinkifiedText({ text, className, linkClassName }: Props) {
  if (!text) return null;

  const parts = extractTextAndLinks(text);

  return (
    <span className={cn("whitespace-pre-wrap break-words", className)}>
      {parts.map((part, i) => {
        if (part.type === "link") {
          return (
            <a
              key={`link-${i}`}
              href={part.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className={cn(
                "underline font-medium break-all underline-offset-2 transition-opacity hover:opacity-80",
                linkClassName,
              )}
            >
              {part.content}
            </a>
          );
        }
        return part.content;
      })}
    </span>
  );
}
