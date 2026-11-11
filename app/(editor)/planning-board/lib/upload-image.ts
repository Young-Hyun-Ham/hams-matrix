import { boardBase, planningFetch } from "./client-api";
export async function uploadImage(dataUrl: string): Promise<string> {
  if (!dataUrl.startsWith("data:")) return dataUrl;
  const blob = await (await fetch(dataUrl)).blob();
  if (blob.size > 8 * 1024 * 1024) throw new Error("이미지는 최대 8MiB입니다.");
  const response = await planningFetch(`${boardBase()}/assets`, {
    method: "POST",
    headers: { "Content-Type": blob.type },
    body: blob,
  });
  const result = await response.json();
  if (!response.ok)
    throw new RequestError(response.status, result.code, result.details);
  return result.url;
}

import { useWorkspaceMutation as useMutation } from "@/components/query/use-workspace-mutation";
import { useWorkspaceQueryPolicy } from "@/components/query/workspace-query-runtime";
import {
  RequestError,
  resolveWorkspaceError,
} from "@/lib/query/error-messages";
export function useImageUpload() {
  const { settings } = useWorkspaceQueryPolicy();
  const command = useMutation({
    mutationFn: async (dataUrl: string) => {
      try {
        return await uploadImage(dataUrl);
      } catch (error) {
        if (error instanceof RequestError)
          error.message = resolveWorkspaceError(error, settings.errorMessages);
        throw error;
      }
    },
    retry: false,
  });
  return command.mutateAsync;
}
