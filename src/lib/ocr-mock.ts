/** OCR API 키가 없을 때 쓰는 목 추출 */
export async function mockOcrFromImage(file: File): Promise<string> {
  await new Promise((r) => setTimeout(r, 500));
  const name = file.name.replace(/\.[^.]+$/, "");
  return [
    `오늘 ${name || "손글씨 메모"} 확인`,
    "후보자 연락처 정리 — 이번 주",
    "언젠가 명함함 정리",
  ].join("\n");
}
