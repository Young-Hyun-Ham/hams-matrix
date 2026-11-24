import { useTranslation } from "@/app/(builder)/hooks/useTranslation";

import CanvasElement from "../../form-builder/components/CanvasElement";
import { FormElement } from "../../form-builder/type";
import { useBuilderStore } from "../../store/index";
import styles from "./ChatNodes.module.css";
import NodeWrapper from "./NodeWrapper";
import NodeTypeIcon from "../icons/NodeTypeIcon";

type FormNodeProps = {
  id: string;
  data: {
    title?: string;
    enableExcelUpload?: boolean;
    elements?: FormElement[];
  };
};

/** Keep the flow canvas in sync by reusing the form builder preview. */
function FormNode({ id, data }: FormNodeProps) {
  const { t } = useTranslation();
  const nodeColor = useBuilderStore((state) => state.nodeColors.form);
  const textColor = useBuilderStore((state) => state.nodeTextColors.form);

  return (
    <NodeWrapper
      id={id}
      typeLabel="Form"
      icon={<NodeTypeIcon type="form" />}
      nodeColor={nodeColor}
      textColor={textColor}
      customClassName={styles.formNodeWrapper}
    >
      <div className={styles.section}>
        <input
          className={`${styles.textInput} ${styles.formTitleInput}`}
          value={data.title ?? ""}
          readOnly
          placeholder={t("Form Title")}
        />
        {data.enableExcelUpload && (
          <div className={styles.formFeatureIndicator}>
            ({t("Excel Upload Enabled")})
          </div>
        )}
      </div>

      <div className={styles.formBuilderPreview}>
        {data.elements?.length ? (
          data.elements.map((element) => (
            <CanvasElement
              key={element.id}
              element={element}
              selected={false}
              onSelect={(event) => event.stopPropagation()}
            />
          ))
        ) : (
          <div className={styles.formElementsPlaceholder}>
            {t("No elements added yet")}.
          </div>
        )}
      </div>
    </NodeWrapper>
  );
}

export default FormNode;
