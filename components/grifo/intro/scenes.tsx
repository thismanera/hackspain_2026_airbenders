import {
  ArrowLeftRight,
  Building2,
  CalendarDays,
  ChevronRight,
  Clock,
  Coins,
  Gauge,
  HandCoins,
  Landmark,
  ListTree,
  Lock,
  Network,
  Receipt,
  TrendingDown,
  TrendingUp,
  Truck,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/core/utils";

/** Palabras que llevan el peso de la frase. Un solo acento por pantalla. */
function Accent({ children }: { children: ReactNode }) {
  return <span className="text-status-healthy-fg">{children}</span>;
}

function BigNumber({ value, caption }: { value: string; caption: string }) {
  return (
    <div className="intro-rise mt-10 [animation-delay:200ms]">
      <p className="text-6xl leading-none font-semibold tracking-[-0.04em] tabular-nums sm:text-7xl">
        {value}
      </p>
      <p className="text-muted-foreground mt-3 text-base text-balance">{caption}</p>
    </div>
  );
}

function Tile({
  icon: Icon,
  tone = "neutral",
  className,
}: {
  icon: LucideIcon;
  tone?: "neutral" | "healthy" | "watch" | "ink";
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-lg border",
        tone === "neutral" && "bg-muted text-foreground",
        tone === "healthy" && "bg-status-healthy-surface text-status-healthy-fg border-transparent",
        tone === "watch" && "bg-status-watch-surface text-status-watch-fg border-transparent",
        tone === "ink" && "bg-primary text-primary-foreground border-transparent",
        className,
      )}
    >
      <Icon className="size-4" strokeWidth={2} />
    </span>
  );
}

/* 1 · El problema: el hueco entre pagar y cobrar. */
function CashGap() {
  const stops = [
    { icon: Truck, label: "Paga al proveedor", day: "Día 0" },
    { icon: Clock, label: "Espera", day: "30 días" },
    { icon: Clock, label: "Sigue esperando", day: "60 días" },
    { icon: Coins, label: "El cliente paga", day: "90 días" },
  ];
  return (
    <>
      <BigNumber
        value="90 días"
        caption="pasan entre pagar a sus proveedores y cobrar de sus clientes"
      />
      <ol className="intro-rise mt-10 grid grid-cols-4 gap-2 text-left [animation-delay:360ms]">
        {stops.map((stop, index) => (
          <li key={stop.label} className="relative flex flex-col items-center gap-2 text-center">
            {index < stops.length - 1 ? (
              <span
                aria-hidden
                className="bg-border absolute top-[18px] left-1/2 h-px w-full [transform:translateX(18px)]"
              />
            ) : null}
            <Tile
              icon={stop.icon}
              tone={index === 0 || index === stops.length - 1 ? "ink" : "neutral"}
              className="relative"
            />
            <span className="text-xs font-medium tabular-nums">{stop.day}</span>
            <span className="text-muted-foreground text-xs">{stop.label}</span>
          </li>
        ))}
      </ol>
    </>
  );
}

/* 2 · Hoy: doce meses, uno mirado. */
function OnceAYear() {
  return (
    <>
      <BigNumber
        value="1 vez al año"
        caption="se revisa el crédito, aunque el negocio cambie cada mes"
      />
      <div className="intro-rise mt-10 flex flex-col items-center gap-3 [animation-delay:360ms]">
        <ol className="grid grid-cols-12 gap-1.5" aria-label="Doce meses, uno revisado">
          {Array.from({ length: 12 }, (_, index) => (
            <li
              key={index}
              className={cn(
                "flex size-8 items-center justify-center rounded-md border sm:size-10",
                index === 0
                  ? "bg-primary text-primary-foreground border-transparent"
                  : "bg-card text-muted-foreground",
              )}
            >
              {index === 0 ? <CalendarDays aria-hidden className="size-4" /> : null}
            </li>
          ))}
        </ol>
        <p className="text-muted-foreground text-xs">Un mes con foto. Once sin mirar.</p>
      </div>
    </>
  );
}

