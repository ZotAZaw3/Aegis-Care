import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { MessageSquare, RotateCcw, Send, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useCopilot } from "./copilot-context";
import { useCopilotChat } from "./use-copilot-chat";
import { CopilotMessage } from "./copilot-message";

function TypingDots() {
  return (
    <div className="flex justify-start" aria-live="polite">
      <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-muted px-3 py-2.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  );
}

export function CopilotChat() {
  const { t } = useI18n();
  const { patientId, patientName, clearPatient, open, setOpen, pendingQuery, consumePendingQuery } = useCopilot();
  const { messages, loading, send, reset } = useCopilotChat(patientId);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current?.querySelector(
      "[data-radix-scroll-area-viewport]",
    ) as HTMLElement | null;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading, open]);

  // Auto-send a query queued from outside (e.g. the dashboard search bar via askQuestion).
  useEffect(() => {
    if (!pendingQuery || !open) return;
    void send(pendingQuery);
    consumePendingQuery();
  }, [pendingQuery, open, send, consumePendingQuery]);

  const suggestions = [
    ...(patientId ? [t("copilot_suggest_patient")] : []),
    t("copilot_suggest_consent"),
    t("copilot_suggest_pending"),
  ];

  const submit = (text: string) => {
    if (!text.trim() || loading) return;
    void send(text);
    setInput("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit(input);
    }
  };

  if (!open) {
    return (
      <Button
        onClick={() => setOpen(true)}
        aria-label={t("copilot_title")}
        className="fixed bottom-5 right-5 z-50 h-14 w-14 rounded-full shadow-lg"
        size="icon"
      >
        <Sparkles className="h-6 w-6" />
      </Button>
    );
  }

  return (
    <div
      role="dialog"
      aria-label={t("copilot_title")}
      className="fixed inset-0 z-50 flex flex-col border bg-background shadow-2xl sm:inset-auto sm:bottom-5 sm:right-5 sm:h-[600px] sm:max-h-[calc(100vh-2.5rem)] sm:w-[380px] sm:rounded-xl"
    >
      <header className="flex items-center justify-between gap-2 border-b px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Sparkles className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate text-sm font-semibold">{t("copilot_title")}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={reset}
            disabled={loading || messages.length === 0}
            aria-label={t("copilot_reset")}
            title={t("copilot_reset")}
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setOpen(false)}
            aria-label={t("close")}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {patientName && (
        <div className="flex items-center gap-1.5 border-b bg-muted/40 px-3 py-1.5 text-xs">
          <span className="truncate text-muted-foreground">
            {t("copilot_viewing")}: <span className="font-medium text-foreground">{patientName}</span>
          </span>
          <button
            type="button"
            onClick={clearPatient}
            aria-label={t("copilot_clear_patient")}
            className="ml-auto rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <ScrollArea ref={scrollRef} className="flex-1 min-h-0">
        <div className="flex flex-col gap-3 p-3">
          {messages.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <MessageSquare className="h-8 w-8 text-muted-foreground/50" />
              <p className="text-xs text-muted-foreground">{t("copilot_empty_hint")}</p>
              <div className="flex w-full flex-col gap-1.5">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => submit(s)}
                    className="rounded-lg border bg-card px-3 py-2 text-left text-xs text-foreground transition-colors hover:border-primary/50 hover:bg-accent"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m) => (
            <CopilotMessage key={m.id} message={m} />
          ))}
          {loading && <TypingDots />}
        </div>
      </ScrollArea>

      <div className="border-t p-2">
        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={loading}
            rows={1}
            placeholder={t("copilot_placeholder")}
            aria-label={t("copilot_placeholder")}
            className="max-h-28 min-h-[2.5rem] resize-none text-sm"
          />
          <Button
            size="icon"
            className="h-10 w-10 shrink-0"
            onClick={() => submit(input)}
            disabled={loading || !input.trim()}
            aria-label={t("copilot_send")}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
