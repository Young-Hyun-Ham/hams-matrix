let blocked: (() => boolean) | undefined;
let check: (() => boolean) | undefined;
export function registerDraftGuard(
  next: () => boolean,
  isBlocked?: () => boolean,
) {
  check = next;
  blocked = isBlocked;
  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (next() || isBlocked?.()) {
      event.preventDefault();
      event.returnValue = "";
    }
  };
  window.addEventListener("beforeunload", beforeUnload);
  return () => {
    window.removeEventListener("beforeunload", beforeUnload);
    if (check === next) {
      check = undefined;
      blocked = undefined;
    }
  };
}
export const hasBuilderDraft = () => check?.() ?? false;

export const isBuilderNavigationBlocked = () => blocked?.() ?? false;
