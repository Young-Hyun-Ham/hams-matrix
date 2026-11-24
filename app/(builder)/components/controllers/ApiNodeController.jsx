import { useState, useEffect } from "react";
import { useModal } from "@/app/(builder)/providers/ModalProvider";

import styles from "../NodeController.module.css";
import * as backendService from "../../services/backendService";

import { useNodeController } from "./hooks/useNodeController";
import ChainNextCheckbox from "./common/ChainNextCheckbox";

import { useTranslation } from "@/app/(builder)/hooks/useTranslation";

const DEFAULT_API_HEADERS = JSON.stringify(
  { "Content-Type": "application/json", Accept: "application/json" },
  null,
  2,
);

const initializeApiHeaders = (headers) => {
  if (!headers) return DEFAULT_API_HEADERS;
  if (typeof headers === "string" && /^\{\s*\}$/.test(headers.trim())) {
    return DEFAULT_API_HEADERS;
  }
  return headers;
};

function ApiCallEditor({ apiCall, onUpdate, onDelete, onTest, isTesting }) {
  const { t } = useTranslation();
  const handleUpdate = (field, value) => {
    onUpdate({ ...apiCall, [field]: value });
  };

  const handleMappingChange = (index, part, value) => {
    const newMapping = [...(apiCall.responseMapping || [])];
    newMapping[index] = { ...newMapping[index], [part]: value };
    handleUpdate("responseMapping", newMapping);
  };

  const addMapping = () => {
    const newMapping = [
      ...(apiCall.responseMapping || []),
      { path: "", slot: "" },
    ];
    handleUpdate("responseMapping", newMapping);
  };

  const deleteMapping = (index) => {
    const newMapping = (apiCall.responseMapping || []).filter(
      (_, i) => i !== index,
    );
    handleUpdate("responseMapping", newMapping);
  };

  return (
    <div className={styles.elementEditor}>
      <div className={styles.formGroup}>
        <label>{t("API Call Name")}</label>
        <input
          type="text"
          value={apiCall.name || ""}
          onChange={(e) => handleUpdate("name", e.target.value)}
        />
      </div>
      <div className={styles.formGroup}>
        <label>{t("Method")}</label>
        <select
          value={apiCall.method || "GET"}
          onChange={(e) => handleUpdate("method", e.target.value)}
        >
          <option value="GET">GET</option>
          <option value="POST">POST</option>
          <option value="PUT">PUT</option>
          <option value="DELETE">DELETE</option>
        </select>
      </div>
      <div className={styles.formGroup}>
        <label>{t("URL")}</label>
        <input
          type="text"
          value={apiCall.url || ""}
          onChange={(e) => handleUpdate("url", e.target.value)}
        />
      </div>
      <div className={styles.formGroup}>
        <label>
          {t("Headers")} ({t("JSON")})
        </label>
        <textarea
          value={apiCall.headers || DEFAULT_API_HEADERS}
          onChange={(e) => handleUpdate("headers", e.target.value)}
          rows={4}
        />
      </div>
      {apiCall.method !== "GET" && (
        <div className={styles.formGroup}>
          <label>
            {t("Body")} ({t("JSON")})
          </label>
          <textarea
            value={apiCall.body || "{}"}
            onChange={(e) => handleUpdate("body", e.target.value)}
            rows={6}
          />
        </div>
      )}
      <div className={styles.separator} />
      <div className={styles.formGroup}>
        <label>{t("Response Mapping")}</label>
        <div className={styles.repliesContainer}>
          {(apiCall.responseMapping || []).map((mapping, index) => (
            <div key={index} className={styles.quickReply}>
              <input
                className={styles.quickReplyInput}
                value={mapping.path}
                onChange={(e) =>
                  handleMappingChange(index, "path", e.target.value)
                }
                placeholder="JSON Path (e.g., data.name)"
              />
              <input
                className={styles.quickReplyInput}
                value={mapping.slot}
                onChange={(e) =>
                  handleMappingChange(index, "slot", e.target.value)
                }
                placeholder={t("Slot Name")}
              />
              <button
                onClick={() => deleteMapping(index)}
                className={styles.deleteReplyButton}
              >
                ×
              </button>
            </div>
          ))}
          <button onClick={addMapping} className={styles.addReplyButton}>
            + {t("Add Mapping")}
          </button>
        </div>
      </div>
      <div className={styles.editorActions}>
        <button
          className={styles.testApiButton}
          onClick={() => onTest(apiCall)}
          disabled={isTesting}
        >
          {isTesting ? t("Testing...") : t("Test")}
        </button>
        <button
          className={styles.deleteElementButton}
          onClick={() => onDelete(apiCall.id)}
        >
          {t("Delete")}
        </button>
      </div>
    </div>
  );
}

