"use client";

import { createContext, useContext } from "react";

// Opt in only around the detail Flow canvas and its property editor. Shared
// viewers, nested editors and the Orkes canvas retain their existing chrome.
export type BuilderTheme = "light" | "dark";
export const BuilderAppearanceContext = createContext<BuilderTheme | null>(
  null,
);
export const useBuilderAppearance = () => useContext(BuilderAppearanceContext);
