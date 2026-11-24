import { useState, useEffect } from "react";
import styles from "../NodeController.module.css";
import { useNodeController } from "./hooks/useNodeController";
import ChainNextCheckbox from "./common/ChainNextCheckbox";
import { useTranslation } from "@/app/(builder)/hooks/useTranslation";

function MessageNodeController({ localNode, setLocalNode }) {
  const { t } = useTranslation();
  const { data } = localNode;
  const { handleLocalDataChange, addReply, updateReply, deleteReply } =
    useNodeController(setLocalNode);

  const [loadingData, setLoadingData] = useState({ msgId: "" });
  const onClickLangeuage = () => {
    setLoadingData(MOCK_DATA);
    handleLocalDataChange("content", MOCK_DATA.textKo);

    handleLocalDataChange("msgId", MOCK_DATA.msgId);
    handleLocalDataChange("textKo", MOCK_DATA.textKo);
    handleLocalDataChange("textEn", MOCK_DATA.textEn);
    handleLocalDataChange("textJp", MOCK_DATA.textJp);
    handleLocalDataChange("textVn", MOCK_DATA.textVn);
  };

  const onChangeLanguage = (value) => {
    switch (value) {
      case "ko":
        handleLocalDataChange("content", MOCK_DATA.textKo);
        break;
      case "en":
        handleLocalDataChange("content", MOCK_DATA.textEn);
        break;
      case "jp":
        handleLocalDataChange("content", MOCK_DATA.textJp);
        break;
      case "vn":
        handleLocalDataChange("content", MOCK_DATA.textVn);
        break;
      default:
        handleLocalDataChange("content", MOCK_DATA.textEn);
        break;
    }
  };
  return (
    <>
      <div className={styles.formGroup}>
        <label>{t("Content")}</label>
        <textarea
          value={data.content || ""}
          onChange={(e) => handleLocalDataChange("content", e.target.value)}
          rows={4}
        />
      </div>
      {/* 2. 기존 UI를 공통 컴포넌트로 대체 */}
      <ChainNextCheckbox
        checked={data.chainNext}
        onChange={(value) => handleLocalDataChange("chainNext", value)}
      />
    </>
  );
}

export default MessageNodeController;
