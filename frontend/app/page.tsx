import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { WorkspaceLoader } from "@/components/workspace-loader";
import { loadSpecs } from "@/lib/load-documents";
import { loadStandardTerms } from "@/lib/standard-terms";

export default async function Home() {
  const [documents, clauses] = await Promise.all([loadSpecs(), loadStandardTerms()]);
  return (
    <AppShell>
      {/* Which document to open is in the address, which is only known in the browser. */}
      <Suspense>
        <WorkspaceLoader documents={documents} clauses={clauses} />
      </Suspense>
    </AppShell>
  );
}
