// Explicit test-process import only. All vendor calls are synthetic.
const original = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  if (!url.startsWith("https://api.openai.com/")) return original(input, init);
  if (url.endsWith("/models"))
    return Response.json({
      data: [{ id: "gpt-chatbot-test" }, { id: "gpt-image-chatbot-test" }],
    });
  if (url.endsWith("/responses")) {
    const request = JSON.parse(init.body);
    const instructions = request.instructions ?? "";
    const text = instructions.includes("Mermaid 도식")
      ? 'flowchart TD\n A["시작"] --> B["완료"]'
      : instructions.includes("문서 작성 담당자")
        ? "# 브라우저 문서\n\n## 개요\n완성된 문서 본문\n\n| 항목 | 설명 |\n| --- | --- |\n| 결과 | 문서 생성 |\n\n---\n## 다음 장\n슬라이드 내용"
        : "브라우저 모의 답변";
    let decision = {
      kind: "answer",
      text,
      intent: "general",
      field: "",
      title: "",
      options: [],
      allowCustom: false,
    };
    if (
      request.input?.at(-1)?.content?.[0]?.text.includes("모호한 정리 요청")
    ) {
      if (instructions.includes("확정 조건(데이터): []"))
        decision = {
          kind: "clarify",
          text: "정리할 방향을 선택해 주세요.",
          intent: "organize",
          field: "purpose",
          title: "정리 방향",
          options: [
            {
              id: "summary",
              label: "요약",
              value: "핵심 요약",
              action: "select",
            },
            { id: "custom", label: "다른 목적", value: "", action: "custom" },
          ],
          allowCustom: true,
        };
      else decision = { ...decision, text: "선택한 목적을 반영했습니다." };
    }
    return Response.json({
      output: [
        {
          content: [
            {
              type: "output_text",
              text:
                request.text?.format?.name === "chatbot_decision"
                  ? JSON.stringify(decision)
                  : text,
            },
          ],
        },
      ],
      usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
    });
  }
  throw Error("Browser test forbids unmocked vendor operations");
};
