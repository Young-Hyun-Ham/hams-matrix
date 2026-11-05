export type ElementKind =
  | "page"
  | "section"
  | "layer"
  | "text"
  | "image"
  | "clipboard"
  | "button"
  | "checkbox"
  | "radio"
  | "select"
  | "icon";

export type IconType = "" | "svg" | "mui";
export type OptionOrientation = "horizontal" | "vertical";
export type LayerOption = { display: string; value: string };

export type Layer = {
  id: string;
  name: string;
  kind: ElementKind;
  iconType?: IconType;
  iconInstance?: string;
  iconSize?: number;
  iconColor?: string;
  optionLabel?: string;
  optionCount?: number;
  optionOrientation?: OptionOrientation;
  optionItems?: LayerOption[];
  selectMode?: "single" | "multi";
  template?: boolean;
  visible?: boolean;
  locked?: boolean;
  children?: Layer[];
};

export type Device = "desktop" | "tablet" | "mobile";
export type LayerSize = { width: number; height: number };
export type LayerPosition = { x: number; y: number };
export type LayerEffect =
  | "none"
  | "shadow"
  | "soft-shadow"
  | "blur"
  | "grayscale"
  | "text-shadow";
export type LayerStyle = {
  fontSize?: number;
  lineHeight?: number;
  fontWeight?: number;
  color?: string;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  opacity?: number;
  borderRadius?: number;
  textAlign?: "left" | "center" | "right";
  verticalAlign?: "top" | "middle" | "bottom";
  effect?: LayerEffect;
};

export type PreviewDocument = {
  title: string;
  activePageId: string;
  layers: Layer[];
  sizes: Record<string, LayerSize>;
  positions: Record<string, LayerPosition>;
  layerText: Record<string, string>;
  layerImages: Record<string, string>;
  layerStyles: Record<string, LayerStyle>;
};

export type GeneratedElement = {
  id: string;
  parentId: string;
  name: string;
  kind: Exclude<ElementKind, "page">;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  lineHeight: number;
  fontWeight: number;
  color: string;
  backgroundColor: string;
  borderColor: string;
  borderWidth: number;
  opacity: number;
  borderRadius: number;
  textAlign: "left" | "center" | "right";
  verticalAlign?: "top" | "middle" | "bottom";
  effect: LayerEffect;
  iconInstance: string;
  iconSize: number;
  iconType: IconType;
  iconColor: string;
  optionLabel: string;
  optionCount: number;
  optionOrientation: OptionOrientation;
  optionItems: LayerOption[];
  selectMode?: "single" | "multi";
  visible: boolean;
  locked: boolean;
};

export type GeneratedPage = {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  backgroundColor: string;
  visible: boolean;
  locked: boolean;
  elements: GeneratedElement[];
};

export type GeneratedDocument = {
  title: string;
  activePageId: string;
  pages: GeneratedPage[];
};
