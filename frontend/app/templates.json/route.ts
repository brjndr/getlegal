import { loadTemplates } from "@/lib/load-documents";

// Written to a file when the site is built, so the page can fetch it without a server.
export const dynamic = "force-static";

export async function GET() {
  return Response.json(await loadTemplates());
}
