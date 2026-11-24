import {
  TextFields as TypeIcon,
  CheckBox as CheckSquareIcon,
  RadioButtonChecked as RadioIcon,
  ArrowDropDown as ChevronDownIcon,
  DateRange as DateIcon,
  GridView as GridIcon,
  Search as ScearchIcon,
} from "@mui/icons-material";

import {
  createBindApiSettings,
  createTargetApiSettings,
  type ElementType,
  type FormElement,
} from "../type";

const createId = (type: ElementType) =>
  `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export const FORM_ELEMENT_REGISTRY = {
  input: {
    label: "Text Field",
    defaultLabel: "New Input",
    icon: <TypeIcon fontSize="small" />,
    create: (): FormElement => ({
      id: createId("input"),
      type: "input",
      name: "",
      label: "New Input",
      bindApi: createBindApiSettings(),
      targetApi: createTargetApiSettings(),
      validation: { type: "text" },
      placeholder: "",
      defaultValue: "",
    }),
  },

  date: {
    label: "Date Field",
    defaultLabel: "New Date",
    icon: <DateIcon fontSize="small" />,
    create: (): FormElement => ({
      id: createId("date"),
      type: "date",
      name: "",
      label: "New Date",
      bindApi: createBindApiSettings(),
      targetApi: createTargetApiSettings(),
      defaultValue: "",
      locale: "ko",
      value: { date: 0, locale: "ko" },
      dateValue: "",
      hasFromTo: false,
      defaultToDateOffset: 0,
      defaultFromValue: "",
      defaultToValue: "",
      fromDateValue: "",
      toDateValue: "",
      hasTime: false,
      timeValue: "",
      defaultTimeValue: "",
      defaultFromTimeValue: "",
      defaultToTimeValue: "",
      fromTimeValue: "",
      toTimeValue: "",
    }),
  },

  checkbox: {
    label: "Checkbox",
    defaultLabel: "New Checkbox",
    icon: <CheckSquareIcon fontSize="small" />,
    create: (): FormElement => ({
      id: createId("checkbox"),
      type: "checkbox",
      name: "",
      label: "New Checkbox",
      bindApi: createBindApiSettings(),
      targetApi: createTargetApiSettings(),
      options: [
        { value: "Option 1", label: "Option 1" },
        { value: "Option 2", label: "Option 2" },
      ],
      defaultValue: [],
      optionLayout: "vertical",
      optionsPerRow: 2,
      sendByOption: false,
      optionsSlot: "",
      optionLabelKey: "",
      optionValueKey: "",
      sampleJson: "",
    }),
  },

  radio: {
    label: "Radio",
    defaultLabel: "New Radio",
    icon: <RadioIcon fontSize="small" />,
    create: (): FormElement => ({
      id: createId("radio"),
      type: "radio",
      name: "",
      label: "New Radio",
      bindApi: createBindApiSettings(),
      targetApi: createTargetApiSettings(),
      options: [
        { value: "Option 1", label: "Option 1" },
        { value: "Option 2", label: "Option 2" },
      ],
      defaultValue: [],
      optionLayout: "vertical",
      optionsPerRow: 2,
      sendByOption: false,
      allowDeselection: false,
      optionsSlot: "",
      optionLabelKey: "",
      optionValueKey: "",
      sampleJson: "",
    }),
  },

  dropbox: {
    label: "Dropbox",
    defaultLabel: "New Dropbox",
    icon: <ChevronDownIcon fontSize="small" />,
    create: (): FormElement => ({
      id: createId("dropbox"),
      type: "dropbox",
      name: "",
      label: "New Dropbox",
      bindApi: createBindApiSettings(),
      targetApi: createTargetApiSettings(),
      options: [
        { value: "Option 1", label: "Option 1" },
        { value: "Option 2", label: "Option 2" },
      ],
      optionsSlot: "",
      optionLabelKey: "",
      optionValueKey: "",
      sampleJson: "",
      selectKind: "single",
      defaultValue: "",
    }),
  },

  grid: {
    label: "Grid",
    defaultLabel: "New Grid",
    icon: <GridIcon fontSize="small" />,
    create: (): FormElement => ({
      id: createId("grid"),
      type: "grid",
      name: "",
      label: "New Grid",
      bindApi: createBindApiSettings(),
      targetApi: createTargetApiSettings(),
      data: ["", "", "", ""],
      rows: 2,
      columns: 2,
      displayKeys: [],
      sampleJson: JSON.stringify(
        {
          data: [
            { id: "AL000000001", name: "ABC Corp" },
            { id: "AL000000002", name: "DEF Ltd" },
          ],
        },
        null,
        2,
      ),
      optionsSlot: "",
    }),
  },

  search: {
    label: "Search",
    defaultLabel: "New Search",
    icon: <ScearchIcon fontSize="small" />,
    create: (): FormElement => ({
      id: createId("search"),
      type: "search",
      name: "search_term",
      label: "New Search",
      bindApi: createBindApiSettings(),
      targetApi: createTargetApiSettings(),
      placeholder: "Enter search term...",
      defaultValue: "",
      apiConfig: {
        url: "https://",
        method: "POST",
        headers: "{}",
        bodyTemplate: '{"query": "{{value}}"}',
      },
      resultSlot: "search_results",
      inputFillKey: null,
    }),
  },
} as const;

export const FORM_ELEMENT_TYPES = Object.keys(
  FORM_ELEMENT_REGISTRY,
) as ElementType[];

export const createFormElement = (type: ElementType): FormElement => {
  return FORM_ELEMENT_REGISTRY[type].create();
};
