import { createContext, useContext } from "react";
import { useTranslation } from "@/app/(builder)/hooks/useTranslation";
import { Pencil } from "lucide-react";
import styles from "./ChatNodes.module.css";

export const NodeEditContext = createContext<
  ((nodeId: string) => void | Promise<void>) | null
>(null);

export default function NodeEditButton({
  id,
  floating = false,
}: {
  id: string;
  floating?: boolean;
}) {
  const onEdit = useContext(NodeEditContext);
  const { t } = useTranslation();

  if (!onEdit) return null;

  return (
    <div className={floating ? styles.nodeEditFloating : styles.nodeEditFooter}>
      <button
        type="button"
        className={`nodrag nopan nowheel ${styles.nodeEditButton}`}
        onPointerDown={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          void onEdit(id);
        }}
      >
        <Pencil size={12} aria-hidden="true" />
        {t("Edit")}
      </button>
    </div>
  );
}
