import { getNodeTypeLabel } from "./nodeTitles";

export const createNodeData = (type) => {
  const baseData = {
    title: getNodeTypeLabel(type),
    id: `${type}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
  };

  switch (type) {
    case "start":
      return { ...baseData, description: "Scenario starts here." };
    case "message":
      // --- 👇 [수정] chainNext 추가 ---
      return {
        ...baseData,
        content: "New text message",
        replies: [],
        chainNext: false,
      };
    case "slotfilling":
      return {
        ...baseData,
        content: "Enter your question.",
        slot: "newSlot",
        replies: [],
      };
    case "api":
      return {
        ...baseData,
        isMulti: false,
        method: "GET",
        url: "",
        headers: "{}",
        body: "{}",
        responseMapping: [],
        apis: [],
        chainNext: false, // --- 👈 [추가] ---
      };
    case "branch":
      return {
        ...baseData,
        evaluationType: "BUTTON",
        conditions: [
          {
            id: `cond-${Date.now()}`,
            slot: "",
            operator: "==",
            value: "",
            valueType: "value",
          },
        ],
        replies: [{ display: "Condition 1", value: `cond_${Date.now()}` }],
      };
    case "form":
      return {
        ...baseData,
        elements: [],
        dataSourceType: "json",
        dataSource: "",
        enableExcelUpload: false,
      };
    case "fixedmenu":
      return {
        ...baseData,
        content: "Fixed Menu",
        replies: [{ display: "Menu 1", value: `menu_${Date.now()}` }],
      };
    case "link":
      // --- 👇 [수정] chainNext 추가 ---
      return {
        ...baseData,
        content: "https://",
        display: "Link",
        chainNext: false,
      };
    case "llm":
      return {
        ...baseData,
        prompt: "Ask me anything...",
        outputVar: "llm_output",
        conditions: [],
        chainNext: false, // --- 👈 [추가] ---
      };
    case "toast":
      return {
        ...baseData,
        message: "This is a toast message.",
        toastType: "info",
        chainNext: false, // --- 👈 [추가] ---
      };
    case "iframe":
      return {
        ...baseData,
        url: "https://www.example.com",
        width: "250",
        height: "200",
        chainNext: false, // --- 👈 [추가] ---
      };
    case "scenario":
      return { ...baseData, label: "Imported Scenario", scenarioId: null };
    case "setSlot":
      // --- 👇 [수정] chainNext 추가 ---
      return {
        ...baseData,
        assignments: [{ key: "newSlot", value: "someValue" }],
        chainNext: false,
      };
    case "delay":
      // --- 👇 [수정] chainNext 추가 ---
      return { ...baseData, duration: 1000, chainNext: false };
    default:
      return baseData;
  }
};

export const createFormElement = (elementType) => {
  // ... (변경 없음)
  const newId = `${elementType}-${Date.now()}-${Math.random()
    .toString(36)
    .substring(2, 9)}`;
  let newElement;

  switch (elementType) {
    case "input":
      // --- 💡 수정: defaultValueSlot 제거, defaultValue 추가 ---
      newElement = {
        id: newId,
        type: "input",
        name: "",
        label: "New Input",
        placeholder: "",
        validation: { type: "text" },
        defaultValue: "",
        optionalParameter: "",
      };
      break;
    case "search":
      newElement = {
        id: newId,
        type: "search",
        name: "search_term", // 검색어 값이 저장될 키 (formData용)
        label: "New Search",
        placeholder: "Enter search term...",
        apiConfig: {
          // API 호출 설정
          url: "",
          method: "POST",
          headers: "{}", // 💡 [추가] headers 필드 추가
          bodyTemplate: '{"query": "{{value}}"}', // {{value}}가 검색어로 치환됨
        },
        resultSlot: "search_results", // API 결과가 저장될 슬롯 이름
        inputFillKey: null, // 💡 [추가] 그리드 행 클릭 시 검색 입력창에 채울 키
        optionalParameter: "",
      };
      break;
    case "date":
      newElement = {
        id: newId,
        type: "date",
        name: "",
        label: "New Date",
        defaultValue: "",
        optionalParameter: "",
      };
      break;
    case "grid": {
      // 👈 여기에 중괄호({})를 추가하여 블록 스코프를 생성했습니다.
      const rows = 2;
      const columns = 2;
      newElement = {
        id: newId,
        type: "grid",
        name: "",
        label: "New Grid",
        optionalParameter: "",
        rows: rows,
        columns: columns,
        data: Array(rows * columns).fill(""),
        displayKeys: [], // --- 💡 수정된 부분 ---
      };
      break;
    } // 👈 중괄호 닫기
    case "checkbox":
      newElement = {
        id: newId,
        type: "checkbox",
        name: "",
        label: "New Checkbox",
        options: [],
        defaultValue: [],
        optionalParameter: "",
      };
      break;
    case "radio":
      newElement = {
        id: newId,
        type: "radio",
        name: "",
        label: "New Radio",
        options: [],
        defaultValue: "",
        optionalParameter: "",
      };
      break;
    case "dropbox":
      newElement = {
        id: newId,
        type: "dropbox",
        name: "",
        label: "New Dropbox",
        options: [],
        optionsSlot: "",
        defaultValue: "",
        optionalParameter: "",
      };
      break;
    default:
      newElement = { id: newId, type: elementType };
  }
  return newElement;
};
