import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { DocumentList } from "@/components/document-list";
import { loadSpecs } from "@/lib/load-documents";

export const metadata: Metadata = {
  title: "My documents",
};

export default async function Documents() {
  return (
    <AppShell>
      <DocumentList documents={await loadSpecs()} />
    </AppShell>
  );
}
