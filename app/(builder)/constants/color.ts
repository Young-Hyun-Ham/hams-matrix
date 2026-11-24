export const COLORS = {
  common: { white: "#ffffff", yellow: "#f0cd05ff", blue: "#1c6de7ff" },
  primary: {
    main: "#5e5adb",
    dark: "#3f3bad",
    light: "#7470e7",
    contrastText: "#ffffff",
    states: {
      hover: "#5e5adb0a",
      selected: "#5e5adb14",
      focus: "#5e5adb1f",
      focusVisible: "#5e5adb4d",
      outlineBorder: "rgba(94, 90, 219, 0.5)",
    },
  },
  error: {
    main: "#d32f2f",
    dark: "#c62828",
    light: "#ef5350",
    contrastText: "#ffffff",
    states: {
      hover: "#d32f2f0a",
      selected: "#d32f2f14",
      focusVisible: "#d32f2f4d",
    },
  },
  warning: {
    main: "#ef6c00",
    dark: "#e65100",
    light: "#ff9800",
    contrastText: "#ffffff",
    states: {
      hover: "#ef6c000a",
      selected: "#ef6c0014",
      focusVisible: "#ef6c004d",
    },
  },
  success: {
    main: "#2e7d32",
    dark: "#1b5e20",
    light: "#4caf50",
    contrastText: "#ffffff",
    states: {
      hover: "#2e7d320a",
      selected: "#2e7d3214",
      focusVisible: "#2e7d324d",
    },
  },
  text: {
    primary: "rgba(0, 0, 0, 0.87)",
    secondary: "rgba(0, 0, 0, 0.6)",
    disabled: "rgba(0, 0, 0, 0.38)",
    states: {
      hover: "#0000000a",
      selected: "#00000014",
      focus: "#0000001f",
      focusVisible: "#0000004d",
    },
  },
  action: {
    active: "#0717358f",
    hover: "#0717350a",
    selected: "#07173514",
    focus: "#0717351f",
    disabled: "#07173561",
    disabledBackground: "#0717351f",
  },
  background: { default: "#ffffff", paper: "#ffffff" },
  grey: {
    50: "#fafafa",
    100: "#f0f2f7",
    200: "#e8ebf4",
    300: "#e0e0e0",
    400: "#bdbdbd",
    600: "#667085",
    700: "#5E7599",
  },
  blueGrey: {
    50: "#dde4ea",
    100: "#ccd2e3",
    200: "#B5BED7",
    300: "#90a4ae",
    400: "#78909c",
    700: "#455a64",
    900: "#263238",
  },
  indigo: { 900: "#2c2a56", 800: "#3f3d77", 600: "#4a4891", 200: "#9fa8da" },
  cyan: { 100: "#b2ebf2" },
  green: { A100: "#b9f6ca" },
  gradient: {
    primary: "linear-gradient(180deg, #FFF 0%, #F7F6FF 100%)",
    secondary: "linear-gradient(90deg, #4B45FF 0%, #7E00EC 100%)",
  },
  components: {
    input: {
      outlined: { enabledBorder: "#0000003b", hoverBorder: "#000000" },
      standard: { enabledBorder: "#0000006b" },
    },
  },
  agent: {
    api: {
      main: "#2E7D32",
      background: "#E8F5E9",
    },
    pim: {
      main: "#2684FF",
      background: "#E3F2FD",
    },
    retrieval: {
      main: "#673AB7",
      background: "#EDE7F6",
    },
    chat: {
      main: "#FF6F00",
      background: "#FFF3E0",
    },
    tbd: {
      main: "#455A64", // Blue Grey 700
      background: "#ECEFF1", // Blue Grey 50
    },
  },
} as const;

export type Colors = typeof COLORS;
