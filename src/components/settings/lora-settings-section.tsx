'use client';

import { ExternalServiceEndpointForm } from '@/components/settings/external-service-endpoint-form';
import type { Lora } from '@/lib/db/queries/loras';

export function LoraSettingsSection({
  projectId,
  initialLoras,
  activeLoraId,
}: {
  projectId: string;
  initialLoras: Lora[];
  activeLoraId: string | null;
}) {
  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">LoRA API</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          학습 프로세스와 GPU는 외부 서비스가 관리합니다. Muse Novel은 API
          주소 저장과 연결 테스트만 수행합니다.
        </p>
      </div>

      <ExternalServiceEndpointForm
        defaultUrl="http://127.0.0.1:8331"
        description="현재는 GET /health 연결 테스트만 지원합니다. 학습 호출 규격은 외부 API 계약이 확정된 뒤 연결합니다."
        projectId={projectId}
        serviceType="lora-training"
        title="LoRA 학습 API"
      />

      {initialLoras.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium">기존 LoRA 기록</h3>
          <div className="divide-y divide-border rounded-md border border-border">
            {initialLoras.map((lora) => (
              <div className="px-4 py-3" key={lora.id}>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{lora.name}</span>
                  {lora.id === activeLoraId && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary text-xs">
                      기존 활성 기록
                    </span>
                  )}
                </div>
                <p className="mt-1 break-all text-muted-foreground text-xs">
                  {lora.filePath}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
