import {
  ArrowLeftRight,
  Camera,
  CalendarDays,
  CircleDollarSign,
  Clock,
  Coins,
  Gauge,
  HandCoins,
  Landmark,
  ListTree,
  Lock,
  LockOpen,
  MousePointerClick,
  Network,
  Receipt,
  TrendingDown,
  TrendingUp,
  Truck,
  X,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { EmbatMark } from "@/components/grifo/embat-mark";
import { cn } from "@/lib/core/utils";

/** Palabras que llevan el peso de la frase. Un solo acento por pantalla. */
function Accent({ children }: { children: ReactNode }) {
  return <span className="text-status-healthy-fg">{children}</span>;
}

function BigNumber({
  value,
  caption,
  delayMs = 200,
}: {
  value: string;
  caption: string;
  delayMs?: number;
}) {
  return (
    <div className="intro-rise mt-10" style={{ animationDelay: `${delayMs}ms` }}>
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
        "flex size-10 shrink-0 items-center justify-center rounded-lg border",
        tone === "neutral" && "bg-muted text-foreground",
        tone === "healthy" && "bg-status-healthy-surface text-status-healthy-fg border-transparent",
        tone === "watch" && "bg-status-watch-surface text-status-watch-fg border-transparent",
        tone === "ink" && "bg-primary text-primary-foreground border-transparent",
        className,
      )}
    >
      <Icon className="size-5" strokeWidth={2} />
    </span>
  );
}

/* 1 · El gancho: solo la frase, sin ruido. Lo visual llega en la pantalla
   siguiente, cuando la empresa ya le ha dado a "Siguiente". */
function ProblemHook() {
  return null;
}

/* 2 · El problema, en cifras: una moneda recorre, en el aire, una trayectoria
   punteada desde el primer nodo (Día 0) hasta el último (90 días) de forma fluida y continua. */
