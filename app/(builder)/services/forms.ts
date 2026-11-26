import type { FormDataJson, FormElement } from "../form-builder/type";
import { builderList, builderRequest } from "./transport";

export type SavedForm = {
  id: string;
  title: string;
  elements: FormElement[];
  definition?: Partial<FormDataJson>;
  createdAt: string;
  updatedAt: string;
  revision: number;
};

export const listForms = () => builderList<SavedForm>("/forms");

export async function getForm(id: string) {
  return (
    await builderRequest<{ form: SavedForm }>(
      "/forms/" + encodeURIComponent(id),
    )
  ).form;
}

export function formDefinition(form: SavedForm): Partial<FormDataJson> {
  return {
    ...form.definition,
    revision: form.revision,
    data: {
      ...form.definition?.data,
      id: form.definition?.data?.id ?? form.id,
      title: form.title,
      elements: form.elements,
    },
  };
}

export function summarizeElements(elements: FormElement[] = []) {
  const counts = new Map<string, number>();
  for (const element of elements)
    counts.set(element.type, (counts.get(element.type) ?? 0) + 1);
  return (
    Array.from(counts, ([type, count]) => type + " " + count).join(", ") || "-"
  );
}

export const formListPath = "/form-builder/list";
export const formListReturn = (value: string | null) =>
  value?.startsWith(formListPath + "?") ? value : formListPath;
