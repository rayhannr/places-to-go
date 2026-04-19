"use client";

import { useChat } from "@ai-sdk/react";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { DefaultChatTransport } from "ai";
import {
  Send,
  ChefHat,
  Bot,
  User,
  List,
  Plus,
  Loader2,
  MapPin,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

// ─── Types ──────────────────────────────────────────────────────────────────
type ToolPart = {
  type: string;
  state: string;
  output?: { length?: number; entry?: { name?: string } } | null;
};

type MessagePart =
  | { type: "text"; text: string }
  | ToolPart;

type Message = {
  id: string;
  role: "user" | "assistant";
  parts?: MessagePart[];
  content?: string;
};

// ─── Quick actions ───────────────────────────────────────────────────────────
const QUICK_ACTIONS = [
  {
    id: "recommend",
    label: "Show me some recommendations",
    icon: List,
    color: "text-blue-400",
  },
  {
    id: "add",
    label: "I want to add a new place",
    icon: Plus,
    color: "text-violet-400",
  },
  {
    id: "nearby",
    label: "What's nearby Sleman?",
    icon: MapPin,
    color: "text-cyan-400",
  },
];

// ─── Tool part renderer ──────────────────────────────────────────────────────
function ToolPartView({ part }: { part: ToolPart }) {
  const toolName = part.type.replace("tool-", "");
  const isRecommend = toolName === "recommend_place";

  if (part.state === "input-streaming" || part.state === "input-available") {
    return (
      <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-black/30 border border-white/5 animate-fade-up">
        <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400 shrink-0" />
        <span className="text-xs text-zinc-400">
          {isRecommend ? "Fetching your places…" : "Adding place to tracker…"}
        </span>
      </div>
    );
  }

  if (part.state === "output-available") {
    const count = (part.output as { length?: number } | undefined)?.length;
    const name = (part.output as { entry?: { name?: string } } | undefined)?.entry?.name;
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 animate-fade-up">
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        <span className="text-xs text-emerald-300">
          {isRecommend
            ? `Found ${count ?? 0} place${count !== 1 ? "s" : ""}`
            : `Added "${name ?? "place"}" successfully`}
        </span>
      </div>
    );
  }

  return null;
}

