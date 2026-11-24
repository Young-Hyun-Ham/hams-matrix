// src/components/simulator/MessageRenderer.jsx

import React, { useRef, useEffect } from "react";
import { useBuilderStore } from "../../store/index";
import styles from "../ChatbotSimulator.module.css";
import { interpolateMessage } from "../../utils/simulatorUtils";
import { toLocaleTimeValue } from "../../utils/util";
import { useTranslation } from "@/app/(builder)/hooks/useTranslation";

const FormMultiSelect = ({
  options,
  value,
  placeholder,
  disabled,
  onChange,
}) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const containerRef = useRef(null);
  const selectedValues = Array.isArray(value) ? value.map(String) : [];

  useEffect(() => {
    if (!isOpen) return undefined;

    const closeOnOutsideClick = (event) => {
      if (!containerRef.current?.contains(event.target)) setIsOpen(false);
    };

    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [isOpen]);

  return (
    <div className={styles.multiSelect} ref={containerRef}>
      <button
        type="button"
        className={`${styles.multiSelectControl} ${isOpen ? styles.multiSelectControlOpen : ""}`}
        onClick={() => !disabled && setIsOpen((open) => !open)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className={styles.multiSelectValues}>
          {selectedValues.length ? (
            selectedValues.map((selectedValue) => (
              <span className={styles.multiSelectChip} key={selectedValue}>
                {options.find((option) => option.value === selectedValue)
                  ?.label ?? selectedValue}
              </span>
            ))
          ) : (
            <span className={styles.multiSelectPlaceholder}>{placeholder}</span>
          )}
        </span>
        <span className={styles.multiSelectArrow} aria-hidden="true" />
      </button>

      {isOpen && !disabled && (
        <div
          className={styles.multiSelectMenu}
          role="listbox"
          aria-multiselectable="true"
        >
          {options.map((option) => {
            const checked = selectedValues.includes(option.value);
            return (
              <label className={styles.multiSelectOption} key={option.value}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() =>
                    onChange(
                      checked
                        ? selectedValues.filter((item) => item !== option.value)
                        : [...selectedValues, option.value],
                    )
                  }
                />
                <span>{option.label}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
};

const BotMessagePart = ({
  part,
  slots,
  onOptionClick,
  onFormSubmit,
  onFormDefault,
  isCompleted,
  formData,
  handleFormInputChange,
  handleFormMultiInputChange,
  formElementOverrides,
  handleGridRowClick,
  onExcelUpload,
  handleFormElementApiCall,
}) => {
  const { t } = useTranslation();
  const isGridRowSelected = (rowData, gridKey) =>
    (Array.isArray(formData[gridKey]) ? formData[gridKey] : []).some(
      (selectedRow) => {
        if (selectedRow === rowData) return true;
        try {
          return JSON.stringify(selectedRow) === JSON.stringify(rowData);
        } catch {
          return false;
        }
      },
    );

  const normalizeOption = (option, fallbackIndex) => {
    if (option && typeof option === "object") {
      const value = option.value ?? `Option ${fallbackIndex + 1}`;
      return {
        value: String(value),
        label: String(option.label ?? value),
        param: option.param,
      };
    }

    const value = option ?? `Option ${fallbackIndex + 1}`;
    return {
      value: String(value),
      label: String(value),
    };
  };

  const getFormElementKey = (element, fallback = "") =>
    element?.name || element?.id || fallback;

  const createOptionParams = (element, selectedValues) =>
    Object.fromEntries(
      (element.options || []).map((item, index) => {
        const option = normalizeOption(item, index);
        return [
          option.param?.trim() || option.value,
          selectedValues.includes(option.value) ? "Y" : "N",
        ];
      }),
    );

  const addDays = (dateString, days) => {
    if (!dateString || !days) return dateString;
    const [year, month, day] = dateString.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  };

  if (!part) return null;
  const { type, data, nodeId, linkData } = part; // part에서 데이터 추출

  if (type === "ynBranch" || data?.isSimpleYN) {
    return null;
  }

  if (type === "iframe") {
    return (
      <div
        className={`${styles.message} ${styles.botMessage} ${styles.iframeContainer}`}
      >
        <iframe
          src={interpolateMessage(data.url, slots)}
          width={data.width || "100%"}
          height={data.height || "250"}
          style={{ border: "none", borderRadius: "18px" }}
          title={t("chatbot-iframe")}
        ></iframe>
      </div>
    );
  }

  if (type === "link") {
    if (linkData) {
      return (
        <div style={{ marginTop: "8px" }}>
          <span>{t("Opening link")}: </span>
          <a href={linkData.url} target="_blank" rel="noopener noreferrer">
            {linkData.display || linkData.url}
          </a>
        </div>
      );
    }
    return null;
  }

  if (type === "form") {
    const elements = formElementOverrides?.[nodeId] || data.elements || [];
    return (
      <div className={styles.formContainer} style={{ width: "100%" }}>
        <h3>{interpolateMessage(data.title, slots)}</h3>
        {elements.map((el, elementIndex) => {
          const elementKey = getFormElementKey(el, `element-${elementIndex}`);
          const dateProps = {};
          if (el.type === "date") {
            if (el.validation?.type === "today after")
              dateProps.min = new Date().toISOString().split("T")[0];
            else if (el.validation?.type === "today before")
              dateProps.max = new Date().toISOString().split("T")[0];
            else if (el.validation?.type === "custom") {
              if (el.validation.startDate)
                dateProps.min = el.validation.startDate;
              if (el.validation.endDate) dateProps.max = el.validation.endDate;
            }
          }

          if (el.type === "grid") {
            const gridDataFromSlot = el.optionsSlot
              ? slots[el.optionsSlot]
              : null;
            const hasSlotData =
              Array.isArray(gridDataFromSlot) && gridDataFromSlot.length > 0;

            if (hasSlotData) {
              const isDynamicObjectArray =
                typeof gridDataFromSlot[0] === "object" &&
                gridDataFromSlot[0] !== null &&
                !Array.isArray(gridDataFromSlot[0]);
              if (isDynamicObjectArray) {
                // --- [수정] displayKeys 파싱 로직 변경 ---
                // 1. displayKeys가 정의되었는지 확인
                const hasDisplayKeys =
                  el.displayKeys && el.displayKeys.length > 0;

                // 2. keyObject 배열 생성 (데이터 호환성 보장)
                const keyObjects = (
                  hasDisplayKeys
                    ? el.displayKeys
                    : Object.keys(gridDataFromSlot[0] || {})
                )
                  .map((k) => {
                    if (typeof k === "string") return { key: k, label: k }; // 이전 포맷(string 배열) 호환
                    if (k && typeof k === "object" && k.key) return k; // 새 포맷({key, label} 객체)
                    return null;
                  })
                  .filter(Boolean); // null 값 제거

                // 3. 'hideNullColumns' 적용
                const filteredKeyObjects = el.hideNullColumns
                  ? keyObjects.filter((kObj) =>
                      gridDataFromSlot.some(
                        (obj) =>
                          obj[kObj.key] !== null &&
                          obj[kObj.key] !== undefined &&
                          obj[kObj.key] !== "",
                      ),
                    )
                  : keyObjects;
                // --- [수정 끝] ---

                return (
                  <div key={el.id} style={{ overflowX: "auto" }}>
                    <table className={styles.formGridTable}>
                      <thead>
                        <tr>
                          {el.selectable && <th aria-label={t("Select")} />}
                          {filteredKeyObjects.map((kObj) => (
                            <th key={kObj.key}>
                              {interpolateMessage(kObj.label, slots)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {gridDataFromSlot.map((dataObject, index) => (
                          <tr
                            key={`${el.id}-${index}`}
                            className={
                              el.selectable
                                ? styles.selectableGridRow
                                : undefined
                            }
                            onClick={() =>
                              !isCompleted &&
                              el.selectable &&
                              handleGridRowClick(dataObject, el)
                            }
                          >
                            {el.selectable && (
                              <td>
                                <input
                                  type="checkbox"
                                  readOnly
                                  checked={isGridRowSelected(
                                    dataObject,
                                    elementKey,
                                  )}
                                />
                              </td>
                            )}
                            {filteredKeyObjects.map((kObj) => (
                              <td key={kObj.key}>
                                {interpolateMessage(
                                  dataObject[kObj.key] || "",
                                  slots,
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              } else {
                const rows = gridDataFromSlot.length;
                const columns = gridDataFromSlot[0]?.length || 0;
                return (
                  <table key={el.id} className={styles.formGridTable}>
                    {el.hasHeader && (
                      <thead>
                        <tr>
                          {el.selectable && <th />}
                          {[...Array(columns)].map((_, c) => (
                            <th key={c}>
                              {el.displayKeys?.[c]?.label ||
                                gridDataFromSlot[0]?.[c] ||
                                ""}
                            </th>
                          ))}
                        </tr>
                      </thead>
                    )}
                    <tbody>
                      {[...Array(rows)].map((_, r) => (
                        <tr
                          key={r}
                          className={
                            el.selectable ? styles.selectableGridRow : undefined
                          }
                          onClick={() =>
                            !isCompleted &&
                            el.selectable &&
                            handleGridRowClick(gridDataFromSlot[r], el)
                          }
                        >
                          {el.selectable && (
                            <td>
                              <input
                                type="checkbox"
                                readOnly
                                checked={isGridRowSelected(
                                  gridDataFromSlot[r],
                                  elementKey,
                                )}
                              />
                            </td>
                          )}
                          {[...Array(columns)].map((_, c) => {
                            const cellValue = gridDataFromSlot[r]
                              ? gridDataFromSlot[r][c]
                              : "";
                            {
                              /* --- [수정] interpolateMessage 사용 --- */
                            }
                            return (
                              <td key={c}>
                                {interpolateMessage(cellValue || "", slots)}
                              </td>
                            );
                            {
                              /* --- [수정 끝] --- */
                            }
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                );
              }
            } else {
              const rows = el.rows || 2;
              const columns = el.columns || 2;
              return (
                <table key={el.id} className={styles.formGridTable}>
                  {el.hasHeader && (
                    <thead>
                      <tr>
                        {el.selectable && <th />}
                        {[...Array(columns)].map((_, c) => (
                          <th key={c}>
                            {el.displayKeys?.[c]?.label || el.data?.[c] || ""}
                          </th>
                        ))}
                      </tr>
                    </thead>
                  )}
                  <tbody>
                    {[
                      ...Array(el.hasHeader ? Math.max(rows - 1, 0) : rows),
                    ].map((_, rowOffset) => {
                      const r = el.hasHeader ? rowOffset + 1 : rowOffset;
                      const rowData = [...Array(columns)].map(
                        (_, c) => el.data?.[r * columns + c] || "",
                      );
                      return (
                        <tr
                          key={r}
                          className={
                            el.selectable ? styles.selectableGridRow : undefined
                          }
                          onClick={() =>
                            !isCompleted &&
                            el.selectable &&
                            handleGridRowClick(rowData, el)
                          }
                        >
                          {el.selectable && (
                            <td>
                              <input
                                type="checkbox"
                                readOnly
                                checked={isGridRowSelected(rowData, elementKey)}
                              />
                            </td>
                          )}
                          {[...Array(columns)].map((_, c) => {
                            const cellIndex = r * columns + c;
                            const cellValue =
                              el.data && el.data[cellIndex]
                                ? el.data[cellIndex]
                                : "";
                            {
                              /* --- [수정] interpolateMessage 사용 --- */
                            }
                            return (
                              <td key={c}>
                                {interpolateMessage(cellValue || "", slots)}
                              </td>
                            );
                            {
                              /* --- [수정 끝] --- */
                            }
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              );
            }
          }

          // --- [수정] 시작: input을 제어 컴포넌트로 변경하고 onDoubleClick 핸들러 추가 ---

          // 1. input, date, dropbox, checkbox의 현재 값과 기본값을 별도로 계산
          let currentValue = "";
          let resolvedDefaultValue = ""; // input의 더블클릭에 사용

          if (el.type === "input") {
            const defaultValueConfig = el.defaultValue || "";
            resolvedDefaultValue = interpolateMessage(
              defaultValueConfig,
              slots,
            ); // 순수 기본값 (슬롯 보간)
            currentValue = formData[elementKey] ?? resolvedDefaultValue; // 현재 값 (state 우선)
          } else if (
            el.type === "date" ||
            el.type === "dropbox" ||
            el.type === "radio"
          ) {
            currentValue = formData[elementKey] ?? el.defaultValue ?? "";
          } else if (el.type === "checkbox") {
            currentValue = formData[elementKey] ?? el.defaultValue ?? [];
          }

          return (
            <div key={el.id} className={styles.formElement}>
              {/* --- [수정] interpolateMessage 사용 --- */}
              <label className={styles.formLabel}>
                {interpolateMessage(el.label, slots)}
                {el.requires ? (
                  <span className={styles.requiredMark}> *</span>
                ) : null}
              </label>
              {el.description ? (
                <span className={styles.formDescription} title={el.description}>
                  {interpolateMessage(el.description, slots)}
                </span>
              ) : null}
              {/* --- [수정 끝] --- */}

              {/* 2. input: 'defaultValue' -> 'value'로 변경, onDoubleClick 추가 */}
              {el.type === "input" && (
                <input
                  type={el.validation?.type === "email" ? "email" : "text"}
                  className={styles.formInput}
                  placeholder={interpolateMessage(el.placeholder, slots)}
                  value={currentValue}
                  onChange={(e) => handleFormInputChange(el, e.target.value)}
                  onDoubleClick={() => {
                    if (!isCompleted) {
                      handleFormInputChange(el, resolvedDefaultValue);
                    }
                  }}
                  disabled={isCompleted}
                  minLength={el.minLength ? Number(el.minLength) : undefined}
                  maxLength={el.maxLength ? Number(el.maxLength) : undefined}
                  pattern={
                    el.validation?.type === "custom" ? el.regex : undefined
                  }
                  required={el.requires}
                />
              )}

              {/* 3. date: 'value'에 currentValue 사용 (기존: formData[el.name] || '') */}
              {el.type === "date" &&
                (() => {
                  const dateValue = formData[elementKey] || {};
                  const fromDate = el.hasFromTo
                    ? (dateValue.fromDate ??
                      el.fromDateValue ??
                      el.defaultFromValue ??
                      el.defaultValue ??
                      "")
                    : (dateValue.date ?? currentValue ?? el.dateValue ?? "");
                  const toDate =
                    dateValue.toDate ??
                    el.toDateValue ??
                    el.defaultToValue ??
                    "";
                  const fromTime =
                    dateValue.fromTime ??
                    el.fromTimeValue ??
                    el.defaultFromTimeValue ??
                    el.defaultTimeValue ??
                    "";
                  const toTime =
                    dateValue.toTime ??
                    el.toTimeValue ??
                    el.defaultToTimeValue ??
                    el.defaultTimeValue ??
                    "";
                  const updateDate = (changes) => {
                    const next = {
                      fromDate: String(fromDate),
                      toDate: String(toDate),
                      fromTime: String(fromTime),
                      toTime: String(toTime),
                      ...changes,
                    };
                    if (
                      changes.fromDate &&
                      el.hasFromTo &&
                      el.defaultToDateOffset > 0
                    ) {
                      next.toDate = addDays(
                        changes.fromDate,
                        el.defaultToDateOffset,
                      );
                    }
                    const submittedValue = el.hasFromTo
                      ? {
                          from: toLocaleTimeValue(
                            next.fromDate,
                            next.fromTime,
                            el.hasTime,
                            el.locale,
                          ),
                          to: toLocaleTimeValue(
                            next.toDate,
                            next.toTime,
                            el.hasTime,
                            el.locale,
                          ),
                        }
                      : toLocaleTimeValue(
                          next.fromDate,
                          next.fromTime,
                          el.hasTime,
                          el.locale,
                        );
                    handleFormInputChange(el, next, submittedValue);
                  };

                  return (
                    <div className={styles.dateFields}>
                      <input
                        type="date"
                        className={styles.formInput}
                        value={fromDate}
                        onChange={(e) =>
                          updateDate({ fromDate: e.target.value })
                        }
                        disabled={isCompleted}
                        required={el.requires}
                        {...dateProps}
                      />
                      {el.hasTime && (
                        <input
                          type="time"
                          className={styles.formInput}
                          value={fromTime}
                          onChange={(e) =>
                            updateDate({ fromTime: e.target.value })
                          }
                          disabled={isCompleted}
                          step={60}
                        />
                      )}
                      {el.hasFromTo && (
                        <input
                          type="date"
                          className={styles.formInput}
                          value={toDate}
                          onChange={(e) =>
                            updateDate({ toDate: e.target.value })
                          }
                          disabled={isCompleted}
                          required={el.requires}
                          {...dateProps}
                        />
                      )}
                      {el.hasFromTo && el.hasTime && (
                        <input
                          type="time"
                          className={styles.formInput}
                          value={toTime}
                          onChange={(e) =>
                            updateDate({ toTime: e.target.value })
                          }
                          disabled={isCompleted}
                          step={60}
                        />
                      )}
                    </div>
                  );
                })()}

              {/* 4. checkbox: 'checked'에 currentValue 사용 */}
              {el.type === "checkbox" && (
                <div
                  className={styles.formOptions}
                  style={{
                    gridTemplateColumns:
                      el.optionLayout === "horizontal"
                        ? `repeat(${Math.max(1, el.optionsPerRow ?? 2)}, minmax(0, 1fr))`
                        : "minmax(0, 1fr)",
                  }}
                >
                  {el.options?.map((opt, index) => {
                    const option = normalizeOption(opt, index);

                    return (
                      <div
                        key={option.value || index}
                        className={styles.checkboxOption}
                      >
                        <input
                          type="checkbox"
                          id={`${el.id}-${option.value}`}
                          value={option.value}
                          checked={(currentValue || []).includes(option.value)}
                          onChange={(e) =>
                            handleFormMultiInputChange(
                              el,
                              option.value,
                              e.target.checked,
                              el.sendByOption
                                ? createOptionParams(
                                    el,
                                    e.target.checked
                                      ? [...(currentValue || []), option.value]
                                      : (currentValue || []).filter(
                                          (value) => value !== option.value,
                                        ),
                                  )
                                : undefined,
                            )
                          }
                          disabled={isCompleted}
                        />
                        <label htmlFor={`${el.id}-${option.value}`}>
                          {interpolateMessage(option.label, slots)}
                        </label>
                      </div>
                    );
                  })}
                </div>
              )}

              {el.type === "radio" && (
                <div
                  className={styles.formOptions}
                  style={{
                    gridTemplateColumns:
                      el.optionLayout === "horizontal"
                        ? `repeat(${Math.max(1, el.optionsPerRow ?? 2)}, minmax(0, 1fr))`
                        : "minmax(0, 1fr)",
                  }}
                >
                  {(el.options || []).map((opt, index) => {
                    const option = normalizeOption(opt, index);
                    return (
                      <label
                        key={option.value || index}
                        className={styles.checkboxOption}
                      >
                        <input
                          type="radio"
                          name={`${nodeId}-${el.id}`}
                          checked={currentValue === option.value}
                          disabled={isCompleted}
                          onClick={() => {
                            const nextValue =
                              el.allowDeselection &&
                              currentValue === option.value
                                ? ""
                                : option.value;
                            handleFormInputChange(
                              el,
                              nextValue,
                              el.sendByOption
                                ? createOptionParams(
                                    el,
                                    nextValue ? [nextValue] : [],
                                  )
                                : nextValue,
                            );
                          }}
                          onChange={() => {}}
                        />
                        {interpolateMessage(option.label, slots)}
                      </label>
                    );
                  })}
                </div>
              )}

              {/* 5. dropbox: 'value'에 currentValue 사용 */}
              {el.type === "dropbox" &&
                (() => {
                  const options = Array.isArray(slots[el.optionsSlot])
                    ? slots[el.optionsSlot]
                    : el.options;
                  const normalizedOptions = (options || []).map(
                    (option, index) => {
                      const normalized = normalizeOption(option, index);
                      return {
                        ...normalized,
                        label: interpolateMessage(normalized.label, slots),
                      };
                    },
                  );

                  if (el.selectKind === "multi") {
                    return (
                      <FormMultiSelect
                        options={normalizedOptions}
                        value={currentValue}
                        placeholder={`${t("Select")}...`}
                        disabled={isCompleted}
                        onChange={(nextValue) =>
                          handleFormInputChange(el, nextValue)
                        }
                      />
                    );
                  }

                  return (
                    <select
                      className={styles.formInput}
                      value={currentValue}
                      onChange={(e) =>
                        handleFormInputChange(el, e.target.value)
                      }
                      disabled={isCompleted}
                      required={el.requires}
                    >
                      <option value="" disabled>
                        {t("Select")}...
                      </option>
                      {normalizedOptions.map((option, index) => {
                        return (
                          <option
                            key={option.value || index}
                            value={option.value}
                          >
                            {interpolateMessage(option.label, slots)}
                          </option>
                        );
                      })}
                    </select>
                  );
                })()}
              {el.type === "search" && (
                <div
                  style={{ display: "flex", alignItems: "center", gap: "8px" }}
                >
                  <input
                    type="text"
                    className={styles.formInput}
                    placeholder={interpolateMessage(el.placeholder, slots)}
                    value={formData[elementKey] ?? ""}
                    onChange={(e) => handleFormInputChange(el, e.target.value)}
                    disabled={isCompleted}
                    style={{ flexGrow: 1 }}
                  />
                  <button
                    onClick={() => handleFormElementApiCall(el)}
                    disabled={isCompleted}
                    className={styles.formSubmitButton}
                    style={{
                      padding: "8px 12px",
                      margin: 0,
                      flexShrink: 0,
                      lineHeight: 1,
                    }}
                  >
                    🔍
                  </button>
                </div>
              )}
            </div>
          );
          // --- 💡 [수정] 끝 ---
        })}
        <div className={styles.formButtonContainer}>
          {/* <<< [추가] 엑셀 업로드 버튼 >>> */}
          {data.enableExcelUpload && !isCompleted && (
            <button
              className={styles.formExcelButton}
              onClick={onExcelUpload}
              disabled={isCompleted}
            >
              {t("Excel Upload")}
            </button>
          )}
          {/* <<< [수정] Default 버튼 완전 제거 >>> */}
          <button
            className={styles.formSubmitButton}
            onClick={onFormSubmit}
            disabled={isCompleted}
          >
            {t("Submit")}
          </button>
        </div>
      </div>
    );
  }

  // --- 👇 [수정] interpolateMessage 사용 ---
  const message = interpolateMessage(data.content || data.label, slots);
  // --- 👆 [수정 끝] ---
  return (
    // --- 👇 [수정] 래핑 div 변경 및 스타일 조정 ---
    <div style={{ width: "100%" }}>
      <div>{message}</div>
      {type === "branch" && data.evaluationType === "BUTTON" && (
        <div className={styles.branchButtonsContainer}>
          {/* --- 👇 [수정] interpolateMessage 사용 --- */}
          {data.replies?.map((reply) => (
            <button
              key={reply.value}
              className={styles.branchButton}
              onClick={() => onOptionClick(reply)}
              disabled={isCompleted}
            >
              {interpolateMessage(reply.display, slots)}
            </button>
          ))}
          {/* --- 👆 [수정 끝] --- */}
        </div>
      )}
      {/* --- 👇 [추가] slotfilling 버튼 렌더링 --- */}
      {type === "slotfilling" && data.replies && data.replies.length > 0 && (
        <div className={styles.branchButtonsContainer}>
          {data.replies.map((reply) => (
            <button
              key={reply.value}
              className={styles.branchButton}
              onClick={() => onOptionClick(reply)}
              disabled={isCompleted}
            >
              {interpolateMessage(reply.display, slots)}
            </button>
          ))}
        </div>
      )}
      {/* --- 👆 [추가 끝] --- */}
    </div>
    // --- 👆 [수정 끝] ---
  );
};

// --- 👇 [삭제] CombinedBubble 컴포넌트 전체 삭제 ---
/*
const CombinedBubble = ({
    parts, // item.combinedData
    ...
}) => {
    ... (useState, useEffect, setTimeout 로직) ...
};
*/
// --- 👆 [삭제 끝] ---

// <<< [수정] onExcelUpload prop 추가 >>>
const MessageRenderer = ({
  item,
  nodes,
  onOptionClick,
  handleFormSubmit,
  handleFormDefault,
  formData,
  handleFormInputChange,
  handleFormMultiInputChange,
  formElementOverrides,
  handleGridRowClick,
  onExcelUpload,
  handleFormElementApiCall,
}) => {
  const { t } = useTranslation();
  const slots = useBuilderStore((state) => state.slots);
  const historyRef = useRef(null);

  useEffect(() => {
    if (historyRef.current) {
      historyRef.current.scrollTop = historyRef.current.scrollHeight;
    }
  }, [item]); // --- 💡 [수정] item으로 변경 (combinedData 변경 시 스크롤) ---

  // --- 👇 [수정] 렌더링 로직 수정 ---
  switch (item.type) {
    case "bot_streaming":
      // ... (변경 없음)
      return (
        <div className={styles.messageRow}>
          <img
            src={
              item.isStreaming
                ? "/images/avatar-loading.png"
                : "/images/avatar.png"
            }
            alt="Avatar"
            className={styles.avatar}
          />
          <div className={`${styles.message} ${styles.botMessage}`}>
            {item.content}
          </div>
        </div>
      );
    case "loading":
      // ... (변경 없음)
      return (
        <div className={styles.messageRow}>
          <img
            src="/images/avatar-loading.png"
            alt="Avatar"
            className={styles.avatar}
          />
          <div className={`${styles.message} ${styles.botMessage}`}>
            <img
              src="/images/Loading.gif"
              alt="Loading..."
              style={{ width: "80px", height: "60px" }}
            />
          </div>
        </div>
      );
    case "bot":
      // 1. API 에러 등 간단한 메시지 처리 (기존 로직)
      if (item.message) {
        return (
          <div className={styles.messageRow}>
            <img
              src="/images/avatar.png"
              alt="Avatar"
              className={styles.avatar}
            />
            <div className={`${styles.message} ${styles.botMessage}`}>
              {interpolateMessage(item.message, slots)}
            </div>
          </div>
        );
      }

      // 2. 묶인 데이터(combinedData) 처리 (CombinedBubble 제거)
      if (item.combinedData) {
        const containsForm = item.combinedData.some(
          (part) => part?.type === "form",
        );

        return (
          <div
            className={`${styles.messageRow} ${containsForm ? styles.formMessageRow : ""}`}
          >
            <img
              src="/images/avatar.png"
              alt="Avatar"
              className={styles.avatar}
            />
            {/* 하나의 말풍선 div 안에 묶인 파트들을 순차적으로 렌더링 */}
            <div
              className={`${styles.message} ${styles.botMessage} ${containsForm ? styles.formMessage : ""}`}
            >
              {item.combinedData.map((part, index) => (
                <BotMessagePart
                  key={part.nodeId || index}
                  part={part}
                  slots={slots}
                  onOptionClick={onOptionClick}
                  // --- 👇 [수정] prop 이름 변경 (handleFormSubmit -> onFormSubmit) ---
                  onFormSubmit={handleFormSubmit}
                  // --- 👆 [수정 끝] ---
                  onFormDefault={handleFormDefault}
                  // --- 💡 [수정] 마지막 파트만 isCompleted를 따르도록 수정 ---
                  isCompleted={
                    index < item.combinedData.length - 1
                      ? true
                      : item.isCompleted
                  }
                  formData={formData}
                  handleFormInputChange={handleFormInputChange}
                  handleFormMultiInputChange={handleFormMultiInputChange}
                  formElementOverrides={formElementOverrides}
                  handleGridRowClick={handleGridRowClick}
                  onExcelUpload={onExcelUpload}
                  handleFormElementApiCall={handleFormElementApiCall}
                />
              ))}
            </div>
          </div>
        );
      }
      return null; // 렌더링할 데이터가 없는 경우
    // --- 👆 [수정 끝] ---
    case "user":
      // ... (변경 없음)
      return (
        <div className={`${styles.messageRow} ${styles.userRow}`}>
          <div className={`${styles.message} ${styles.userMessage}`}>
            {item.message}
          </div>
        </div>
      );
    default:
      return null;
  }
};

export default MessageRenderer;
