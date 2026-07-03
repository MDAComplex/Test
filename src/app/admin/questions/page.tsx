import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { answerQuestion, deleteQuestion } from "@/lib/actions";
import Link from "next/link";
import { MessageCircleQuestion, Trash2, Send, CheckCircle2 } from "lucide-react";

function formatDate(d: Date) {
  return `${d.toLocaleDateString("de-DE")}, ${d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr`;
}

export default async function AdminQuestionsPage() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== "ADMIN") redirect("/");

  const questions = await prisma.productQuestion.findMany({
    include: { product: true },
    orderBy: { createdAt: "desc" },
  });
  const unanswered = questions.filter((q) => !q.answer);
  const answered = questions.filter((q) => q.answer);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1c1c1f] flex items-center gap-2">
          <MessageCircleQuestion size={22} className="text-[#ff5a1f]" /> Produktfragen
        </h1>
        <p className="text-sm text-[#6b6b76]">
          {unanswered.length} offene und {answered.length} beantwortete Fragen.
        </p>
      </div>

      {/* Offene Fragen */}
      <section className="space-y-3">
        <h2 className="font-bold text-[#1c1c1f]">Offene Fragen</h2>
        {unanswered.length === 0 && (
          <p className="text-sm text-[#6b6b76] bg-white border border-[#e5e5e8] rounded-2xl p-4">
            Alle Fragen sind beantwortet.
          </p>
        )}
        {unanswered.map((q) => (
          <div key={q.id} className="bg-white border border-[#e5e5e8] rounded-2xl p-4 space-y-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <Link href={`/product/${q.productId}`} className="text-sm font-semibold text-[#ff5a1f] hover:underline">
                  {q.product.name}
                </Link>
                <p className="text-xs text-[#6b6b76]">
                  {q.authorName} · {formatDate(q.createdAt)}
                </p>
              </div>
              <form action={async () => { "use server"; await deleteQuestion(q.id); }}>
                <button className="flex items-center gap-1 text-sm text-red-500 hover:underline">
                  <Trash2 size={13} /> Löschen
                </button>
              </form>
            </div>
            <p className="text-sm text-[#1c1c1f]">{q.question}</p>
            <form
              action={async (fd) => {
                "use server";
                await answerQuestion(q.id, fd);
              }}
              className="space-y-2"
            >
              <textarea
                name="answer"
                required
                rows={2}
                placeholder="Antwort des Viralo Teams…"
                className="w-full bg-[#f4f4f5] border border-[#e5e5e8] rounded-xl px-3 py-2 text-sm"
              />
              <button className="flex items-center gap-1.5 bg-[#ff5a1f] text-white px-3 py-1.5 rounded-lg text-sm font-medium">
                <Send size={14} /> Antwort senden
              </button>
            </form>
          </div>
        ))}
      </section>

      {/* Beantwortete Fragen */}
      <section className="space-y-3">
        <h2 className="font-bold text-[#1c1c1f]">Beantwortet</h2>
        {answered.length === 0 && <p className="text-sm text-[#6b6b76]">Noch keine beantworteten Fragen.</p>}
        <div className="bg-white border border-[#e5e5e8] rounded-2xl divide-y divide-[#e5e5e8]">
          {answered.map((q) => (
            <div key={q.id} className="p-3 flex items-start gap-3">
              <CheckCircle2 size={16} className="text-[#1faa59] mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-[#6b6b76]">
                  <Link href={`/product/${q.productId}`} className="text-[#ff5a1f] hover:underline">
                    {q.product.name}
                  </Link>{" "}
                  · {q.authorName} · {formatDate(q.createdAt)}
                </p>
                <p className="text-sm text-[#1c1c1f] truncate">{q.question}</p>
                <p className="text-sm text-[#6b6b76] truncate">Antwort: {q.answer}</p>
              </div>
              <form action={async () => { "use server"; await deleteQuestion(q.id); }}>
                <button className="flex items-center gap-1 text-sm text-red-500 hover:underline shrink-0">
                  <Trash2 size={13} /> Löschen
                </button>
              </form>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
