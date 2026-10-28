"use client";
import {create} from 'zustand';
import {useTheme} from './theme';
export type Preferences={toastPosition:'top'|'bottom';defaultTheme:'light'|'dark';toastBackgroundColor:string;toastFontColor:string;version:number};
export const defaults:Preferences={toastPosition:'bottom',defaultTheme:'light',toastBackgroundColor:'#ffffff',toastFontColor:'#262138',version:0};
export const usePreferences=create<{userId:string; saved:Preferences;current:Preferences;position:'top'|'bottom';busy:boolean;initialize:(id:string,p:Preferences)=>void;preview:(p:Preferences)=>void;save:(p:Preferences)=>Promise<void>}>((set,get)=>({
 userId:'',saved:defaults,current:defaults,position:'bottom',busy:false,
 initialize(userId,saved){set({userId,saved,current:saved,position:saved.toastPosition});useTheme.getState().syncTheme(saved.defaultTheme);},
 preview(p){set({current:p,position:p.toastPosition});useTheme.getState().syncTheme(p.defaultTheme);},
 async save(p){if(get().busy)throw new Error('설정 저장 중입니다.');set({busy:true});try{const response=await fetch('/api/me/preferences',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(p)});const data=await response.json();if(!response.ok)throw new Error(data.error);get().initialize(get().userId,data);try{localStorage.setItem(`matrix-preferences:${get().userId}`,JSON.stringify(data));}catch{ /* DB remains authoritative. */ }}catch(e){get().preview(get().saved);throw e;}finally{set({busy:false});}}
}));
