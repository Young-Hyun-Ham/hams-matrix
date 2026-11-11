import type { SettingsInput, SystemSettings } from "./types";

export const defaultErrorMessages: Record<string, string> = {
  "400": "요청 내용을 확인한 뒤 다시 시도해 주세요.",
  "401": "로그인 정보가 만료되었습니다. 다시 로그인해 주세요.",
  "403":
    "이 작업을 수행할 권한이 없습니다. 워크스페이스 관리자에게 문의해 주세요.",
  "404":
    "요청한 항목을 찾을 수 없습니다. 삭제되었거나 주소가 변경되었는지 확인해 주세요.",
  "405":
    "지원하지 않는 요청 방식입니다. 화면을 새로고침한 뒤 다시 시도해 주세요.",
  "408":
    "요청 처리 시간이 초과되었습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.",
  "409":
    "현재 상태가 변경되어 요청을 완료하지 못했습니다. 최신 내용을 확인한 뒤 다시 시도해 주세요.",
  "410": "더 이상 사용할 수 없는 항목입니다. 최신 목록에서 다시 선택해 주세요.",
  "413":
    "전송할 파일 또는 데이터의 크기가 허용 범위를 초과했습니다. 크기를 줄여 다시 시도해 주세요.",
  "415": "지원하지 않는 파일 또는 데이터 형식입니다. 형식을 확인해 주세요.",
  "422":
    "입력한 내용에 처리할 수 없는 값이 있습니다. 표시된 항목을 확인해 주세요.",
  "425": "요청을 처리할 준비가 되지 않았습니다. 잠시 후 다시 시도해 주세요.",
  "429": "요청이 너무 많습니다. 잠시 기다린 뒤 다시 시도해 주세요.",
  "500":
    "서버에서 요청을 처리하는 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
  "501":
    "현재 서버에서 지원하지 않는 기능입니다. 워크스페이스 관리자에게 문의해 주세요.",
  "502": "연동 서버의 응답을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.",
  "503": "서비스를 일시적으로 이용할 수 없습니다. 잠시 후 다시 시도해 주세요.",
  "504": "연동 서버의 응답 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.",
  NETWORK_ERROR:
    "서버에 연결할 수 없습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.",
  TIMEOUT: "응답 대기 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.",
  UNKNOWN_ERROR: "요청을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.",
};
export function defaultSettings(workspaceId: string): SystemSettings {
  return {
    workspaceId,
    staleTimeMs: 60000,
    retryCount: 3,
    errorMessages: { ...defaultErrorMessages },
    version: 0,
    source: "default",
  };
}
export function validateSettings(value: unknown): SettingsInput {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("올바른 설정 객체가 필요합니다.");
  const input = value as Record<string, unknown>;
  if (
    Object.keys(input).some(
      (k) =>
        ![
          "staleTimeMs",
          "retryCount",
          "errorMessages",
          "expectedVersion",
        ].includes(k),
    )
  )
    throw new Error("지원하지 않는 설정 항목입니다.");
  const { staleTimeMs, retryCount, expectedVersion, errorMessages } = input;
  if (
    typeof staleTimeMs !== "number" ||
    !Number.isSafeInteger(staleTimeMs) ||
    staleTimeMs < 0 ||
    staleTimeMs > 86400000 ||
    staleTimeMs % 1000
  )
    throw new Error("유지 시간은 0~86400초 정수여야 합니다.");
  if (
    typeof retryCount !== "number" ||
    !Number.isSafeInteger(retryCount) ||
    retryCount < 0 ||
    retryCount > 10
  )
    throw new Error("재시도 횟수는 0~10 정수여야 합니다.");
  if (
    typeof expectedVersion !== "number" ||
    !Number.isSafeInteger(expectedVersion) ||
    expectedVersion < 0
  )
    throw new Error("최신 설정 버전이 필요합니다.");
  if (
    !errorMessages ||
    typeof errorMessages !== "object" ||
    Array.isArray(errorMessages)
  )
    throw new Error("오류 메시지 사전이 필요합니다.");
  const entries = Object.entries(errorMessages);
  if (
    entries.length > 64 ||
    Object.keys(defaultErrorMessages).some(
      (k) => !Object.hasOwn(errorMessages, k),
    )
  )
    throw new Error("기본 오류 코드를 포함해 최대 64개까지 입력하세요.");
  for (const [key, message] of entries) {
    if (
      !/^(?:[45]\d{2}|NETWORK_ERROR|TIMEOUT|UNKNOWN_ERROR)$/.test(key) ||
      typeof message !== "string" ||
      !message.trim() ||
      message.trim().length > 500
    )
      throw new Error("오류 코드와 메시지(1~500자)를 확인하세요.");
  }
  return {
    staleTimeMs,
    retryCount,
    expectedVersion,
    errorMessages: Object.fromEntries(
      entries.map(([k, v]) => [k, (v as string).trim()]),
    ),
  };
}

export const defaultErrorDescriptions: Record<string, string> = {
  "400": "잘못된 요청",
  "401": "인증 필요·만료",
  "403": "접근 권한 없음",
  "404": "대상 없음",
  "405": "허용하지 않는 요청 방식",
  "408": "요청 시간 초과",
  "409": "데이터·업무 상태 충돌",
  "410": "더 이상 사용할 수 없는 항목",
  "413": "업로드 용량 초과",
  "415": "지원하지 않는 형식",
  "422": "입력 내용 검증 실패",
  "425": "요청 처리가 아직 준비되지 않음",
  "429": "요청 횟수 제한",
  "500": "서버 내부 오류",
  "501": "지원하지 않는 기능",
  "502": "연동 서버 응답 오류",
  "503": "서비스 일시 이용 불가",
  "504": "연동 서버 시간 초과",
  NETWORK_ERROR: "HTTP 응답을 받지 못함",
  TIMEOUT: "클라이언트 타임아웃",
  UNKNOWN_ERROR: "미등록 상태·기타 요청 오류",
};

export function parseSettingsInput(raw: string): SettingsInput {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("올바른 JSON 설정이 필요합니다.");
  }
  const stack: { object: boolean; keys: Set<string>; key: boolean }[] = [];
  for (const match of raw.matchAll(
    /"(?:\\.|[^"\\])*"|[{}\[\]:,]|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/g,
  )) {
    const token = match[0];
    if (token === "{" || token === "[") {
      stack.push({
        object: token === "{",
        keys: new Set(),
        key: token === "{",
      });
      continue;
    }
    if (token === "}" || token === "]") {
      stack.pop();
      continue;
    }
    const frame = stack.at(-1);
    if (!frame?.object) continue;
    if (token === ",") frame.key = true;
    else if (frame.key && token.startsWith('"')) {
      const key = JSON.parse(token) as string;
      if (frame.keys.has(key))
        throw new Error("중복된 설정 항목 또는 오류 코드입니다.");
      frame.keys.add(key);
      frame.key = false;
    }
  }
  return validateSettings(value);
}
