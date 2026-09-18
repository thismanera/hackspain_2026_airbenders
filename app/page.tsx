"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { signOut, useSession } from "@/lib/core/auth-client";

export default function HomePage() {
  const { data: session, isPending } = useSession();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">Plantilla Next.js</h1>

      {isPending ? null : session ? (
        <div className="flex flex-col items-center gap-3">
          <p className="text-muted-foreground text-sm">Sesión iniciada como {session.user.email}</p>
          <Button variant="outline" onClick={() => void signOut()}>
            Cerrar sesión
          </Button>
        </div>
      ) : (
        <div className="flex gap-3">
          <Button nativeButton={false} render={<Link href="/sign-in" />}>
            Iniciar sesión
          </Button>
          <Button variant="outline" nativeButton={false} render={<Link href="/sign-up" />}>
            Crear cuenta
          </Button>
        </div>
      )}
    </main>
  );
}