function ApiNodeController({ localNode, setLocalNode }) {
  useEffect(() => {
    setLocalNode((node) => {
      if (!node) return node;
      const headers = initializeApiHeaders(node.data.headers);
      const apis = node.data.apis?.map((api) => {
        const apiHeaders = initializeApiHeaders(api.headers);
        return apiHeaders === api.headers
          ? api
          : { ...api, headers: apiHeaders };
      });
      if (
        headers === node.data.headers &&
        (!apis || apis.every((api, index) => api === node.data.apis[index]))
      ) {
        return node;
      }
      return {
        ...node,
        data: { ...node.data, headers, ...(apis ? { apis } : {}) },
      };
    });
  }, [localNode.id, setLocalNode]);

  const { showAlert, showConfirm } = useModal();
  const [selectedApiCallId, setSelectedApiCallId] = useState(null);
  // 3. 훅 사용 및 로컬 함수 제거
  const { handleLocalDataChange } = useNodeController(setLocalNode);

  const [isTestingSingle, setIsTestingSingle] = useState(false);
  const [testingApiCallId, setTestingApiCallId] = useState(null);

  // 20260325 - hyh
  const { t } = useTranslation();
  const handleTestApiCall = async (apiCall) => {
    if (localNode.data.isMulti) {
      if (testingApiCallId) return;
      setTestingApiCallId(apiCall.id);
    } else {
      if (isTestingSingle) return;
      setIsTestingSingle(true);
    }

    try {
      const result = await backendService.testApiCall(apiCall);
      await showAlert(
        `API Test Success!\n\nResponse:\n${JSON.stringify(result, null, 2)}`,
      );
    } catch (error) {
      await showAlert(`API Test Failed:\n${error.message}`);
    } finally {
      if (localNode.data.isMulti) {
        setTestingApiCallId(null);
      } else {
        setIsTestingSingle(false);
      }
    }
  };

  const handleApiMultiToggle = async (e) => {
    const isMulti = e.target.checked;

    if (!isMulti && (localNode.data.apis?.length || 0) > 1) {
      const confirmed = await showConfirm(
        t(
          "Disabling Multi API will keep only the first API call's configuration. All other API calls will be removed. Are you sure you want to continue?",
        ),
      );
      if (!confirmed) {
        e.target.checked = true;
        return;
      }
    }

    setLocalNode((prev) => {
      const newData = { ...prev.data, isMulti };
      if (isMulti) {
        if (!newData.apis || newData.apis.length === 0) {
          newData.apis = [
            {
              id: `api-call-${Date.now()}`,
              name: "API Call 1",
              method: prev.data.method,
              url: prev.data.url,
              headers: prev.data.headers || DEFAULT_API_HEADERS,
              body: prev.data.body,
              responseMapping: prev.data.responseMapping,
            },
          ];
        }
      } else {
        const firstApi = prev.data.apis?.[0] || {};
        newData.method = firstApi.method || "GET";
        newData.url = firstApi.url || "";
        newData.headers = firstApi.headers || DEFAULT_API_HEADERS;
        newData.body = firstApi.body || "{}";
        newData.responseMapping = firstApi.responseMapping || [];
        newData.apis = [];
      }
      return { ...prev, data: newData };
    });
  };

  const renderSingleApiControls = () => {
    const { data } = localNode;
    // 4. 훅의 handleLocalDataChange를 사용하도록 수정
    const handleMappingChange = (index, part, value) => {
      const newMapping = [...(data.responseMapping || [])];
      newMapping[index] = { ...newMapping[index], [part]: value };
      handleLocalDataChange("responseMapping", newMapping); // 훅 함수 사용
    };
    const addMapping = () => {
      const newMapping = [
        ...(data.responseMapping || []),
        { path: "", slot: "" },
      ];
      handleLocalDataChange("responseMapping", newMapping); // 훅 함수 사용
    };
    const deleteMapping = (index) => {
      const newMapping = (data.responseMapping || []).filter(
        (_, i) => i !== index,
      );
      handleLocalDataChange("responseMapping", newMapping); // 훅 함수 사용
    };

    return (
      <>
        <div className={styles.formGroup}>
          <label>{t("Method")}</label>
          <select
            value={data.method || "GET"}
            onChange={(e) => handleLocalDataChange("method", e.target.value)}
          >
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="DELETE">DELETE</option>
          </select>
        </div>
        <div className={styles.formGroup}>
          <label>{t("URL")}</label>
          <input
            type="text"
            value={data.url || ""}
            onChange={(e) => handleLocalDataChange("url", e.target.value)}
          />
        </div>
        <div className={styles.formGroup}>
          <label>
            {t("Headers")} ({t("JSON")})
          </label>
          <textarea
            value={data.headers || DEFAULT_API_HEADERS}
            onChange={(e) => handleLocalDataChange("headers", e.target.value)}
            rows={4}
          />
        </div>
        {data.method !== "GET" && (
          <div className={styles.formGroup}>
            <label>
              {t("Body")} ({t("JSON")})
            </label>
            <textarea
              value={data.body || "{}"}
              onChange={(e) => handleLocalDataChange("body", e.target.value)}
              rows={6}
            />
          </div>
        )}
        <div className={styles.separator} />
        <div className={styles.formGroup}>
          <label>{t("Response Mapping")}</label>
          <div className={styles.repliesContainer}>
            {(data.responseMapping || []).map((mapping, index) => (
              <div key={index} className={styles.quickReply}>
                <input
                  className={styles.quickReplyInput}
                  value={mapping.path}
                  onChange={(e) =>
                    handleMappingChange(index, "path", e.target.value)
                  }
                  placeholder={t("JSON Path (e.g., data.name)")}
                />
                <input
                  className={styles.quickReplyInput}
                  value={mapping.slot}
                  onChange={(e) =>
                    handleMappingChange(index, "slot", e.target.value)
                  }
                  placeholder={t("Slot Name")}
                />
                <button
                  onClick={() => deleteMapping(index)}
                  className={styles.deleteReplyButton}
                >
                  ×
                </button>
              </div>
            ))}
            <button onClick={addMapping} className={styles.addReplyButton}>
              + {t("Add Mapping")}
            </button>
          </div>
        </div>
      </>
    );
  };

  const renderMultiApiControls = () => {
    const apis = localNode.data.apis || [];
    const selectedApiCall = apis.find((api) => api.id === selectedApiCallId);

    const handleAddApiCall = () => {
      const newApiCall = {
        id: `api-call-${Date.now()}`,
        name: `API Call ${apis.length + 1}`,
        method: "GET",
        url: "",
        headers: DEFAULT_API_HEADERS,
        body: "{}",
        responseMapping: [],
      };
      handleLocalDataChange("apis", [...apis, newApiCall]); // 훅 함수 사용
    };
    const handleUpdateApiCall = (updatedApiCall) => {
      const newApis = apis.map((api) =>
        api.id === updatedApiCall.id ? updatedApiCall : api,
      );
      handleLocalDataChange("apis", newApis); // 훅 함수 사용
    };
    const handleDeleteApiCall = (apiIdToDelete) => {
      const newApis = apis.filter((api) => api.id !== apiIdToDelete);
      handleLocalDataChange("apis", newApis); // 훅 함수 사용
      if (selectedApiCallId === apiIdToDelete) {
        setSelectedApiCallId(null);
      }
    };

    return (
      <>
        <div className={styles.formGroup}>
          <label>{t("API Calls")}</label>
          <div className={styles.elementsContainer}>
            {apis.map((api) => (
              <div
                key={api.id}
                className={`${styles.elementItem} ${api.id === selectedApiCallId ? styles.selected : ""}`}
                onClick={() => setSelectedApiCallId(api.id)}
              >
                <span>{api.name || t("API Call")}</span>
              </div>
            ))}
            <button
              onClick={handleAddApiCall}
              className={styles.addReplyButton}
            >
              + {t("Add API Call")}
            </button>
          </div>
        </div>
        <div className={styles.separator} />
        {selectedApiCall && (
          <ApiCallEditor
            apiCall={selectedApiCall}
            onUpdate={handleUpdateApiCall}
            onDelete={handleDeleteApiCall}
            onTest={handleTestApiCall}
            isTesting={testingApiCallId === selectedApiCall.id}
          />
        )}
      </>
    );
  };

  return (
    <>
      <div className={styles.apiMultiToggle}>
        <label htmlFor="multiApiToggle">{t("Enable Multi API")}</label>
        <input
          type="checkbox"
          id="multiApiToggle"
          checked={localNode.data.isMulti || false}
          onChange={handleApiMultiToggle}
        />
      </div>
      {/* 기존 UI를 공통 컴포넌트로 대체 */}
      <ChainNextCheckbox
        checked={localNode.data.chainNext}
        onChange={(value) => handleLocalDataChange("chainNext", value)}
      />
      <div className={styles.separator} />
      {localNode.data.isMulti
        ? renderMultiApiControls()
        : renderSingleApiControls()}
    </>
  );
}

export default ApiNodeController;
