import { useI18n } from "@/lib/i18n";

export function LanguageToggle() {
  const { lang, setLang } = useI18n();
  return (
    <div className="inline-flex rounded-md border overflow-hidden text-xs">
      <button
        className={`px-3 py-1 ${lang === "vi" ? "bg-primary text-primary-foreground" : "bg-background"}`}
        onClick={() => setLang("vi")}
        type="button"
      >
        VI
      </button>
      <button
        className={`px-3 py-1 ${lang === "en" ? "bg-primary text-primary-foreground" : "bg-background"}`}
        onClick={() => setLang("en")}
        type="button"
      >
        EN
      </button>
    </div>
  );
}