import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Autocomplete: Top-6-Produktnamen per ILIKE (parametrisiert, SQL-sicher).
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  if (q.length < 2) return NextResponse.json([]);

  const pattern = `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
  const rows = await prisma.$queryRaw<{ id: string; name: string }[]>`
    SELECT id, name FROM "Product"
    WHERE name ILIKE ${pattern}
    ORDER BY name ASC
    LIMIT 6
  `;

  return NextResponse.json(rows);
}
