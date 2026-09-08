// Original, authored examples of editing decisions; never story canon or
// passages that the model should paste into the user's manuscript.
export const EDITING_DEMONSTRATIONS = [
  '압축 예시 — 원문: 그는 한동안 아무 말도 하지 않았다. 그는 침묵한 채 서 있었다. / 수정: 그는 한동안 말없이 서 있었다. / 이유: 같은 침묵과 자세의 반복만 합쳤다. 새 감각이나 동기는 추가하지 않았다.',
  '화자 보존 예시 — 주변: 경비병 둘이 속삭였다. / 원문: "문은 해가 지면 닫힌대." / 판단: 이 대사를 듣는 주인공의 동작을 따옴표 안에 추가하지 않는다. 고칠 이유가 없으면 유지한다.',
  '보충 예시 — 원문: 그는 대화를 엿들었다. 다음 날 다른 길로 갔다. / 판단: 경로를 바꾼 이유가 빠졌을 수 있다. 새로운 단서를 발명하기 전에 작가에게 어떤 정보를 얻었는지 확인하고, 승인된 사실만 연결한다.',
].join('\n');
