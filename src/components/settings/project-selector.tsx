'use client';

import { useRouter } from 'next/navigation';

export function ProjectSelector({
  projects,
  selectedProjectId,
}: {
  projects: { id: string; title: string }[];
  selectedProjectId: string;
}) {
  const router = useRouter();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    router.replace(`/settings/ai?projectId=${e.target.value}`);
  }

  return (
    <select
      className="rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus:outline-none focus:ring-2 focus:ring-ring"
      onChange={handleChange}
      value={selectedProjectId}
    >
      {projects.map((p) => (
        <option key={p.id} value={p.id}>
          {p.title}
        </option>
      ))}
    </select>
  );
}
