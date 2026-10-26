"use client";

export function VerificationStructureEditor() {
  return (
    <fieldset className="matrix-structure">
      <legend>검증 버전 확인</legend>
      <p>
        검증 실행 결과를 저장하면 현재 연결 문서와 상위 설계의 버전을
        기록합니다. 문서가 변경되면 재검증 필요로 표시됩니다.
      </p>
      <label className="matrix-confirm">
        <input type="checkbox" name="confirmExecution" />
        현재 연결 문서 버전으로 실행한 검증 결과임을 확인합니다.
      </label>
    </fieldset>
  );
}
