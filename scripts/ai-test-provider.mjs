import { randomUUID } from "node:crypto";
// Loaded only by test-ai.mjs into its isolated server process.
if (process.env.MATRIX_AI_TEST !== "1")
  throw new Error("Test provider requires isolated test mode");
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  if (!url.startsWith("https://api.openai.com/v1/"))
    return originalFetch(input, init);
  if (url.endsWith("/models"))
    return Response.json({
      data: [
        { id: "gpt-5.6-sol" },
        { id: "gpt-4o-mini" },
        { id: "gpt-3.5-turbo" },
        { id: "gpt-audio" },
      ],
    });
  const data = JSON.parse(init.body);
  const content = Array.isArray(data.input)
    ? data.input.findLast((item) => item.role === "user").content
    : data.input;
  const rawInput = Array.isArray(content)
    ? content.find((item) => item.type === "input_text").text
    : content;
  const imageInputs = Array.isArray(content)
    ? content.filter((item) => item.type === "input_image")
    : [];
  const userInput = JSON.parse(rawInput);
  const usage = rawInput.includes("[NO_USAGE]")
    ? {}
    : {
        id: rawInput.includes("[DUPLICATE_USAGE]")
          ? "resp-duplicate-test"
          : `resp_${randomUUID()}`,
        model: data.model,
        usage: rawInput.includes("[BAD_USAGE]")
          ? { input_tokens: -1, output_tokens: 20, total_tokens: 19 }
          : {
              input_tokens: 100,
              output_tokens: 40,
              total_tokens: 140,
              input_tokens_details: { cached_tokens: 20 },
              output_tokens_details: { reasoning_tokens: 10 },
            },
      };
  if (rawInput.includes("[NETWORK_FAIL]")) throw Error("test network failure");
  if (rawInput.includes("[BROKEN_JSON]"))
    return new Response("broken json", { status: 200 });
  const toolOutputs = Array.isArray(data.input)
    ? data.input.filter((item) => item.type === "function_call_output")
    : [];
  if (userInput.request.includes("[TOOL]")) {
    const spec = JSON.parse(
      Buffer.from(userInput.request.split("[TOOL]")[1], "base64").toString(
        "utf8",
      ),
    );
    if (!toolOutputs.length)
      return Response.json({
        ...usage,
        status: "completed",
        output: [
          {
            type: "function_call",
            call_id: "tool-1",
            name: spec.name,
            arguments: JSON.stringify(spec.args),
          },
        ],
      });
    if (userInput.request.includes("[FAIL_AFTER_WRITE]"))
      return Response.json({}, { status: 429 });
    return Response.json({
      ...usage,
      status: "completed",
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: toolOutputs.at(-1).output }],
        },
      ],
    });
  }
  if (rawInput.includes("[FAIL]"))
    return Response.json(
      { error: { message: "never expose test-secret-key" } },
      { status: 429 },
    );
  const text = rawInput.includes("[UI]")
    ? "회원 관리 화면 설계 초안\n\n1. 회원 목록: 이름·이메일 검색, 가입 상태 필터\n2. 상세 화면: 기본 정보 및 권한 표시\n3. 입력 검증: 필수값·이메일 형식 확인\n4. 연계: 요구사항·회원 조회 API·회원 테이블 연결\n\n검수 기준: 조회·등록·수정·삭제 흐름을 확인합니다."
    : JSON.stringify({
        instructions: data.instructions,
        input: userInput,
        model: data.model,
        store: data.store,
        historyRoles: Array.isArray(data.input)
          ? data.input
              .filter((item) => item.role)
              .slice(0, -1)
              .map((item) => item.role)
          : [],
        previousRequests: Array.isArray(data.input)
          ? data.input
              .filter((item) => item.role === "user")
              .slice(0, -1)
              .map((item) =>
                Array.isArray(item.content)
                  ? item.content.find((part) => part.type === "input_text").text
                  : item.content,
              )
          : [],
        historyImageCount: Array.isArray(data.input)
          ? data.input
              .filter((item) => item.role === "user")
              .slice(0, -1)
              .flatMap((item) =>
                Array.isArray(item.content)
                  ? item.content.filter((part) => part.type === "input_image")
                  : [],
              ).length
          : 0,
        imageCount: imageInputs.length,
        imageTypes: imageInputs.map((image) => image.image_url.split(";")[0]),
      });
  return Response.json({
    ...usage,
    status: rawInput.includes("[INCOMPLETE]") ? "incomplete" : "completed",
    output: [
      { type: "reasoning", summary: [] },
      { type: "message", content: [{ type: "output_text", text }] },
    ],
  });
};