// ─── Message bubble ──────────────────────────────────────────────────────────
function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";

  return (
    <div
      className={`flex flex-col gap-1.5 animate-fade-up ${isUser ? "items-end" : "items-start"}`}
    >
      {/* Role label */}
      <div className={`flex items-center gap-1.5 opacity-40 ${isUser ? "flex-row-reverse" : ""}`}>
        {isUser ? <User size={11} /> : <Bot size={11} />}
        <span className="text-[10px] uppercase font-semibold tracking-widest">
          {isUser ? "You" : "Assistant"}
        </span>
      </div>

      {/* Bubble */}
      <div
        className={`max-w-[88%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
          isUser
            ? "bg-blue-600/20 border border-blue-500/30 text-blue-50 rounded-tr-none"
            : "glass text-zinc-100 rounded-tl-none"
        }`}
      >
        <div className="flex flex-col gap-2">
          {message.parts ? (
            message.parts.map((part, i) => {
              if (part.type === "text") {
                return (
                  <div key={i} className="markdown">
                    <ReactMarkdown remarkPlugins={[remarkGfm as any]}>
                      {(part as { type: "text"; text: string }).text}
                    </ReactMarkdown>
                  </div>
                );
              }
              if (part.type.startsWith("tool-")) {
                return <ToolPartView key={i} part={part as ToolPart} />;
              }
              return null;
            })
          ) : (
            <div className="markdown">
              <ReactMarkdown remarkPlugins={[remarkGfm as any]}>
                {message.content ?? ""}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Typing indicator ────────────────────────────────────────────────────────
function TypingIndicator() {
  return (
    <div className="flex flex-col items-start gap-1.5 animate-fade-up">
      <div className="flex items-center gap-1.5 opacity-40">
        <Bot size={11} />
        <span className="text-[10px] uppercase font-semibold tracking-widest animate-blink text-blue-400">
          Thinking…
        </span>
      </div>
      <div className="glass px-5 py-3.5 rounded-2xl rounded-tl-none">
        <div className="flex gap-1.5 items-center">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400/70 animate-blink [animation-delay:0ms]" />
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400/70 animate-blink [animation-delay:200ms]" />
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400/70 animate-blink [animation-delay:400ms]" />
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function ChatPage() {
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });

  const isLoading = status !== "ready" && status !== "error";

  const typedMessages = messages as Message[];

  const submit = (text?: string) => {
    const value = (text ?? draft).trim();
    if (!value || isLoading) return;
    sendMessage({ text: value });
    setDraft("");
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const showTyping = isLoading && status !== "streaming";

  return (
    <main className="flex flex-col h-screen max-w-2xl mx-auto w-full px-4 py-5 md:px-6 md:py-6">

      {/* ── Header ── */}
      <header className="flex items-center justify-between mb-6 animate-fade-up shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl glass flex items-center justify-center glow-primary">
            <ChefHat className="text-blue-400 w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">Places To Go</h1>
            <p className="text-[11px] text-zinc-500 font-medium">Mistral AI · Food Tracker</p>
          </div>
        </div>
        <Badge
          variant="outline"
          className="text-[10px] uppercase tracking-widest border-cyan-500/30 text-cyan-400 bg-cyan-500/5 px-2.5 py-1"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 mr-1.5 animate-blink inline-block" />
          Live
        </Badge>
      </header>

      {/* ── Messages ── */}
      <ScrollArea className="flex-1 mb-4 pr-1">
        <div className="flex flex-col gap-5 pb-2">

          {/* Empty state */}
          {typedMessages.length === 0 && (
            <div className="flex flex-col items-center justify-center min-h-[50vh] text-center px-6 animate-fade-up">
              <div className="w-14 h-14 rounded-2xl glass flex items-center justify-center mb-4 glow-primary">
                <Sparkles className="w-7 h-7 text-blue-400" />
              </div>
              <h2 className="text-lg font-semibold mb-1">How can I help?</h2>
              <p className="text-sm text-zinc-500 max-w-xs mb-8">
                Ask me for food recommendations or add a new place to your tracker.
              </p>

              <div className="flex flex-col gap-2 w-full max-w-xs">
                {QUICK_ACTIONS.map(({ id, label, icon: Icon, color }) => (
                  <Button
                    key={id}
                    variant="outline"
                    onClick={() => submit(label)}
                    disabled={isLoading}
                    className="justify-start gap-2.5 h-auto py-3 px-4 text-xs glass border-white/8 hover:border-blue-500/40 hover:bg-blue-500/5 transition-all cursor-pointer"
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${color}`} />
                    <span className="text-left text-zinc-300">{label}</span>
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Message list */}
          {typedMessages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}

          {/* Typing indicator */}
          {showTyping && <TypingIndicator />}

          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* ── Input bar ── */}
      <form
        id="chat-form"
        onSubmit={(e) => { e.preventDefault(); submit(); }}
        className="relative flex items-center gap-2 shrink-0 animate-fade-up"
      >
        <Input
          id="chat-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          autoFocus
          placeholder="Ask about your favorite places…"
          disabled={isLoading}
          className="flex-1 glass border-white/8 text-sm placeholder:text-zinc-600 focus-visible:ring-blue-500/50 focus-visible:border-blue-500/40 rounded-xl h-12 px-4 transition-all"
        />
        <Button
          id="chat-submit"
          type="submit"
          size="icon"
          disabled={isLoading || !draft.trim()}
          className="h-12 w-12 rounded-xl bg-blue-600 hover:bg-blue-500 glow-primary disabled:opacity-40 disabled:grayscale shrink-0 active:scale-95 transition-all cursor-pointer"
        >
          {isLoading ? (
            <Loader2 className="w-4.5 h-4.5 animate-spin" />
          ) : (
            <Send className="w-4.5 h-4.5" />
          )}
        </Button>
      </form>

      <p className="text-[10px] text-center mt-3 text-zinc-700 uppercase tracking-[0.2em] shrink-0">
        Powered by Mistral AI
      </p>
    </main>
  );
}
