import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { CATEGORIES } from "@/lib/categories";
import { completeOnboarding } from "@/lib/actions";
import OnboardingWizard from "@/components/OnboardingWizard";

export default async function OnboardingPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/login");

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) redirect("/login");
  // Onboarding ist optional: auch bereits "onboarded" Nutzer können hier ihre
  // Präferenzen anpassen (Link im Account). completeOnboarding leitet sie zurück zu /account.

  async function submit(formData: FormData) {
    "use server";
    await completeOnboarding(formData);
  }

  return <OnboardingWizard categories={CATEGORIES} action={submit} />;
}
