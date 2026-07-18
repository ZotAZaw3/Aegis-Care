// Trang Trợ lý AI — chat toàn màn hình, tra cứu NHIỀU bệnh nhân một lượt (ghim chip).
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { MessageSquare, RotateCcw, Send, Sparkles } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PageHeader } from "@/components/shared/page-header";
import { CopilotMessage } from "@/components/copilot/copilot-message";
import { PatientPinBar } from "@/components/copilot/patient-pin-bar";
import { useCopilot } from "@/components/copilot/copilot-context";
import { useCopilotChat } from "@/components/copilot/use-copilot-chat";

export const Route = createFileRoute("/_authenticated/assistant")({ component: AssistantPage });

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

function AssistantPage() {
  const { t } = useI18n();
  const { pinnedPatients } = useCopilot();
  const { messages, loading, send, reset } = useCopilotChat(undefined, pinnedPatients);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current?.querySelector(
      "[data-radix-scroll-area-viewport]",
    ) as HTMLElement | null;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  const suggestions = [
    ...(pinnedPatients.length > 1 ? [t("assistant_suggest_compare")] : []),
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

  return (
    <div className="flex h-[calc(100vh-6rem)] flex-col gap-3">
      <PageHeader
        title={t("nav_assistant")}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={reset}
            disabled={loading || messages.length === 0}
          >
            <RotateCcw className="h-4 w-4" />
            {t("copilot_reset")}
          </Button>
        }
      />

      <PatientPinBar />

      <div className="flex min-h-0 flex-1 flex-col rounded-xl border bg-card">
        <ScrollArea ref={scrollRef} className="min-h-0 flex-1">
          <div className="mx-auto flex max-w-3xl flex-col gap-3 p-4">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <MessageSquare className="h-10 w-10 text-muted-foreground/40" />
                <p className="max-w-md text-sm text-muted-foreground">{t("assistant_empty_hint")}</p>
                <div className="flex w-full max-w-md flex-col gap-1.5">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => submit(s)}
                      className="rounded-lg border bg-background px-3 py-2 text-left text-sm text-foreground transition-colors hover:border-primary/50 hover:bg-accent"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m) => <CopilotMessage key={m.id} message={m} />)
            )}
            {loading && <TypingDots />}
          </div>
        </ScrollArea>

        <div className="border-t p-3">
          <div className="mx-auto flex max-w-3xl items-end gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={loading}
              rows={1}
              placeholder={t("assistant_placeholder")}
              aria-label={t("assistant_placeholder")}
              className="max-h-32 min-h-[2.75rem] resize-none text-sm"
            />
            <Button
              size="icon"
              className="h-11 w-11 shrink-0"
              onClick={() => submit(input)}
              disabled={loading || !input.trim()}
              aria-label={t("copilot_send")}
            >
              <Send className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