function CashGapTimeline() {
  const stops = [
    { icon: Truck, label: "Paga al proveedor", day: "Día 0" },
    { icon: Clock, label: "Espera", day: "30 días" },
    { icon: Clock, label: "Sigue esperando", day: "60 días" },
    { icon: Coins, label: "El cliente paga", day: "90 días" },
  ];
  return (
    <div className="intro-rise mt-16 [animation-delay:120ms]">
      <div className="relative h-16">
        <svg
          aria-hidden
          viewBox="0 0 100 64"
          preserveAspectRatio="none"
          className="absolute inset-0 size-full"
        >
          <path
            d="M12.5,58 Q50,6 87.5,58"
            fill="none"
            stroke="var(--border)"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            strokeLinecap="round"
          />
        </svg>
        <CircleDollarSign
          aria-hidden
          className="cash-gap-coin text-primary absolute size-6"
          strokeWidth={1.75}
        />
      </div>
      <div className="relative -mt-2">
        <span
          aria-hidden
          className="bg-border absolute top-[20px] right-[12.5%] left-[12.5%] h-px"
        />
        <ol className="relative grid grid-cols-4 gap-2 text-left">
          {stops.map((stop, index) => (
            <li key={stop.label} className="flex flex-col items-center gap-2 text-center">
              <Tile
                icon={stop.icon}
                tone={index === 0 || index === stops.length - 1 ? "ink" : "neutral"}
                className="relative"
              />
              <span className="text-sm font-semibold tabular-nums">{stop.day}</span>
              <span className="text-muted-foreground text-sm">{stop.label}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/* 3 · Hoy: una foto en enero, once meses a ciegas. Los meses entran uno a uno;
   el primero dispara flash, los otros once quedan marcados en rojo. */
function OnceAYear() {
  const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  return (
    <>
      <BigNumber
        value="1 vez al año"
        caption="se revisa el crédito, aunque el negocio cambie cada mes"
      />
      <div className="intro-rise mt-10 flex flex-col items-center gap-4 [animation-delay:360ms]">
        <ol className="flex gap-1 sm:gap-1.5" aria-label="Doce meses, uno con foto">
          {months.map((month, index) => (
            <li
              key={month}
              className="calendar-month flex flex-col items-center gap-1.5"
              style={{ animationDelay: `${500 + index * 90}ms` }}
            >
              <span
                className={cn(
                  "flex size-8 items-center justify-center rounded-md border sm:size-10",
                  index === 0
                    ? "calendar-flash bg-primary text-primary-foreground border-transparent"
                    : "bg-status-risk border-transparent text-white",
                )}
              >
                {index === 0 ? (
                  <Camera aria-hidden className="size-4 sm:size-5" />
                ) : (
                  <X aria-hidden className="size-4 sm:size-5" strokeWidth={2.5} />
                )}
              </span>
              <span
                className={cn(
                  "text-xs font-medium tabular-nums",
                  index === 0 ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {month}
              </span>
            </li>
          ))}
        </ol>
        <p className="text-muted-foreground text-sm">Una foto en enero. Las otras once, a ciegas.</p>
      </div>
    </>
  );
}

/* 4 · Qué es Embat: cada fuente (bancos, facturas, cobros) dibuja una vía limpia
   hacia Embat en el centro, y de cada nodo brota un pulso de datos constante. */
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

  // Vías limpias que nacen exactamente en el borde de cada nodo y convergen en el hub central
  const streamTracks = [
    // Izquierda -> Centro
    { d: "M36,18 C41,18 43,50 46,50", delay: 0 },
    { d: "M36,50 L46,50", delay: 0.35 },
    { d: "M36,82 C41,82 43,50 46,50", delay: 0.7 },
    // Derecha -> Centro
    { d: "M64,18 C59,18 57,50 54,50", delay: 0.18 },
    { d: "M64,50 L54,50", delay: 0.52 },
    { d: "M64,82 C59,82 57,50 54,50", delay: 0.85 },
  ];

  const Column = ({ items, side }: { items: typeof left; side: "l" | "r" }) => (
    <ul className="relative flex flex-col gap-2">
      {items.map((item) => (
        <li
          key={item.label}
          className={cn(
            "bg-card relative flex items-center gap-2 rounded-lg border px-3 py-2 text-sm shadow-xs",
            side === "r" && "flex-row-reverse text-right",
          )}
        >
          <item.icon aria-hidden className="text-muted-foreground size-5 shrink-0" />
          <span className="font-medium">{item.label}</span>
        </li>
      ))}
    </ul>
  );

  return (
    <>
      <p className="text-muted-foreground intro-rise mt-4 text-base text-balance [animation-delay:200ms]">
        Su tesorería al día: cada movimiento de sus cuentas bancarias y cada factura.
      </p>
      <div className="intro-rise relative mx-auto mt-10 grid max-w-xl grid-cols-[1fr_auto_1fr] items-center gap-3 [animation-delay:360ms] sm:gap-6">
        <svg
          aria-hidden
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 size-full"
        >
          {/* Vías base sutiles */}
          {streamTracks.map((track, i) => (
            <path
              key={`track-${i}`}
              d={track.d}
              fill="none"
              stroke="var(--border)"
              strokeWidth={1.2}
              strokeLinecap="round"
            />
          ))}
          {/* Haces de luz que nacen en cada nodo y fluyen hacia Embat */}
          {streamTracks.map((track, i) => (
            <path
              key={`beam-${i}`}
              d={track.d}
              pathLength={100}
              className="embat-beam"
              fill="none"
              stroke="var(--status-healthy-fg)"
              strokeWidth={2.2}
              strokeLinecap="round"
              style={{ animationDelay: `${track.delay}s` }}
            />
          ))}
        </svg>

        <Column items={left} side="l" />

        <div className="relative z-10 flex items-center justify-center">
          <div className="relative flex size-14 items-center justify-center rounded-2xl border bg-card p-2.5 shadow-sm sm:size-16">
            <span aria-hidden className="embat-hub-pulse pointer-events-none absolute inset-0 rounded-2xl" />
            <EmbatMark size={40} />
          </div>
        </div>

        <Column items={right} side="r" />
      </div>
      <p className="text-muted-foreground intro-rise mt-6 text-sm [animation-delay:520ms]">
        Un banco solo ve su cuenta. Embat ve la empresa completa.
      </p>
    </>
  );
}

/* 5 · La idea: una nota, y de la nota una oferta. */
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

/* Animación del candado principal: grande, ubicado arriba de "Primero, la empresa" */
function HeroLock() {
  return (
    <div className="intro-rise relative flex items-center justify-center">
      <div className="border-status-healthy/30 bg-card text-status-healthy-fg relative flex size-16 items-center justify-center rounded-2xl border shadow-sm sm:size-20">
        <span aria-hidden className="hero-lock-ring pointer-events-none absolute inset-0 rounded-2xl" />
        <span aria-hidden className="relative flex size-8 items-center justify-center sm:size-10">
          <LockOpen className="lock-open-out text-muted-foreground absolute size-8 sm:size-10" />
          <Lock className="lock-closed-in text-status-healthy-fg absolute size-8 sm:size-10" />
        </span>
      </div>
    </div>
  );
}

/* 6 · Primero la empresa: la nota es suya. */
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
      <div className="bg-card intro-rise mx-auto mt-8 w-full max-w-md overflow-hidden rounded-[14px] border text-left [animation-delay:360ms]">
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
          <Lock className="text-status-healthy-fg mt-0.5 size-4 shrink-0" />
          <span>
            <span className="font-semibold">Nadie más ve sus datos.</span> Ni sus movimientos, ni
            sus facturas, ni su nota. Todo se queda en Embat.
          </span>
        </p>
      </div>
    </>
  );
}

/* 7 · La empresa decide: el botón central es el héroe absoluto con animación
   de click táctil. Los pasos 1 y 3 son mínimos y limpios, sin tarjetas ni peso visual. */
function Consent() {
  return (
    <div className="intro-rise mt-12 flex flex-col items-center gap-8 [animation-delay:200ms]">
      <div className="relative flex w-full max-w-xl flex-col items-center justify-between gap-6 sm:flex-row sm:items-center">
        {/* Paso 1: Mínimo, sin tarjeta */}
        <div className="flex items-center gap-3 text-left">
          <span
            aria-hidden
            className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-full"
          >
            <Lock className="size-4" />
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
              1 · Privado
            </span>
            <span className="text-foreground text-sm font-medium">Ve su nota y su oferta</span>
          </span>
        </div>

        {/* Conector discreto */}
        <div
          aria-hidden
          className="bg-border hidden h-px w-8 sm:block"
        />

        {/* Paso 2: Botón héroe siendo clicado */}
        <div className="relative flex flex-col items-center">
          <div className="consent-btn-target bg-primary text-primary-foreground relative flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold shadow-md transition-all sm:text-base">
            <HandCoins className="text-status-healthy-fg size-4 sm:size-5" />
            <span>Pedir financiación</span>
            <ArrowLeftRight className="size-3.5 opacity-70 sm:size-4" />
          </div>

          {/* Ripple wave al hacer click */}
          <span
            aria-hidden
            className="consent-btn-ripple border-status-healthy pointer-events-none absolute inset-0 rounded-xl border"
          />

          {/* Cursor animado que se acerca, pulsa y sale */}
          <div
            aria-hidden
            className="consent-btn-cursor pointer-events-none absolute"
          >
            <MousePointerClick className="text-foreground size-6 drop-shadow-md" />
          </div>
        </div>

        {/* Conector discreto con flujo animado tras el click */}
        <div
          aria-hidden
          className="bg-border relative hidden h-px w-8 sm:block"
        >
          <span className="consent-stream-dot bg-status-healthy-fg absolute top-1/2 -mt-1 size-2 rounded-full" />
        </div>

        {/* Paso 3: Mínimo, sin tarjeta */}
        <div className="consent-step-target flex items-center gap-3 text-left">
          <span
            aria-hidden
            className="consent-step-icon bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-full transition-colors"
          >
            <Landmark className="size-4" />
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
              3 · Quien presta
            </span>
            <span className="text-foreground text-sm font-medium">Recibe nota y oferta</span>
          </span>
        </div>
      </div>

      <p className="text-muted-foreground mt-4 text-sm">
        Se comparte la decisión.{" "}
        <span className="text-foreground font-medium">
          Nunca sus movimientos, facturas ni saldos.
        </span>
      </p>
    </div>
  );
}

/* 8 · Mientras dura: el crédito sigue a la empresa. Las flechas son el
   elemento principal de la pantalla, grandes y en movimiento continuo. */
function Adapts() {
  return (
    <>
      <div className="intro-rise mx-auto mt-10 flex w-full max-w-lg items-stretch justify-center gap-4 [animation-delay:200ms] sm:gap-6">
        <div className="bg-card flex flex-1 flex-col items-center gap-3 rounded-[14px] border px-5 py-8">
          <TrendingUp aria-hidden className="snake-up text-status-healthy-fg size-16 sm:size-20" strokeWidth={1.5} />
          <p className="text-center text-base font-semibold tracking-[-0.01em] sm:text-lg">
            Más límite o mejor precio
          </p>
          <p className="text-muted-foreground text-center text-sm">sin esperar al cierre del año</p>
        </div>
        <div className="bg-card flex flex-1 flex-col items-center gap-3 rounded-[14px] border px-5 py-8">
          <TrendingDown aria-hidden className="snake-down text-status-watch-fg size-16 sm:size-20" strokeWidth={1.5} />
          <p className="text-center text-base font-semibold tracking-[-0.01em] sm:text-lg">
            El límite baja poco a poco
          </p>
          <p className="text-muted-foreground text-center text-sm">
            antes de que sea un problema, para los dos
          </p>
        </div>
      </div>
      <p className="text-muted-foreground intro-rise mt-6 text-sm [animation-delay:360ms]">
        Quien presta lo ve <Accent>meses antes</Accent> que con las cuentas anuales.
      </p>
    </>
  );
}

/* 9 · Cierre. */
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
          <item.icon aria-hidden className="text-muted-foreground size-5" />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

export type Scene = {
  kicker: string;
  heroVisual?: ReactNode;
  title: ReactNode;
  body: ReactNode;
  footnote?: string;
};

/** Las nueve pantallas del prototipo, en el orden del argumento de PRODUCT.md. */
export const SCENES: Scene[] = [
  {
    kicker: "El problema",
    title: (
      <>
        Una empresa puede vender mucho y aun así <Accent>necesitar dinero.</Accent>
      </>
    ),
    body: <ProblemHook />,
  },
  {
    kicker: "Cuánto se tarda",
    title: (
      <>
        Cobra mucho <Accent>después de haber pagado.</Accent>
      </>
    ),
    body: <CashGapTimeline />,
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
    heroVisual: <HeroLock />,
    title: (
      <>
        Su nota es privada. <Accent>Nadie la ve, hasta que ella decide.</Accent>
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
