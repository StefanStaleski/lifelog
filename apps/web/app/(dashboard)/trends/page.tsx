import { EmptyState, PageHeader } from "@/components/ui";

export default function TrendsPage() {
  return (
    <>
      <PageHeader title="Trends" />
      <EmptyState emoji="📈" title="Coming soon." />
    </>
  );
}
