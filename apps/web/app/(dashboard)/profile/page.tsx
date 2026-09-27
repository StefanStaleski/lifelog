import { Portrait360 } from "@/components/Portrait360";
import { PortraitUploader } from "@/components/PortraitUploader";
import { Card, PageHeader } from "@/components/ui";
import { getDb } from "@/lib/db";
import { portraitInfo } from "@/lib/portrait";

export default async function ProfilePage() {
  const p = await portraitInfo(getDb());
  return (
    <div className="space-y-6">
      <PageHeader
        code="// SUBJECT PROFILE"
        title="Portrait"
        subtitle="The picture on your dossier."
      />
      <Card title="Portrait">
        <div className="grid gap-6 sm:grid-cols-[minmax(0,280px)_1fr]">
          {p.frames > 0 ? (
            <Portrait360 frames={p.frames} version={p.version} />
          ) : (
            <div className="flex aspect-[3/4] items-center justify-center rounded-xl border border-dashed border-accent/30 font-mono text-xs tracking-[0.2em] text-stone-500 uppercase">
              No portrait
            </div>
          )}
          <PortraitUploader hasPortrait={p.frames > 0} />
        </div>
      </Card>
    </div>
  );
}
