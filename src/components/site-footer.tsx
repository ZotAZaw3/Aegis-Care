import { Stethoscope, Phone, Mail, MapPin, Facebook, Youtube, MessageCircle } from "lucide-react";
import { useI18n } from "@/lib/i18n";

const SOCIAL_LINKS = [
  { label: "Facebook", href: "#", icon: Facebook },
  { label: "Zalo", href: "#", icon: MessageCircle },
  { label: "YouTube", href: "#", icon: Youtube },
];

export function SiteFooter() {
  const { t } = useI18n();

  return (
    <footer className="bg-foreground text-background/85">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 font-heading text-base font-bold text-background">
            <Stethoscope className="h-4.5 w-4.5" />
            <span>
              Aegis<span className="text-warning">Care</span>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-background/65">
            <span className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              {t("footer_address")}
            </span>
            <a
              href="tel:19006969"
              className="flex items-center gap-1.5 font-semibold text-background hover:text-warning transition-colors"
            >
              <Phone className="h-3.5 w-3.5 shrink-0" />
              {t("footer_hotline")}
            </a>
            <a
              href="mailto:hotro@aegiscare.vn"
              className="flex items-center gap-1.5 hover:text-background transition-colors"
            >
              <Mail className="h-3.5 w-3.5 shrink-0" />
              {t("footer_email")}
            </a>
          </div>

          <div className="flex items-center gap-2">
            {SOCIAL_LINKS.map((s) => (
              <a
                key={s.label}
                href={s.href}
                aria-label={s.label}
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-background/10 text-background/80 transition-colors hover:bg-background/20 hover:text-background"
              >
                <s.icon className="h-3.5 w-3.5" />
              </a>
            ))}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-background/10 pt-3.5">
          <div className="text-xs text-background/35">
            © {new Date().getFullYear()} <span className="text-background/55">Aegis Care</span>.{" "}
            {t("footer_rights")}
          </div>
          <div className="text-[11px] text-background/25">{t("footer_legal_note")}</div>
        </div>
      </div>
    </footer>
  );
}
