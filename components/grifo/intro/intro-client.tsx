"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { parseAsInteger, useQueryState } from "nuqs";
import { useCallback, useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/core/utils";

import { INTRO_SEEN_KEY } from "./intro-gate";
import { SCENES } from "./scenes";

const stepParser = parseAsInteger.withDefault(1);

export function IntroClient() {
  const router = useRouter();
  const [rawStep, setStep] = useQueryState("paso", stepParser);
  const total = SCENES.length;
  const step = Math.min(Math.max(rawStep, 1), total);
  const index = step - 1;
  const scene = SCENES[index]!;
  const first = index === 0;
  const last = index === total - 1;

  const finish = useCallback(() => {
    window.sessionStorage.setItem(INTRO_SEEN_KEY, "1");
    router.push("/cartera");
  }, [router]);
  const go = useCallback(
    (next: number) => {
      if (next < 1) return;
      if (next > total) {
        finish();
        return;
      }
      void setStep(next);
    },
    [finish, setStep, total],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLButtonElement && event.key === "Enter") return;
      if (event.key === "Escape") finish();
      else if (event.key === "ArrowLeft" || event.key === "Backspace") {
        event.preventDefault();
        go(step - 1);
      } else if (event.key === "ArrowRight" || event.key === " " || event.key === "Enter") {
        event.preventDefault();
        go(step + 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, go, finish]);

  return (
    <div className="bg-background flex min-h-svh flex-col">
      <header className="flex items-center justify-between px-6 py-4">
        <span className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-md text-sm font-semibold"
          >
            E
          </span>
          <span className="text-sm font-semibold">Embat Flow</span>
        </span>
        {last ? null : (
          <Button variant="ghost" size="sm" onClick={finish}>
            Saltar introducción
          </Button>
        )}
      </header>

      <main className="flex flex-1 items-center justify-center px-6 py-8">
        <section key={step} aria-labelledby="intro-title" className="w-full max-w-3xl text-center">
          <p className="text-status-healthy-fg intro-rise text-xs font-medium tracking-wide uppercase">
            {scene.kicker}
          </p>
          <h1
            id="intro-title"
            className="intro-rise mt-3 text-3xl font-semibold tracking-[-0.03em] text-balance [animation-delay:80ms] sm:text-5xl"
          >
            {scene.title}
          </h1>
          {scene.body}
          {last ? (
            <div className="intro-rise mt-10 flex flex-col items-center gap-4 [animation-delay:360ms]">
              <Button size="lg" onClick={finish}>
                Entrar a Embat Flow
                <ArrowRight aria-hidden className="size-4" />
              </Button>
              {scene.footnote ? (
                <p className="text-muted-foreground text-xs">{scene.footnote}</p>
              ) : null}
            </div>
          ) : null}
        </section>
      </main>

      <footer className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-t px-6 py-4">
        <div>
          {first ? null : (
            <Button variant="outline" size="sm" onClick={() => go(step - 1)}>
              <ArrowLeft aria-hidden className="size-4" />
              Atrás
            </Button>
          )}
        </div>
        <div className="flex flex-col items-center gap-2">
          <ol className="flex items-center gap-1.5" aria-label="Pasos de la introducción">
            {SCENES.map((item, i) => (
              <li key={item.kicker}>
                <button
                  type="button"
                  aria-label={`Paso ${i + 1}: ${item.kicker}`}
                  aria-current={i === index ? "step" : undefined}
                  onClick={() => go(i + 1)}
                  className={cn(
                    "block h-1.5 rounded-full transition-[width,background-color] duration-300",
                    i === index
                      ? "bg-primary w-6"
                      : i < index
                        ? "bg-foreground/40 w-1.5"
                        : "bg-border w-1.5",
                  )}
                />
              </li>
            ))}
          </ol>
          <p className="text-muted-foreground text-xs tabular-nums">
            {step} de {total}
            {first ? (
              <>
                {" · "}
                <Kbd>←</Kbd> <Kbd>→</Kbd> para moverte
              </>
            ) : null}
          </p>
        </div>
        <div className="flex justify-end">
          {last ? null : (
            <Button size="sm" onClick={() => go(step + 1)}>
              Siguiente
              <ArrowRight aria-hidden className="size-4" />
            </Button>
          )}
        </div>
      </footer>
    </div>
  );
}
