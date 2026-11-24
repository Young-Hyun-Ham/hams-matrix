import { useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { useTranslation } from "@/app/(builder)/hooks/useTranslation";
import { useBuilderStore } from "../../store";
import { getNodeTitle } from "../../utils/nodeTitles";
import { useModal } from "@/app/(builder)/providers/ModalProvider";
import styles from "./ChatNodes.module.css";

export default function NodeTitle({
  id,
  typeLabel,
}: {
  id: string;
  typeLabel: string;
}) {
  const { t } = useTranslation();
  const { showAlert } = useModal();
  const node = useBuilderStore((state) =>
    state.nodes.find((item) => item.id === id),
  );
  const updateNodeData = useBuilderStore((state) => state.updateNodeData);
  const loadingUserData = useBuilderStore((state) => state.loadingUserData);
  const title = getNodeTitle(node?.type || "", node?.data, typeLabel);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const editing = useRef(false);

  const beginEditing = async () => {
    const userInfo = await loadingUserData();
    const current = useBuilderStore
      .getState()
      .nodes.find((item) => item.id === id);
    if (!current) return;
    if (userInfo.unuseNodes?.includes(current.type || "")) {
      showAlert(t("The node does not have modification privileges"));
      return;
    }
    setDraft(getNodeTitle(current.type || "", current.data, typeLabel));
    editing.current = true;
    setIsEditing(true);
  };

  const finishEditing = (cancel = false) => {
    if (!editing.current) return;
    editing.current = false;
    if (!cancel) {
      const nextTitle = draft.trim() || typeLabel;
      const current = useBuilderStore
        .getState()
        .nodes.find((item) => item.id === id);
      if (current && current.data?.title !== nextTitle) {
        updateNodeData(id, { title: nextTitle });
      }
    }
    setIsEditing(false);
  };

  return (
    <span
      className={`nodrag nopan nowheel ${styles.nodeTitleEditor}`}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {isEditing ? (
        <input
          className={styles.nodeTitleInput}
          autoFocus
          value={draft}
          aria-label={t("Node title")}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => finishEditing()}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.nativeEvent.isComposing) return;
            if (event.key === "Enter" || event.key === "Escape") {
              event.preventDefault();
              finishEditing(event.key === "Escape");
            }
          }}
        />
      ) : (
        <>
          <span className={styles.nodeTitleText} title={title}>
            {title}
          </span>
          <button
            type="button"
            className={styles.nodeTitleEditButton}
            title={t("Edit title")}
            aria-label={t("Edit title")}
            onClick={() => void beginEditing()}
          >
            <Pencil size={12} />
          </button>
        </>
      )}
    </span>
  );
}
