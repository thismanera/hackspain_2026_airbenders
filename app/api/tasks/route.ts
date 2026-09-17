import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/core/db";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim();
  const tasks = await prisma.task.findMany({
    where: q ? { title: { contains: q, mode: "insensitive" } } : undefined,
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ tasks });
}

const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = createTaskSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const task = await prisma.task.create({ data: { title: parsed.data.title } });
  return NextResponse.json({ task }, { status: 201 });
}
