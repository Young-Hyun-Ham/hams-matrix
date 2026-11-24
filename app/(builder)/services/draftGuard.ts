let check: (() => boolean) | undefined;
export function registerDraftGuard(next: () => boolean) {
  check = next;
  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (next()) {
      event.preventDefault();
      event.returnValue = "";
    }
  };
  window.addEventListener("beforeunload", beforeUnload);
  return () => {
    window.removeEventListener("beforeunload", beforeUnload);
    if (check === next) check = undefined;
  };
}
export const hasBuilderDraft = () => check?.() ?? false;
