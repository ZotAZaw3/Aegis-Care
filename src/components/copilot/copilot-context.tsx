import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type PinnedPatient = { id: string; name: string };

type CopilotContextValue = {
  patientId?: string;
  patientName?: string;
  setPatient: (id: string, name: string) => void;
  clearPatient: () => void;
  // Ghim nhiều BN cho trang Trợ lý (tra cứu nhiều người 1 lượt).
  pinnedPatients: PinnedPatient[];
  addPinned: (id: string, name: string) => void;
  removePinned: (id: string) => void;
  clearPinned: () => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  pendingQuery: string | null;
  askQuestion: (text: string) => void;
  consumePendingQuery: () => void;
};

const CopilotCtx = createContext<CopilotContextValue | null>(null);

export function CopilotProvider({ children }: { children: ReactNode }) {
  const [patient, setPatientState] = useState<{ id: string; name: string } | null>(null);
  const [pinnedPatients, setPinned] = useState<PinnedPatient[]>([]);
  const [open, setOpen] = useState(false);
  const [pendingQuery, setPendingQuery] = useState<string | null>(null);

  const setPatient = useCallback((id: string, name: string) => {
    setPatientState({ id, name });
  }, []);

  const clearPatient = useCallback(() => {
    setPatientState(null);
  }, []);

  const addPinned = useCallback((id: string, name: string) => {
    setPinned((prev) => (prev.some((p) => p.id === id) ? prev : [...prev, { id, name }]));
  }, []);
  const removePinned = useCallback((id: string) => {
    setPinned((prev) => prev.filter((p) => p.id !== id));
  }, []);
  const clearPinned = useCallback(() => setPinned([]), []);

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
      pinnedPatients,
      addPinned,
      removePinned,
      clearPinned,
      open,
      setOpen,
      pendingQuery,
      askQuestion,
      consumePendingQuery,
    }),
    [patient, setPatient, clearPatient, pinnedPatients, addPinned, removePinned, clearPinned, open, pendingQuery, askQuestion, consumePendingQuery],
  );

  return <CopilotCtx.Provider value={value}>{children}</CopilotCtx.Provider>;
}

export function useCopilot() {
  const ctx = useContext(CopilotCtx);
  if (!ctx) throw new Error("useCopilot must be used inside CopilotProvider");
  return ctx;
}
