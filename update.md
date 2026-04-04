# Update Notes

Date: 2026-04-04

## Summary

- 캐릭터 카탈로그의 표시 이름을 한국 서비스 기준 표기로 전환했다.
- 기존 영어 이름은 검색 토큰으로 유지해서 영문 검색 호환성을 보존했다.
- 채팅 UI에서 user / assistant 프로필 라인과 말풍선 사이의 세로 간격을 통일했다.
- user 이름/아바타 라인의 정렬을 assistant 쪽과 같은 기준으로 맞췄다.
- assistant 응답에서 중첩 래퍼가 생길 때 바깥 큰 흰 박스가 보이는 현상을 줄이기 위해 CSS 평면화 규칙을 추가했다.

## Updated Files

- `chatgpt_hsr_extension/shared/characterCatalog.js`
- `chatgpt_hsr_extension/content/content.css`

## Detailed Changes

### Character Catalog

- `LOCALIZED_DISPLAY_NAMES` 맵을 추가했다.
- 팝업과 렌더러에서 보이는 `displayName`을 한국어 표기로 바꿨다.
- 영어 이름은 `aliases` / `searchTokens`에 남겨 검색과 기존 식별 흐름이 깨지지 않도록 처리했다.

### Chat Layout

- user 프로필 메타를 절대 위치 배치에서 일반 흐름 배치로 정리했다.
- user 이름 텍스트의 세로 오프셋을 제거했다.
- 프로필/이름 라인과 말풍선 사이 간격을 `--hsr-meta-bubble-gap` 변수로 통일했다.
- assistant 컨테이너와 block wrapper 안에 다시 wrapper가 중첩될 경우, 바깥 래퍼를 투명화해서 큰 흰 배경 박스가 겹쳐 보이는 현상을 줄였다.

## Notes

- 이번 반영에는 스트리밍 처리 로직 변경은 포함하지 않았다.
- 현재 스티커 할당 구조는 기존 shared character catalog 기준을 유지한다.
