"use client";
import { toast } from "@/stores/toast";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Plan } from "@/lib/plan-types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWorkspaceMutation as useMutation } from "@/components/query/use-workspace-mutation";
import { useWorkspaceQueryPolicy } from "@/components/query/workspace-query-runtime";
import { matrixKeys } from "@/lib/query/keys";
import { requestJson } from "@/lib/query/browser-fetch";
import { resolveWorkspaceError } from "@/lib/query/error-messages";
export function PlanAdmin({ initialPlans }: { initialPlans: Plan[] }) {
  const router = useRouter();
  const { scope, policy, settings } = useWorkspaceQueryPolicy();
  const client = useQueryClient();
  const queryKey = [...matrixKeys.scope(scope), "super-admin", "plans"];
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      requestJson<{ plans: Plan[] }>("/api/super-admin/plans", { signal }),
    ...policy,
    initialData: { plans: initialPlans },
  });
  const plans = query.data.plans;
  const mutation = useMutation({
    mutationFn: (data: object) =>
      requestJson<{ plans: Plan[] }>("/api/super-admin/plans", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    retry: false,
  });
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  async function save(event: FormEvent<HTMLFormElement>, plan: Plan) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setNotice("");
    const numeric = (key: string) =>
      form.get(key) === "" ? null : Number(form.get(key));
    try {
      const result = await mutation.mutateAsync({
        code: plan.code,
        version: plan.version,
        priceMode: form.get("priceMode"),
        monthlyPrice: numeric("monthlyPrice"),
        yearlyPrice: numeric("yearlyPrice"),
        monthlyDiscountPrice: numeric("monthlyDiscountPrice"),
        yearlyDiscountPrice: numeric("yearlyDiscountPrice"),
        projectLimit: numeric("projectLimit"),
        projectInviteLimit: numeric("projectInviteLimit"),
        tokenLimit: numeric("tokenLimit"),
        dailyImageLimit: numeric("dailyImageLimit"),
        attachmentLimit: numeric("attachmentLimit"),
        historyEnabled: form.has("historyEnabled"),
        teamSharingEnabled: form.has("teamSharingEnabled"),
        recommended: form.has("recommended"),
      });
      client.setQueryData(queryKey, result);
      void client.invalidateQueries({
        queryKey: [...matrixKeys.scope(scope), "subscription"],
      });
      void client.invalidateQueries({
        queryKey: [...matrixKeys.scope(scope), "workspaces"],
      });
      router.refresh();
      setNotice("플랜 설정을 저장했습니다.");
      toast("플랜 설정을 저장했습니다.");
    } catch (error) {
      setNotice(resolveWorkspaceError(error, settings.errorMessages));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="plan-admin">
      <p className="muted">
        금액은 원 단위입니다. 할인 가격은 선택 사항이며 기존 가격보다 낮아야
        합니다. 연간 가격의 빈 값은 미정, 자원 한도의 빈 값은 무제한입니다.
        첨부는 최대 5개입니다. 프로젝트당 팀 초대 인원은 소유자를 제외하며, 빈
        값은 무제한, 0은 초대 불가입니다. 팀공유를 켠 요금제에 적용됩니다.
      </p>
      {notice && (
        <p role="status" className="panel">
          {notice}
        </p>
      )}
      <div className="plan-grid">
        {plans.map((plan) => (
          <form
            className="panel"
            key={`${plan.code}-${plan.version}`}
            onSubmit={(event) => void save(event, plan)}
          >
            <fieldset disabled={busy}>
              <h2>{plan.name}</h2>
              <label>
                가격 방식
                <select name="priceMode" defaultValue={plan.priceMode}>
                  <option value="fixed">정액</option>
                  <option value="contact">협의</option>
                </select>
              </label>
              {(
                [
                  ["monthlyPrice", "월간 가격"],
                  ["monthlyDiscountPrice", "월간 할인 가격"],
                  ["yearlyPrice", "연간 가격"],
                  ["yearlyDiscountPrice", "연간 할인 가격"],
                  ["projectLimit", "프로젝트 수"],
                  ["projectInviteLimit", "프로젝트당 팀 초대 인원"],
                  ["tokenLimit", "총 토큰"],
                  ["dailyImageLimit", "일일 이미지"],
                  ["attachmentLimit", "첨부 이미지"],
                ] as const
              ).map(([key, label]) => (
                <label key={key}>
                  {label}
                  <input
                    type="number"
                    name={key}
                    defaultValue={
                      plan[key] == null || !Number.isFinite(plan[key])
                        ? ""
                        : plan[key]
                    }
                    min={0}
                    max={key === "attachmentLimit" ? 5 : undefined}
                    step={1}
                    required={key === "attachmentLimit"}
                  />
                </label>
              ))}
              <label className="check">
                <input
                  type="checkbox"
                  name="historyEnabled"
                  defaultChecked={plan.historyEnabled}
                />
                이력 생성
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  name="teamSharingEnabled"
                  defaultChecked={plan.teamSharingEnabled}
                />
                팀공유
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  name="recommended"
                  defaultChecked={plan.recommended}
                />
                추천 표시
              </label>
              <button className="button primary">저장</button>
            </fieldset>
          </form>
        ))}
      </div>
      <style jsx>{`
        .plan-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 16px;
          margin: 24px 0;
        }
        .panel {
          padding: 22px;
        }
        fieldset {
          border: 0;
          padding: 0;
          margin: 0;
          min-width: 0;
        }
        label {
          display: grid;
          gap: 6px;
          margin-bottom: 14px;
          font-size: 12px;
        }
        input,
        select {
          border: 1px solid var(--line);
          border-radius: 7px;
          background: var(--surface);
          color: var(--ink);
          padding: 9px;
          max-width: 100%;
        }
        .check {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .member-row {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
          padding: 14px 0;
          border-top: 1px solid var(--line);
        }
        .member-row > span:first-child {
          flex: 1;
          min-width: 180px;
        }
        .member-row small {
          display: block;
          color: var(--muted);
          margin-top: 4px;
        }
      `}</style>
    </div>
  );
}
