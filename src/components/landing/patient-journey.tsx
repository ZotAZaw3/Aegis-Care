import { Link } from "@tanstack/react-router";
import {
  UserPlus,
  FolderHeart,
  ClipboardList,
  Radar,
  PhoneCall,
  ShieldCheck,
  ChevronRight,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent } from "@/components/ui/card";

interface Step {
  numKey: string;
  titleKey: string;
  icon: LucideIcon;
  chipKeys: string[];
  href: string;
  core?: boolean;
}

const STEPS: Step[] = [
  { numKey: "journey_step1_num", titleKey: "journey_step1_title", icon: UserPlus, href: "/reception", chipKeys: ["journey_s1_c1", "journey_s1_c2", "journey_s1_c3", "journey_s1_c4"] },
  { numKey: "journey_step2_num", titleKey: "journey_step2_title", icon: FolderHeart, href: "/patients", chipKeys: ["journey_s2_c1", "journey_s2_c2", "journey_s2_c3", "journey_s2_c4"] },
  { numKey: "journey_step3_num", titleKey: "journey_step3_title", icon: ClipboardList, href: "/dashboard", core: true, chipKeys: ["journey_s3_c1", "journey_s3_c2", "journey_s3_c3", "journey_s3_c4"] },
  { numKey: "journey_step4_num", titleKey: "journey_step4_title", icon: Radar, href: "/dashboard", chipKeys: ["journey_s4_c1", "journey_s4_c2"] },
  { numKey: "journey_step5_num", titleKey: "journey_step5_title", icon: PhoneCall, href: "/follow-ups", chipKeys: ["journey_s5_c1", "journey_s5_c2"] },
  { numKey: "journey_step6_num", titleKey: "journey_step6_title", icon: ShieldCheck, href: "/admin", chipKeys: ["journey_s6_c1", "journey_s6_c2"] },
];

export function PatientJourney() {
  const { t } = useI18n();

  return (
    <section className="border-t bg-muted/30 px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto mb-10 max-w-xl text-center">
          <span className="mb-3 inline-flex items-center rounded-full border bg-background px-3 py-1 text-xs font-semibold text-primary">
            {t("journey_tag")}
          </span>
          <h2 className="font-heading text-2xl font-semibold leading-tight text-foreground sm:text-3xl">
            {t("journey_headline")}
          </h2>
          <p className="mt-3 text-sm text-muted-foreground">{t("journey_sub")}</p>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch">
          {STEPS.map((step, i) => (
            <div key={step.numKey} className="flex flex-1 items-stretch gap-3 lg:flex-row">
              <Link to={step.href as any} className="flex-1">
                <Card
                  className={
                    step.core
                      ? "h-full border-none bg-primary text-primary-foreground transition-opacity hover:opacity-90"
                      : "h-full transition-colors hover:border-primary"
                  }
                >
                  <CardContent className="flex h-full flex-col gap-3 p-4">
                    <div
                      className={
                        step.core
                          ? "text-[11px] font-semibold uppercase tracking-wide text-primary-foreground/70"
                          : "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                      }
                    >
                      {t(step.numKey)}
                    </div>
                    <step.icon className="h-6 w-6 shrink-0" />
                    <div className="font-heading text-sm font-semibold">{t(step.titleKey)}</div>
                    <ul className="space-y-1.5">
                      {step.chipKeys.map((ck) => (
                        <li
                          key={ck}
                          className={
                            step.core
                              ? "text-xs leading-snug text-primary-foreground/85"
                              : "text-xs leading-snug text-muted-foreground"
                          }
                        >
                          {t(ck)}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </Link>
              {i < STEPS.length - 1 && (
                <div className="hidden shrink-0 items-center text-muted-foreground/50 lg:flex">
                  <ChevronRight className="h-5 w-5" />
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-8 text-center">
          <Link
            to="/auth"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
          >
            {t("footer_cta")} <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}
