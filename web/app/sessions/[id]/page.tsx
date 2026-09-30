import { SessionPage } from "@/components/session-page";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SessionPage id={id} />;
}
