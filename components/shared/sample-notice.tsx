import { Icon } from "@/components/icon";
export function SampleNotice({ dashboard = false }: { dashboard?: boolean }) {
  return dashboard ? (
    <div className="sample-notice">
      <Icon name="eye" size={15} />
      <span>
        <b>
          내 프로젝트는 실제 데이터입니다. 요구사항·화면·팀원 지표와 최근 활동은
          샘플입니다.
        </b>
      </span>
      <span className="sample-pill">SAMPLE DATA</span>
    </div>
  ) : (
    <div className="sample-notice">
      <Icon name="eye" size={15} />
      <span>
        화면 미리보기{" "}
        <b>샘플 데이터로 구성되어 있습니다. 등록·편집 기능은 준비 중입니다.</b>
      </span>
      <span className="sample-pill">PUBLISHING</span>
    </div>
  );
}
