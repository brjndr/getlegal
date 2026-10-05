import { AuthGate } from "@/components/auth-gate";
import { NdaCreator } from "@/components/nda-creator";
import { SignOutButton } from "@/components/sign-out-button";
import { loadStandardTerms } from "@/lib/standard-terms";

export default async function Home() {
  const clauses = await loadStandardTerms();
  return (
    <AuthGate>
      <NdaCreator clauses={clauses} headerExtra={<SignOutButton />} />
    </AuthGate>
  );
}
