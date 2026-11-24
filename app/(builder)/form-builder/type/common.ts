/**
 * [인수인계 보강 - 타입/직렬화]
 * - 프로젝트에서 공통으로 사용 하는 Type
 */

type AlertType = "error" | "info" | "success" | "warning";
type ModeType = "C" | "R" | "U" | "D";
type AlertOptions = {
  size?: string | "xs" | "sm" | "md";
};

export type { AlertType, ModeType, AlertOptions };
