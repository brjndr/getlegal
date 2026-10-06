import { AuthGate } from "@/components/auth-gate";
import { SignOutButton } from "@/components/sign-out-button";
import { Workspace } from "@/components/workspace";
import { loadSpecs } from "@/lib/load-documents";
import { loadStandardTerms } from "@/lib/standard-terms";

export default async function Home() {
  const [documents, clauses] = await Promise.all([loadSpecs(), loadStandardTerms()]);
  return (
    <AuthGate>
      <Workspace documents={documents} clauses={clauses} headerExtra={<SignOutButton />} />
    </AuthGate>
  );
}
