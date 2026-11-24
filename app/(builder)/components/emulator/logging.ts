"use client";
// BAPS logger was disabled. Keep the callback contract without a remote engine dependency.
const logToEngine = async (...args: unknown[]) => {
  void args;
};
export function useEngineLogger() {
  return { logToEngine };
}
