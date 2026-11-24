// src/hooks/useNodeController.js

/**
 * NodeController 내부의 공통 로직을 추상화하는 Custom Hook
 * @param {function} setLocalNode - NodeController의 localNode 상태를 업데이트하는 함수
 */
export const useNodeController = (setLocalNode) => {
  /**
   * data 객체 내의 특정 키 값을 변경하는 함수
   * @param {string} key - 변경할 데이터의 키
   * @param {*} value - 새로운 값
   */
  const handleLocalDataChange = (key, value) => {
    setLocalNode((prev) => ({
      ...prev,
      data: { ...prev.data, [key]: value },
    }));
  };

  // --- Reply / Branch / Menu 관련 함수들 ---

  /**
   * replies 배열에 새로운 항목을 추가하는 함수
   * 노드 타입에 따라 'New Reply', 'New Branch', 'New Menu'로 분기 처리
   */
  const addReply = () => {
    setLocalNode((prev) => {
      const nodeType = prev.type;
      const newReply = {
        display:
          nodeType === "branch"
            ? "New Branch"
            : nodeType === "fixedmenu"
              ? "New Menu"
              : "New Reply",
        value: `${nodeType === "branch" ? "cond" : nodeType === "fixedmenu" ? "menu" : "val"}_${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      };
      const newReplies = [...(prev.data.replies || []), newReply];
      return { ...prev, data: { ...prev.data, replies: newReplies } };
    });
  };

  /**
   * replies 배열의 특정 항목을 수정하는 함수
   * @param {number} index - 수정할 항목의 인덱스
   * @param {string} part - 수정할 속성 ('display' 또는 'value')
   * @param {string} value - 새로운 값
   */
  const updateReply = (index, part, value) => {
    setLocalNode((prev) => {
      const newReplies = [...prev.data.replies];
      newReplies[index] = { ...newReplies[index], [part]: value };
      return { ...prev, data: { ...prev.data, replies: newReplies } };
    });
  };

  /**
   * replies 배열에서 특정 항목을 삭제하는 함수
   * @param {number} index - 삭제할 항목의 인덱스
   */
  const deleteReply = (index) => {
    setLocalNode((prev) => {
      const newReplies = prev.data.replies.filter((_, i) => i !== index);
      return { ...prev, data: { ...prev.data, replies: newReplies } };
    });
  };

  // --- Condition 관련 함수들 (Branch 노드용) ---

  /**
   * conditions 배열에 새로운 조건을 추가하고,
   * 이에 대응하는 reply 항목도 함께 추가하는 함수
   */
  const addCondition = () => {
    setLocalNode((prev) => {
      // --- 💡 수정된 부분 시작 ---
      const newConditions = [
        ...(prev.data.conditions || []),
        {
          id: `cond-${Date.now()}`,
          slot: "",
          operator: "==",
          value: "",
          valueType: "value",
        },
      ];
      // --- 💡 수정된 부분 끝 ---
      const newReplies = [
        ...(prev.data.replies || []),
        {
          display: `Condition ${newConditions.length}`,
          value: `cond_${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        },
      ];
      return {
        ...prev,
        data: { ...prev.data, conditions: newConditions, replies: newReplies },
      };
    });
  };

  /**
   * conditions 배열의 특정 조건을 수정하는 함수
   * @param {number} index - 수정할 조건의 인덱스
   * @param {string} part - 수정할 속성 ('slot', 'operator', 'value')
   * @param {string} value - 새로운 값
   */
  const updateCondition = (index, part, value) => {
    setLocalNode((prev) => {
      const newConditions = [...(prev.data.conditions || [])];
      newConditions[index] = { ...newConditions[index], [part]: value };
      return { ...prev, data: { ...prev.data, conditions: newConditions } };
    });
  };

  /**
   * conditions 배열에서 특정 조건을 삭제하고,
   * 이에 대응하는 reply 항목도 함께 삭제하는 함수
   * @param {number} index - 삭제할 조건의 인덱스
   */
  const deleteCondition = (index) => {
    setLocalNode((prev) => {
      const newConditions = prev.data.conditions.filter((_, i) => i !== index);
      const newReplies = prev.data.replies.filter((_, i) => i !== index);
      return {
        ...prev,
        data: { ...prev.data, conditions: newConditions, replies: newReplies },
      };
    });
  };

  return {
    handleLocalDataChange,
    addReply,
    updateReply,
    deleteReply,
    addCondition,
    updateCondition,
    deleteCondition,
  };
};
