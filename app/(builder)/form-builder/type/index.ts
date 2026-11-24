import { Timestamp } from "next/dist/server/lib/cache-handlers/types";
import { type ReactNode } from "react";

type ElementType =
  | "input"
  | "date"
  | "checkbox"
  | "radio"
  | "dropbox"
  | "grid"
  | "search";

export interface ElementTypeItem {
  id: string;
  type_cd: ElementType;
  label: string;
  default_label: string;
  visible: boolean;
  sort_order: number;
  cre_user_id: string;
  cre_dt: string;
  upd_user_id: string;
  upd_dt: string;
  del_yn: "Y" | "N";
}

type FormElement =
  | InputElement
  | DateElement
  | CheckboxElement
  | RadioElement
  | DropboxElement
  | GridElement
  | SearchElement;

export interface ComponentType {
  type: ElementType;
  label: string;
  defaultLabel: string;
  icon: ReactNode;
}

export interface DisplayKey {
  key: string;
  label: string;
}

export interface DisplayValue {
  value: string;
  label: string;
  param?: string;
}

export interface ElementApiSettings {
  apiId: string;
  apiData: Record<string, unknown> | null;
  method: string;
  url: string;
  headers: string;
  body: string;
  responseMapping: ApiResponseMapping[];
  eventType?: "onChange" | "onClick" | "";
  parameterId?: string;
  optionalParameter: ApiParameterEntry[];
  responsePath?: string;
}

export interface ApiParameterEntry {
  id: string;
  key: string;
  value: string;
}

export interface ApiResponseMapping {
  path: string;
  slot: string;
}

export interface BindApiSettings extends ElementApiSettings {
  mode: "bind";
}

export interface TargetApiSettings extends ElementApiSettings {
  mode: "target";
  targetElementId: string;
}

export type ApiSettings = BindApiSettings | TargetApiSettings;

export const createBindApiSettings = (): BindApiSettings => ({
  mode: "bind",
  apiId: "API202610121337242240029",
  apiData: null,
  method: "post",
  url: "/agt/agt9001/checkBkgCntrSts",
  headers: "",
  body: "{}",
  responseMapping: [],
  eventType: "",
  parameterId: "",
  optionalParameter: [
    {
      id: "blNr",
      key: "blNr",
      value: "SYS2510000000182416",
    },
    {
      id: "dspBlNr",
      key: "dspBlNr",
      value: "AL0000184940",
    },
    {
      id: "bkgNr",
      key: "bkgNr",
      value: "AL0000184940",
    },
  ],
  responsePath: "",
});

export const createTargetApiSettings = (): TargetApiSettings => ({
  mode: "target",
  apiId: "API202610121337242240029",
  apiData: null,
  method: "post",
  url: "/agt/agt9001/checkBkgCntrSts",
  headers: "",
  body: "{}",
  responseMapping: [],
  eventType: "",
  parameterId: "",
  optionalParameter: [
    {
      id: "blNr",
      key: "blNr",
      value: "SYS2510000000182416",
    },
    {
      id: "dspBlNr",
      key: "dspBlNr",
      value: "AL0000184940",
    },
    {
      id: "bkgNr",
      key: "bkgNr",
      value: "AL0000184940",
    },
  ],
  responsePath: "",
  targetElementId: "",
});

export interface BaseFormElement {
  id: string;
  name: string;
  type: ElementType;
  label: string;
  bindApi: BindApiSettings;
  targetApi: TargetApiSettings;
  // 20268013 추가
  requires?: boolean;
  description?: string;
}

export interface InputElement extends BaseFormElement {
  type: "input";
  validation: {
    type: "text" | "email" | "number" | "custom";
  };
  regex?: string;
  placeholder: string;
  defaultValue: string;
  // 20268013 추가
  minLength?: string;
  maxLength?: string;
  transformTextType?: "uppercase" | "lowercase" | "capitalize" | "";
}

export interface SearchElement extends BaseFormElement {
  type: "search";
  placeholder: string;
  defaultValue: string;
  apiConfig: {
    url: string;
    method: string;
    headers: string;
    bodyTemplate: string;
  };
  resultSlot: string;
  inputFillKey: string | null;
}

export const LOCALE_LIST = [
  { value: "ko", label: "Korea" },
  { value: "en", label: "America" },
  { value: "vn", label: "Vietnam" },
  { value: "jp", label: "Japan" },
] as const;

export type LOCALE_TIME = (typeof LOCALE_LIST)[number]["value"];
export type LOCALE_TIME_TYPE = {
  date: Timestamp;
  locale: LOCALE_TIME;
};
export interface DateElement extends BaseFormElement {
  type: "date";
  locale: LOCALE_TIME;
  defaultValue: string;
  value: LOCALE_TIME_TYPE;
  // 20268014 추가
  dateValue: string;
  fromValue?: LOCALE_TIME_TYPE;
  toValue?: LOCALE_TIME_TYPE;
  hasFromTo?: boolean;
  defaultFromValue?: string;
  defaultToValue?: string;
  fromDateValue: string;
  toDateValue: string;
  defaultToDateOffset?: number;
  hasTime: boolean;
  timeValue: string;
  defaultTimeValue: string;
  defaultFromTimeValue?: string;
  defaultToTimeValue?: string;
  fromTimeValue: string;
  toTimeValue: string;
}

export interface CheckboxElement extends BaseFormElement {
  type: "checkbox";
  options: (string | DisplayValue)[];
  defaultValue: string[];
  optionLayout?: "vertical" | "horizontal";
  optionsPerRow?: number;
  sendByOption?: boolean;
  optionsSlot?: string;
  optionLabelKey?: string;
  optionValueKey?: string;
  sampleJson?: string;
}

export interface RadioElement extends BaseFormElement {
  type: "radio";
  options: (string | DisplayValue)[];
  defaultValue: string[];
  optionLayout?: "vertical" | "horizontal";
  optionsPerRow?: number;
  sendByOption?: boolean;
  allowDeselection?: boolean;
  optionsSlot?: string;
  optionLabelKey?: string;
  optionValueKey?: string;
  sampleJson?: string;
}

export interface DropboxElement extends BaseFormElement {
  type: "dropbox";
  options: (string | DisplayValue)[];
  optionsSlot: string;
  selectKind: "single" | "multi";
  defaultValue: string | string[];
  optionLabelKey?: string;
  optionValueKey?: string;
  sampleJson?: string;
}

export interface GridElement extends BaseFormElement {
  type: "grid";
  data: string[];
  rows: number;
  columns: number;
  displayKeys: DisplayKey[];
  optionsSlot?: string;
  selectable?: boolean;
  hasHeader?: boolean;
  sampleJson?: string;
}
export interface FormElementData {
  revision?: number;
  formId?: string | null;
  id: string;
  title: string;
  elements: FormElement[];
  dataSource?: string;
  dataSourceType?: "json" | "api";
  enableExcelUpload?: boolean;
}

export interface FormDataJson {
  revision?: number;
  id: string | null;
  data: FormElementData;
  type: "form";
  width: number;
  height: number;
  dragging: boolean;
  selected: boolean;
}

export interface SavedFormContent {
  form_id: string;
  form_tl: string;
  cre_usr_id: string;
  cre_dt: string;
  upd_usr_id: string;
  upd_dt: string;
  form_elem: FormDataJson | Partial<FormDataJson>;
}

export type { FormElement, ElementType };
