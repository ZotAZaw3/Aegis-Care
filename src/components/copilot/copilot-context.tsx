import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type CopilotContextValue = {
  patientId?: string;
  patientName?: string;
  setPatient: (id: string, name: string) => void;
  clearPatient: () => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  pendingQuery: string | null;
  askQuestion: (text: string) => void;
  consumePendingQuery: () => void;
};

const CopilotCtx = createContext<CopilotContextValue | null>(null);

export function CopilotProvider({ children }: { children: ReactNode }) {
  const [patient, setPatientState] = useState<{ id: string; name: string } | null>(null);
  const [open, setOpen] = useState(false);
  const [pendingQuery, setPendingQuery] = useState<string | null>(null);

  const setPatient = useCallback((id: string, name: string) => {
    setPatientState({ id, name });
  }, []);

  const clearPatient = useCallback(() => {
    setPatientState(null);
  }, []);

  // Opens the copilot panel and queues a query for it to auto-send (e.g. from the dashboard search bar).
  const askQuestion = useCallback((text: string) => {
    setPendingQuery(text);
    setOpen(true);
  }, []);

  const consumePendingQuery = useCallback(() => setPendingQuery(null), []);

  const value = useMemo<CopilotContextValue>(
    () => ({
      patientId: patient?.id,
      patientName: patient?.name,
      setPatient,
      clearPatient,
      open,
      setOpen,
      pendingQuery,
      askQuestion,
      consumePendingQuery,
    }),
    [patient, setPatient, clearPatient, open, pendingQuery, askQuestion, consumePendingQuery],
  );

  return <CopilotCtx.Provider value={value}>{children}</CopilotCtx.Provider>;
}

export function useCopilot() {
  const ctx = useContext(CopilotCtx);
  if (!ctx) throw new Error("useCopilot must be used inside CopilotProvider");
  return ctx;
}
