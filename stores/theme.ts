"use client";
import {create} from 'zustand';
import type {Theme} from '@/lib/theme';
// DB preferences own persistence; preview never writes browser-wide defaults.
export const useTheme=create<{theme:Theme;syncTheme:(theme:Theme)=>void}>((set)=>({theme:'light',syncTheme(theme){document.documentElement.dataset.theme=theme;set({theme});}}));
