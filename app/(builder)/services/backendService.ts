// src/backendService.js

import * as tursoApi from "./tursoApi";
import { interpolateMessage } from "../utils/simulatorUtils";
import { useBuilderStore } from "../store/index";
const getService = (_backend: unknown) => {
  void _backend;
  return tursoApi;
};

export const fetchScenarios = (backend: any, args?: any) =>
  getService(backend).fetchScenarios(args);
export const createScenario = (backend: any, args: any) =>
  getService(backend).createScenario(args);
export const patchScenario = (backend: any, args: any) =>
  getService(backend).patchScenario(args);
export const deleteScenario = (backend: any, args: any) =>
  getService(backend).deleteScenario(args);
export const fetchScenarioData = (backend: any, args: any) =>
  getService(backend).fetchScenarioData(args);
export const saveScenarioData = (backend: any, args: any) =>
  getService(backend).saveScenarioData(args);
export const cloneScenario = (backend: any, args: any) =>
  getService(backend).cloneScenario(args);
export const updateScenarioLastUsed = (backend: any, args: any) =>
  getService(backend).updateScenarioLastUsed(args);
export const getScenarioVersions = (backend: any, args: any) =>
  getService(backend).getScenarioVersions(args);
export const getScenarioVersion = (backend: any, args: any) =>
  getService(backend).getScenarioVersion(args);
export const getScenarioDeployHistory = (backend: any, args: any) =>
  getService(backend).getScenarioDeployHistory(args);
export const restoreScenarioVersion = (backend: any, args: any) =>
  getService(backend).restoreScenarioVersion(args);
export const scenarioVersionDeploy = (backend: any, args: any) =>
  getService(backend).scenarioVersionDeploy(args);

export const fetchApiTemplates = (backend: any, args: any) =>
  getService(backend).fetchApiTemplates(args);
export const saveApiTemplate = (backend: any, args: any) =>
  getService(backend).saveApiTemplate(args);
export const deleteApiTemplate = (backend: any, args: any) =>
  getService(backend).deleteApiTemplate(args);

export const fetchFormTemplates = (backend: any, args: any) =>
  getService(backend).fetchFormTemplates(args);
export const saveFormTemplate = (backend: any, args: any) =>
  getService(backend).saveFormTemplate(args);
export const deleteFormTemplate = (backend: any, args: any) =>
  getService(backend).deleteFormTemplate(args);

export const testApiCall = async (apiCall: any) => {
  const { slots } = useBuilderStore.getState();
  const interpolatedUrl = interpolateMessage(apiCall.url, slots);
  const interpolatedHeaders = JSON.parse(
    interpolateMessage(apiCall.headers || "{}", slots),
  );

  const rawBody = apiCall.body || "{}";
  const finalBody = interpolateMessage(rawBody, slots);

  const options = {
    method: apiCall.method,
    headers: { "Content-Type": "application/json", ...interpolatedHeaders },
    body:
      apiCall.method !== "GET" && apiCall.method !== "HEAD"
        ? finalBody
        : undefined,
  };

  const response = await fetch(interpolatedUrl, options);

  let result;
  const contentType = response.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    try {
      result = await response.json();
    } catch (e) {
      result = await response.text();
    }
  } else {
    result = await response.text();
  }

  if (!response.ok) {
    const errorMessage =
      typeof result === "string" ? result : JSON.stringify(result, null, 2);
    throw new Error(`HTTP ${response.status}: ${errorMessage}`);
  }

  return result;
};