/* 3 · Qué es Embat: todas las fuentes en un sitio. */
function EmbatCore() {
  const left = [
    { icon: Landmark, label: "Banco A" },
    { icon: Landmark, label: "Banco B" },
    { icon: Landmark, label: "Banco C" },
  ];
  const right = [
    { icon: Receipt, label: "Facturas" },
    { icon: ArrowLeftRight, label: "Cobros y pagos" },
    { icon: Network, label: "Empresas del grupo" },
  ];
  const Column = ({ items, side }: { items: typeof left; side: "l" | "r" }) => (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li
          key={item.label}
          className={cn(
            "bg-card flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
            side === "r" && "flex-row-reverse text-right",
          )}
        >
          <item.icon aria-hidden className="text-muted-foreground size-4 shrink-0" />
          {item.label}
        </li>
      ))}
    </ul>
  );
  return (
    <>
      <p className="text-muted-foreground intro-rise mt-4 text-base text-balance [animation-delay:200ms]">
        Su tesorería al día: cada movimiento de sus cuentas bancarias y cada factura.
      </p>
      <div className="intro-rise mt-10 grid grid-cols-[1fr_auto_1fr] items-center gap-3 [animation-delay:360ms] sm:gap-6">
        <Column items={left} side="l" />
        <div className="flex items-center gap-2 sm:gap-4">
          <span aria-hidden className="bg-border h-px w-4 sm:w-8" />
          <span className="bg-primary text-primary-foreground flex size-16 flex-col items-center justify-center rounded-2xl text-sm font-semibold">
            <Building2 aria-hidden className="size-5" />
            Embat
          </span>
          <span aria-hidden className="bg-border h-px w-4 sm:w-8" />
        </div>
        <Column items={right} side="r" />
      </div>
      <p className="text-muted-foreground intro-rise mt-6 text-sm [animation-delay:520ms]">
        Un banco solo ve su cuenta. Embat ve la empresa completa.
      </p>
    </>
  );
}

