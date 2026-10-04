import { NdaCreator } from "@/components/nda-creator";
import { loadStandardTerms } from "@/lib/standard-terms";

export default async function Home() {
  const clauses = await loadStandardTerms();
  return <NdaCreator clauses={clauses} />;
}
