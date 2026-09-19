import {
  ArrowLeftRight,
  Building2,
  CalendarDays,
  Camera,
  CircleDollarSign,
  Clock,
  Coins,
  Gauge,
  HandCoins,
  Landmark,
  Lock,
  LockOpen,
  Network,
  Receipt,
  Truck,
  X,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { EmbatMark } from "@/components/grifo/embat-mark";
import {
  AnimatedCard,
  CardBody,
  CardDescription,
  CardTitle,
  CardVisual,
} from "@/components/ui/animated-card";
import { Visual1 } from "@/components/ui/visual-1";
import { cn } from "@/lib/core/utils";

/** Palabras que llevan el peso de la frase. Un solo acento por pantalla. */
function Accent({ children }: { children: ReactNode }) {
  return <span className="text-[#0F1331] font-bold">{children}</span>;
}

function BigNumber({
  value,
  caption,
  delayMs = 200,
  className,
}: {
  value: string;
  caption: string;
  delayMs?: number;
  className?: string;
}) {
  return (
    <div className={cn("intro-rise mt-10", className)} style={{ animationDelay: `${delayMs}ms` }}>
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
        tone === "healthy" && "bg-[#0F1331]/10 text-[#0F1331] border-transparent",
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
    <div className="intro-rise mt-8 [animation-delay:120ms]">
      <div className="relative h-28 sm:h-32">
        <svg
          aria-hidden
          viewBox="0 0 800 120"
          preserveAspectRatio="none"
          className="absolute inset-0 size-full"
        >
          <path
            d="M 100,108 Q 400,-68 700,108"
            fill="none"
            stroke="var(--border)"
            strokeWidth={2}
            strokeDasharray="6 8"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <CircleDollarSign
          aria-hidden
          className="cash-gap-coin text-primary bg-background absolute size-6 rounded-full"
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
      <div className="intro-rise mt-10 flex flex-col items-center gap-4 [animation-delay:120ms]">
        <ol className="flex gap-1 sm:gap-1.5" aria-label="Doce meses, uno con foto">
          {months.map((month, index) => (
            <li
              key={month}
              className="calendar-month flex flex-col items-center gap-1.5"
              style={{ animationDelay: `${200 + index * 60}ms` }}
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
      </div>

      <BigNumber
        value="1 vez al año"
        caption="Una foto fija para un negocio que cambia cada mes."
        delayMs={350}
        className="mt-8 sm:mt-10"
      />
    </>
  );
}

/* 4 · Qué es Embat: cada fuente (bancos, facturas, cobros) dibuja una vía fina y limpia
   hacia Embat en el centro, con amplia separación según el croquis del usuario. */
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

  // Coordenadas calculadas para viewBox="0 0 600 200":
  // Recupera la curvatura amplia, fluida y redondeada original, pero extendiendo los extremos
  // hacia el interior de las tarjetas y del logo para que conecten sin separación.
  const streamTracks = [
    // Izquierda -> Centro
    { d: "M 120,30 C 220,30 250,86 286,86", delay: 0 },
    { d: "M 120,100 L 286,100", delay: 0.35 },
    { d: "M 120,170 C 220,170 250,114 286,114", delay: 0.7 },
    // Derecha -> Centro
    { d: "M 480,30 C 380,30 350,86 314,86", delay: 0.18 },
    { d: "M 480,100 L 314,100", delay: 0.52 },
    { d: "M 480,170 C 380,170 350,114 314,114", delay: 0.85 },
  ];

  const Column = ({ items }: { items: typeof left }) => (
    <ul className="relative z-10 flex w-40 sm:w-48 flex-col gap-3">
      {items.map((item) => (
        <li
          key={item.label}
          className="bg-card relative flex items-center justify-center gap-2.5 rounded-lg border px-3 py-2 text-xs sm:text-sm shadow-xs text-center"
        >
          <item.icon aria-hidden="true" className="text-muted-foreground size-4 shrink-0 sm:size-4.5" />
          <span className="font-medium whitespace-nowrap">{item.label}</span>
        </li>
      ))}
    </ul>
  );

  return (
    <>
      <p className="text-muted-foreground intro-rise mt-4 text-base text-balance [animation-delay:200ms]">
        Conecta todos los bancos de la empresa, sus facturas y sus cobros en un único lugar.
      </p>
      <div className="intro-rise relative mx-auto mt-10 flex max-w-2xl items-center justify-between gap-4 [animation-delay:360ms] sm:max-w-3xl sm:gap-8">
        <svg
          aria-hidden="true"
          viewBox="0 0 600 200"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 size-full"
        >
          {/* Vías base finas */}
          {streamTracks.map((track, i) => (
            <path
              key={`track-${i}`}
              d={track.d}
              fill="none"
              stroke="var(--border)"
              strokeWidth={1}
              strokeLinecap="round"
            />
          ))}
          {/* Haces finos que nacen en cada nodo y viajan hacia Embat */}
          {streamTracks.map((track, i) => (
            <path
              key={`beam-${i}`}
              d={track.d}
              pathLength={100}
              className="embat-beam"
              fill="none"
              stroke="#0F1331"
              strokeWidth={1.5}
              strokeLinecap="round"
              style={{ animationDelay: `${track.delay}s` }}
            />
          ))}
        </svg>

        <Column items={left} />

        <div className="relative z-10 flex shrink-0 items-center justify-center">
          <EmbatMark size={44} />
        </div>

        <Column items={right} />
      </div>
    
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
            stroke="#10b981"
            strokeWidth={6}
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
   
        <p className="mt-1 text-lg font-semibold tracking-[-0.01em]">
          Una nota de 0 a 100, siempre explicada
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          De la nota sale una oferta de financiación:
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

/* Animación del candado: solo el icono cerrándose, sin card ni efectos artificiales */
function HeroLock() {
  return (
    <div className="intro-rise mb-3 flex items-center justify-center">
      <span aria-hidden="true" className="relative flex size-12 items-center justify-center sm:size-14">
        <LockOpen className="lock-open-out text-muted-foreground/60 absolute size-10 sm:size-12" strokeWidth={1.75} />
        <Lock className="lock-closed-in text-[#0F1331] absolute size-10 sm:size-12" strokeWidth={1.75} />
      </span>
    </div>
  );
}

/* 6 · Primero la empresa: la nota es suya y 100% privada. */
function Ownership() {
  return (
    <div className="intro-rise mx-auto mt-8 grid w-full max-w-2xl gap-4 text-left sm:grid-cols-3 [animation-delay:180ms]">
      {/* 1. Score privado */}
      <div className="bg-card flex flex-col justify-between gap-4 rounded-[14px] border p-5 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-bold tracking-tight text-foreground">82</span>
            <span className="text-muted-foreground text-xs font-normal">/100</span>
          </div>
          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
            +4 este mes
          </span>
        </div>
        <div>
          <p className="text-base font-semibold tracking-[-0.01em]">Score privado</p>
          <p className="text-muted-foreground mt-1 text-xs sm:text-sm leading-relaxed">
            Salud calculada cada mes con tus movimientos, sin que ningún banco la vea.
          </p>
        </div>
      </div>

      {/* 2. Pagar menos intereses */}
      <div className="bg-card flex flex-col justify-between gap-4 rounded-[14px] border p-5 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-baseline gap-1.5">
            <span className="text-muted-foreground text-xs font-medium line-through">5,4%</span>
            <span className="text-2xl font-bold tracking-tight text-foreground">3,8%</span>
          </div>
          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
            -1,6% TAE
          </span>
        </div>
        <div>
          <p className="text-base font-semibold tracking-[-0.01em]">Pagar menos intereses</p>
          <p className="text-muted-foreground mt-1 text-xs sm:text-sm leading-relaxed">
            Palancas en cobros y pagos para mejorar tu nota y conseguir mejor precio.
          </p>
        </div>
      </div>

      {/* 3. Financiación disponible */}
      <div className="bg-card flex flex-col justify-between gap-4 rounded-[14px] border p-5 shadow-xs">
        <div className="flex items-center justify-between">
          <span className="text-2xl font-bold tracking-tight text-foreground">180k €</span>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
            Preaprobado
          </span>
        </div>
        <div>
          <p className="text-base font-semibold tracking-[-0.01em]">Línea disponible</p>
          <p className="text-muted-foreground mt-1 text-xs sm:text-sm leading-relaxed">
            Listo para pedir a golpe de click cuando quieras, sin esperar a final de año.
          </p>
        </div>
      </div>
    </div>
  );
}

/* 7 · La empresa decide: SOLO el botón redondeado y alargado en el centro,
   limpio y con animación de click táctil con cursor y onda expansiva. */
function Consent() {
  return (
    <div className="intro-rise mt-14 flex flex-col items-center gap-8 [animation-delay:200ms]">
      <div className="relative flex flex-col items-center">
        {/* Botón táctil que se presiona rítmicamente */}
        <div className="consent-btn-target bg-primary text-primary-foreground relative flex w-72 sm:w-96 items-center justify-center gap-3 rounded-full py-4 px-8 text-base font-semibold shadow-md transition-all">
          <HandCoins className="size-5 shrink-0 text-white" />
          <span className="text-white">Pedir financiación</span>
          <ArrowLeftRight className="size-4 shrink-0 text-white/80" />
        </div>

        {/* Cursor que entra, se posa sobre el botón y hace click con onda expansiva */}
        <div
          aria-hidden="true"
          className="consent-cursor-anim pointer-events-none absolute top-1/2 left-1/2"
        >
          <div className="relative">
            {/* Onda expansiva circular que brota de la punta del cursor al hacer click */}
            <div className="consent-click-wave pointer-events-none absolute -top-2 -left-2 size-6 rounded-full border-2 border-white/90 bg-white/20" />

            {/* Puntero de ratón estándar limpio y nítido (blanco sólido con borde oscuro) */}
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              className="drop-shadow-[0_3px_10px_rgba(0,0,0,0.5)]"
            >
              <path
                d="M4 2L4 18.5L8.8 14.5L12.5 22L15 20.8L11.4 13.5L17.5 13L4 2Z"
                fill="#ffffff"
                stroke="#0F1331"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>
      </div>

      <p className="text-muted-foreground mt-4 text-sm">
        Se comparte la decisión con el banco y su evolución de score mensual.
      </p>
    </div>
  );
}

/* 8 · Quien financia: la perspectiva del partner al recibir la solicitud. */
function PartnerView() {
  return (
    <div className="intro-rise mx-auto mt-8 flex w-full max-w-xl flex-col items-center gap-4 [animation-delay:180ms]">
      <div className="bg-card w-full overflow-hidden rounded-[14px] border text-left shadow-xs">
        {/* Cabecera de la ficha */}
        <div className="flex items-center justify-between border-b bg-muted/30 px-5 py-3.5">
          <div className="flex items-center gap-3">
            <span className="bg-primary/10 text-primary flex size-8 items-center justify-center rounded-lg">
              <Building2 className="size-4.5" />
            </span>
            <div>
              <p className="text-sm font-semibold tracking-[-0.01em]">Northbrook Industrial</p>
              <p className="text-muted-foreground text-xs">Distribución B2B · Cliente Embat</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            Score 82 · Sano
          </span>
        </div>

        {/* Métricas clave que ve el partner */}
        <div className="grid grid-cols-3 divide-x p-5 text-center">
          <div className="px-2">
            <p className="text-muted-foreground text-xs font-medium">Límite asignable</p>
            <p className="mt-1 text-lg font-bold tracking-tight text-foreground sm:text-xl">
              180.000 €
            </p>
            <p className="text-muted-foreground mt-0.5 text-[11px]">según ventas reales</p>
          </div>
          <div className="px-2">
            <p className="text-muted-foreground text-xs font-medium">Coste y plazo</p>
            <p className="mt-1 text-lg font-bold tracking-tight text-foreground sm:text-xl">
              3,8% TAE
            </p>
            <p className="text-muted-foreground mt-0.5 text-[11px]">hasta 180 días</p>
          </div>
          <div className="px-2">
            <p className="text-muted-foreground text-xs font-medium">Riesgo continuo</p>
            <p className="mt-1 text-lg font-bold tracking-tight text-emerald-600 sm:text-xl">
              0 alertas
            </p>
            <p className="text-muted-foreground mt-0.5 text-[11px]">+3 meses en mejora</p>
          </div>
        </div>

        {/* Barra de garantía y privacidad */}
        <div className="flex items-center justify-between border-t bg-muted/20 px-5 py-2.5 text-[11px] text-muted-foreground">
          <span>Opt-in verificado: solicitado por la empresa</span>
          <span className="font-mono">Sin acceso a extractos ni facturas</span>
        </div>
      </div>

      <p className="text-muted-foreground text-center text-sm sm:whitespace-nowrap">
        El partner presta <Accent>viendo</Accent>. Sin burocracia, sin meses de espera y sin cuentas anuales viejas.
      </p>
    </div>
  );
}

/* 9 · Mientras dura: el crédito sigue a la empresa. */
function Adapts() {
  return (
    <>
      <div className="intro-rise mx-auto mt-10 grid w-full max-w-2xl gap-5 text-center sm:grid-cols-2 [animation-delay:180ms]">
        <AnimatedCard>
          <CardVisual>
            <Visual1
              direction="up"
              mainColor="#0F1331"
              secondaryColor="#3b4675"
              delayMs={0}
            />
          </CardVisual>
          <CardBody>
            <CardTitle>Si el negocio crece</CardTitle>
            <CardDescription className="whitespace-nowrap">
              Más límite o mejor precio, mes a mes.
            </CardDescription>
          </CardBody>
        </AnimatedCard>

        <AnimatedCard>
          <CardVisual>
            <Visual1
              direction="down"
              mainColor="#ef4444"
              secondaryColor="#f87171"
              delayMs={0}
            />
          </CardVisual>
          <CardBody>
            <CardTitle>Si las ventas bajan</CardTitle>
            <CardDescription className="whitespace-nowrap">
              El límite se adapta y protege la caja.
            </CardDescription>
          </CardBody>
        </AnimatedCard>
      </div>

      <p className="text-muted-foreground intro-rise mx-auto mt-8 text-center text-sm sm:whitespace-nowrap [animation-delay:260ms]">
        El partner lo ve{" "}
        <Accent>meses antes</Accent>
        {" "}que el banco tradicional con las cuentas anuales.
      </p>
    </>
  );
}

export type Scene = {
  kicker: string;
  heroVisual?: ReactNode;
  title: ReactNode;
  body?: ReactNode;
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
        Tiene que pagar mucho antes de cobrar. <Accent>Hasta 90 días antes.</Accent>
      </>
    ),
    body: <CashGapTimeline />,
  },
  {
    kicker: "Cómo se decide hoy",
    title: (
      <>
        El banco decide el riesgo con las cuentas <Accent>del año pasado.</Accent>
      </>
    ),
    body: <OnceAYear />,
  },
  {
    kicker: "Qué es Embat",
    title: (
      <>
        Las empresas ya gestionan en Embat <Accent>toda su tesorería</Accent>
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
        Su score es privado. <Accent>La empresa decide cuándo compartirlo.</Accent>
      </>
    ),
    body: <Ownership />,
  },
  {
    kicker: "La empresa decide",
    title: (
      <>
        Financiación a golpe de click
      </>
    ),
    body: <Consent />,
  },
  {
    kicker: "Quién financia",
    title: (
      <>
        El partner financiero ve la salud de la empresa <Accent>mes a mes, en directo.</Accent>
      </>
    ),
    body: <PartnerView />,
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
    heroVisual: (
      <div className="intro-rise mb-3 flex justify-center">
        <EmbatMark size={44} />
      </div>
    ),
    title: (
      <>
        La empresa paga lo que merece. <Accent>El partner, nunca a ciegas.</Accent>
      </>
    ),
  },
];
