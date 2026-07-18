import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type CopilotContextValue = {
  patientId?: string;
  patientName?: string;
  setPatient: (id: string, name: string) => void;
  clearPatient: () => void;
};

const CopilotCtx = createContext<CopilotContextValue | null>(null);

export function CopilotProvider({ children }: { children: ReactNode }) {
  const [patient, setPatientState] = useState<{ id: string; name: string } | null>(null);

  const setPatient = useCallback((id: string, name: string) => {
    setPatientState({ id, name });
  }, []);

  const clearPatient = useCallback(() => {
    setPatientState(null);
  }, []);

  const value = useMemo<CopilotContextValue>(
    () => ({
      patientId: patient?.id,
      patientName: patient?.name,
      setPatient,
      clearPatient,
    }),
    [patient, setPatient, clearPatient],
  );

  return <CopilotCtx.Provider value={value}>{children}</CopilotCtx.Provider>;
}

export function useCopilot() {
  const ctx = useContext(CopilotCtx);
  if (!ctx) throw new Error("useCopilot must be used inside CopilotProvider");
  return ctx;
}
