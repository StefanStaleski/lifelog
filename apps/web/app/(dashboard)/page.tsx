import { EmptyState, PageHeader } from "@/components/ui";

export default function TodayPage() {
  return (
    <>
      <PageHeader title="Today" />
      <EmptyState emoji="☀️" title="Your day will show up here." />
    </>
  );
}
