export const dynamic = 'force-dynamic';

import { Toaster } from 'sonner';
import { GlobalStyleProfilesSection } from '@/components/settings/global-style-profiles-section';
import { db } from '@/lib/db';
import { listAllWritingStyleProfiles } from '@/lib/db/queries/writing-style-profiles';

export default async function StyleProfilesSettingsPage() {
  const profiles = await listAllWritingStyleProfiles(db);

  return (
    <>
      <Toaster position="top-right" richColors />
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">문체 스타일 설정</h1>
        <GlobalStyleProfilesSection initialProfiles={profiles} />
      </div>
    </>
  );
}