/* 4 · La idea: una nota, y de la nota una oferta. */
function ScoreIdea() {
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <div className="intro-rise mt-10 flex flex-col items-center gap-8 [animation-delay:200ms] sm:flex-row sm:justify-center sm:gap-12 sm:text-left">
      <div className="relative size-36 shrink-0">
        <svg viewBox="0 0 120 120" className="size-full -rotate-90">
          <circle cx="60" cy="60" r={r} fill="none" stroke="var(--border)" strokeWidth="6" />
          <circle
            cx="60"
            cy="60"
            r={r}
            fill="none"
            stroke="var(--status-healthy)"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - 0.82)}
            className="intro-arc"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-4xl font-semibold tracking-[-0.03em] tabular-nums">
          82<span className="text-muted-foreground ml-0.5 text-base font-normal">/100</span>
        </span>
      </div>
      <div className="max-w-sm">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Salud financiera
        </p>
        <p className="mt-1 text-lg font-semibold tracking-[-0.01em]">
          Una nota de 0 a 100, siempre explicada
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          Y de la nota sale una oferta de financiación:
        </p>
        <ul className="mt-3 flex flex-wrap gap-2 text-sm">
          {[
            { icon: Coins, label: "Cuánto" },
            { icon: CalendarDays, label: "A qué plazo" },
            { icon: Gauge, label: "A qué precio" },
          ].map((chip) => (
            <li
              key={chip.label}
              className="bg-card flex items-center gap-1.5 rounded-md border px-2.5 py-1"
            >
              <chip.icon aria-hidden className="text-muted-foreground size-3.5" />
              {chip.label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* 5 · Primero la empresa: la nota es suya. */
function Ownership() {
  const rows = [
    { icon: Gauge, title: "Su nota", text: "Cómo está su salud financiera" },
    { icon: ListTree, title: "El porqué", text: "Qué la sube y qué la baja" },
    { icon: HandCoins, title: "Su oferta", text: "Cuánto, a qué plazo y a qué precio" },
  ];
  return (
    <>
      <p className="text-muted-foreground intro-rise mt-4 text-base text-balance [animation-delay:200ms]">
        Sabe cómo está, por qué, y cuánto debería costarle financiarse.
      </p>
      <div className="bg-card intro-rise mx-auto mt-10 w-full max-w-md overflow-hidden rounded-[14px] border text-left [animation-delay:360ms]">
        <ul className="divide-y">
          {rows.map((row) => (
            <li key={row.title} className="flex items-center gap-3 px-4 py-3">
              <Tile icon={row.icon} />
              <span className="flex flex-col leading-tight">
                <span className="text-sm font-semibold">{row.title}</span>
                <span className="text-muted-foreground text-sm">{row.text}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="bg-muted/50 flex items-start gap-2.5 border-t px-4 py-3 text-sm">
          <Lock aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            <span className="font-semibold">Nadie más ve sus datos.</span> Ni sus movimientos, ni
            sus facturas, ni su nota. Todo se queda en Embat.
          </span>
        </p>
      </div>
    </>
  );
}

/* 6 · La empresa decide: tres pasos, solo el segundo abre la puerta. */
function Consent() {
  const steps = [
    {
      kicker: "1 · Privado",
      title: "Ve su nota y su oferta",
      text: "Todo se queda dentro de Embat.",
    },
    { kicker: "2 · Decide", title: "Pide financiación", text: "Solo entonces se comparte." },
    {
      kicker: "3 · Quien presta",
      title: "Recibe nota y oferta",
      text: "Un banco o fondo que pone el dinero.",
    },
  ];
  return (
    <>
      <ol className="intro-rise mt-10 grid gap-2 text-left [animation-delay:200ms] sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-stretch">
        {steps.map((step, index) => (
          <li key={step.kicker} className="contents">
            <div
              className={cn(
                "bg-card flex flex-col gap-1 rounded-[14px] border px-4 py-3",
                index === 1 && "border-status-healthy ring-status-healthy/30 ring-2",
              )}
            >
              <span
                className={cn(
                  "text-xs font-medium tracking-wide uppercase",
                  index === 1 ? "text-status-healthy-fg" : "text-muted-foreground",
                )}
              >
                {step.kicker}
              </span>
              <span className="text-sm font-semibold">{step.title}</span>
              <span className="text-muted-foreground text-sm">{step.text}</span>
            </div>
            {index < steps.length - 1 ? (
              <ChevronRight
                aria-hidden
                className="text-muted-foreground hidden size-4 self-center sm:block"
              />
            ) : null}
          </li>
        ))}
      </ol>
      <p className="text-muted-foreground intro-rise mt-6 text-sm [animation-delay:360ms]">
        Se comparte la decisión.{" "}
        <span className="text-foreground font-medium">
          Nunca sus movimientos, facturas ni saldos.
        </span>
      </p>
    </>
  );
}

/* 7 · Mientras dura: el crédito sigue a la empresa. */
function Adapts() {
  return (
    <>
      <div className="intro-rise mt-10 grid gap-3 text-left [animation-delay:200ms] sm:grid-cols-2">
        <div className="bg-card rounded-[14px] border p-4">
          <Tile icon={TrendingUp} tone="healthy" />
          <p className="text-muted-foreground mt-3 text-xs font-medium tracking-wide uppercase">
            Si mejora
          </p>
          <p className="mt-1 text-base font-semibold tracking-[-0.01em]">
            Más límite o mejor precio
          </p>
          <p className="text-muted-foreground mt-1 text-sm">Sin esperar al cierre del año.</p>
        </div>
        <div className="bg-card rounded-[14px] border p-4">
          <Tile icon={TrendingDown} tone="watch" />
          <p className="text-muted-foreground mt-3 text-xs font-medium tracking-wide uppercase">
            Si empeora
          </p>
          <p className="mt-1 text-base font-semibold tracking-[-0.01em]">
            El límite baja poco a poco
          </p>
          <p className="text-muted-foreground mt-1 text-sm">
            Antes de que sea un problema, para los dos.
          </p>
        </div>
      </div>
      <p className="text-muted-foreground intro-rise mt-6 text-sm [animation-delay:360ms]">
        Quien presta lo ve <Accent>meses antes</Accent> que con las cuentas anuales.
      </p>
    </>
  );
}

/* 8 · Cierre. */
function Closing() {
  return (
    <ul className="intro-rise mt-10 flex flex-wrap justify-center gap-2 text-sm [animation-delay:200ms]">
      {[
        { icon: Gauge, label: "Una nota cada mes" },
        { icon: ArrowLeftRight, label: "Un crédito que se adapta" },
        { icon: Lock, label: "La empresa decide" },
      ].map((item) => (
        <li
          key={item.label}
          className="bg-card flex items-center gap-2 rounded-md border px-3 py-1.5"
        >
          <item.icon aria-hidden className="text-muted-foreground size-4" />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

export type Scene = {
  kicker: string;
  title: ReactNode;
  body: ReactNode;
  footnote?: string;
};

/** Las ocho pantallas del prototipo, en el orden del argumento de PRODUCT.md. */
export const SCENES: Scene[] = [
  {
    kicker: "El problema",
    title: (
      <>
        Una empresa puede vender mucho y aun así <Accent>necesitar dinero.</Accent>
      </>
    ),
    body: <CashGap />,
  },
  {
    kicker: "Cómo se decide hoy",
    title: (
      <>
        El banco decide con las cuentas <Accent>del año pasado.</Accent>
      </>
    ),
    body: <OnceAYear />,
  },
  {
    kicker: "Qué es Embat",
    title: (
      <>
        Las empresas ya usan Embat para <Accent>ver todo su dinero.</Accent>
      </>
    ),
    body: <EmbatCore />,
  },
  {
    kicker: "La idea",
    title: (
      <>
        Con esos datos, Embat Flow pone a cada empresa <Accent>una nota cada mes.</Accent>
      </>
    ),
    body: <ScoreIdea />,
  },
  {
    kicker: "Primero, la empresa",
    title: (
      <>
        La nota es de la empresa. <Accent>La ve ella. Nadie más.</Accent>
      </>
    ),
    body: <Ownership />,
  },
  {
    kicker: "La empresa decide",
    title: (
      <>
        Solo se comparte si la empresa pulsa <Accent>«Pedir financiación».</Accent>
      </>
    ),
    body: <Consent />,
  },
  {
    kicker: "Mientras dura el crédito",
    title: (
      <>
        El crédito se adapta a <Accent>cómo va la empresa.</Accent>
      </>
    ),
    body: <Adapts />,
  },
  {
    kicker: "Embat Flow",
    title: (
      <>
        La empresa paga lo que merece. <Accent>Quien presta, nunca a ciegas.</Accent>
      </>
    ),
    body: <Closing />,
    footnote: "Embat conecta a la empresa con quien presta. Embat no presta.",
  },
];
