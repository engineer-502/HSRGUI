# ChatGPT HSR UI Extension

ChatGPT 웹 대화 화면(`chatgpt.com`, `chat.openai.com`)에 Honkai: Star Rail 스타일 채팅 스킨을 적용하는 MV3 크롬 익스텐션입니다.

- 원본 GPT 메시지 렌더러 구조(마크다운/코드/표/이미지/피드백 버튼)는 최대한 유지
- 시각 레이어를 HSR 말풍선/아바타/헤더 스타일로 오버라이드
- 어시스턴트 말풍선 분리 렌더링 + 스티커 자동 삽입
- 팝업에서 캐릭터 프리셋/사용자명/헤더 텍스트 변경 가능

## 주요 기능

1. HSR 채팅 UI 스킨
- 사용자/어시스턴트 버블 스타일 분리
- 캐릭터 아바타 + 이름 표시
- 상단 고정 헤더 스타일 적용

2. 문장 분리 렌더링
- 어시스턴트 문단을 설정값 기준으로 분할(기본 max chars: 180)
- 코드/표/이미지 등 구조형 블록은 원형 유지

3. 스트리밍 표시 제어
- 생성 중에는 로딩 버블(`...`) 기반 표시
- 완료 시점에 버블 렌더링 확정

4. 스티커 삽입
- 현재 정책: 라이브 어시스턴트 응답 기준 `첫 응답 + 2턴당 1회`
- 캐릭터 프리셋 변경 시 스티커팩 자동 교체

5. 캐릭터 프리셋
- `삼칠이 (March. 7th)`
- `아케론`
- `카스토리스`

6. 팝업 프롬프트 복사
- 캐릭터별 페르소나 프롬프트 미리보기
- 버튼 1회로 클립보드 복사 가능

## 실행 방법

### 1) 로컬 로드
1. 크롬에서 `chrome://extensions` 접속
2. 우측 상단 `개발자 모드` ON
3. `압축해제된 확장 프로그램을 로드` 클릭
4. `chatgpt_hsr_extension` 폴더 선택
5. 확장 카드에서 `새로고침(↻)` 후 ChatGPT 탭 새로고침

### 2) 사용
1. ChatGPT 대화 페이지 진입
2. 확장 팝업 열기
3. `Enabled` ON 확인
4. `Actor Preset`, `My Name`, `Header Title/Subtitle` 설정
5. 필요 시 `Persona Prompt`에서 프롬프트 복사 후 GPT 개인 맞춤설정에 붙여넣기

## 폴더 / 코드 구조

```text
chatgpt_hsr_extension/
  manifest.json                 # MV3 설정, 권한, content script/popup 등록
  content/
    content.js                  # 메인 렌더링/관찰/상태관리 로직
    content.css                 # HSR 스킨 스타일 전체
    selectors.js                # ChatGPT DOM 셀렉터/블록 분류/스트리밍 탐지
    splitter.js                 # 문장 분리 알고리즘(ko 우선)
    stickers.js                 # 스티커팩 정의/정규화/랜덤 픽
  popup/
    popup.html                  # 설정 UI(프리셋/이름/헤더/프롬프트 복사)
    popup.js                    # storage sync 저장/불러오기, 프리셋 연동
    popup.css                   # 팝업 스타일
  preview/
    preview.html/.css/.js       # 컴포넌트 샘플 프리뷰
  assets/
    icons/                      # 캐릭터 아바타
    stickers/                   # 스티커 이미지
    symbols/                    # UI 심볼
```

## 주요 설정값 의미 (`hsrConfig`)

- `enabled`: 스킨 활성화 여부
- `splitMaxChars`: 문장 분리 최대 글자수
- `actorPreset`: 캐릭터 프리셋
  - `march7th-stelle`
  - `acheron-stelle`
  - `castorice-stelle`
- `stickerPack`: 프리셋별 스티커 파일 목록
- `userName`: 사용자 말풍선 표시 이름
- `headerTitle`, `headerSubtitle`: 상단 고정 헤더 텍스트

## 캐릭터별 리소스 매핑

- 삼칠이: `assets/icons/March_7th.png`, `sticker_1~16`
- 아케론: `assets/icons/Acheron.png`, `sticker_193~196`
- 카스토리스: `assets/icons/Castorice.png`, `sticker_330, 336~340, 425`

## 트러블슈팅

1. 설정이 반영되지 않음
- `chrome://extensions`에서 확장 `새로고침(↻)`
- ChatGPT 탭 `Ctrl+F5` 하드 리로드

2. 스티커/아이콘이 안 뜸
- `assets/icons`, `assets/stickers` 파일명 대소문자 확인
- `manifest.json`의 `web_accessible_resources` 확인

3. UI가 깨짐
- ChatGPT DOM 업데이트 영향 가능성 있음
- `content/selectors.js` 셀렉터 재점검 필요

---

## 법적 고지 및 책임 의무 (Fan-made / Unofficial)

이 프로젝트는 팬메이드 비공식 UI 테마 확장 프로그램입니다.  
`Honkai: Star Rail`, `HoYoverse` 및 관련 명칭/로고/콘텐츠의 권리는 각 권리자에게 있습니다.

1. 이 저장소는 공식 제품이 아니며, HoYoverse와 제휴·승인·보증 관계가 없습니다.
2. 본 프로젝트는 비상업적 목적의 팬 활동을 전제로 하며, 사용자는 상업적 사용을 금지합니다.
3. 본 프로젝트에 포함되거나 참조된 제3자 코드/리소스는 각 원저작자 및 라이선스 조건을 따릅니다.
4. 권리자 요청(삭제/수정/비공개)이 접수될 경우, 관리자는 해당 콘텐츠를 지체 없이 제거 또는 비공개 처리할 수 있습니다.
5. GitHub DMCA 또는 기타 권리침해 신고가 접수될 경우, 해당 플랫폼 정책에 따라 즉각적인 조치를 취합니다.
6. 사용자는 본 프로젝트 사용으로 발생할 수 있는 정책 위반·권리 침해 위험을 스스로 확인하고 책임져야 합니다.

### 면책 및 책임 범위

- 본 저장소는 "있는 그대로(AS IS)" 제공되며, 특정 목적 적합성/완전성/지속적 동작을 보증하지 않습니다.
- 사용자가 본 저장소를 다운로드, 수정, 재배포, 포크하여 발생한 모든 결과(정책 위반, 권리 침해, 계정 제재, 손해 포함)는 해당 사용자 또는 행위자 본인 책임입니다.
- 저장소 관리자/기여자는 법령상 허용되는 최대 범위에서, 본 프로젝트 사용 또는 사용 불가로 인해 발생한 직·간접적 손해에 대해 책임을 지지 않습니다.
- 제3자가 본 저장소를 재게시/재배포하며 추가한 내용에 대한 법적 책임은 해당 게시자에게 있으며, 원 저장소 관리자에게 자동 승계되지 않습니다.

### 권리자 문의 / 삭제 요청

권리자 또는 대리인은 아래 연락처로 요청할 수 있습니다.  
- Contact: `axwhalesolution@gmail.com`
- 권리자의 요청 시 즉각적인 조치(삭제/수정)를 진행합니다.

---
