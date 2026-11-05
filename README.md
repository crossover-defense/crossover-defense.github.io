# Crossover Defense

Phaser + TypeScript로 만든 웹 실시간 카드 디펜스의 초기 전투 프로토타입입니다. 격자형 지형과 방향 배치를 중심으로 구성하며, 현재 수치와 포켓몬 역할은 모두 실험용입니다.

## 실행과 검증

Node.js 24 LTS 권장(최소 22.12), npm이 필요합니다.

```sh
npm ci
npm run dev
npm test
npm run typecheck
npm run build
npm run preview
npm run learning:check
```

개발 서버가 출력하는 URL을 엽니다. PowerShell에서 npm.ps1이 막히면 npm.cmd를 사용합니다. preview는 기존 dist를 제공하므로 소스 변경 후 다시 build해야 합니다. dist/index.html은 생성 파일이므로 직접 수정하지 않습니다.

## 전투 조작

1. 하단 포켓몬과 배치 방향을 선택합니다.
2. 맵 타일을 클릭/터치합니다. 피카츄·파이리는 높은 타일, 이상해씨·꼬부기는 지상 타일에 배치합니다.
3. 작전 시작을 누릅니다. 준비 중에도 배치할 수 있습니다.
4. 범위 안의 적을 자동 공격하고, 지상 유닛은 적을 저지하며 피해를 받습니다.
5. 배치된 유닛을 선택하면 범위 확인과 철수가 가능합니다. 일시정지·2배속·재시작을 지원합니다.

모바일은 가로 방향을 권장합니다. 임시 포켓몬 표식은 직접 그린 도형이며 공식 이미지 다운로드가 필요하지 않습니다.

## 임시 규칙과 데이터

- 맵 11×6, 적 16개체, 초기 방어 수치 5, 동시 배치 4개체.
- 초기 코스트 24, 전투 중 초당 1 회복, 상한 99. 정지/준비 중에는 회복하지 않습니다.
- 같은 포켓몬은 동시에 한 개체만 배치합니다. 철수 코스트 반환과 재배치 대기시간은 없습니다. 재배치 시 원래 코스트를 다시 냅니다.
- 공격 범위는 배치 방향 기준 직사각형, 방어 지점에 가장 가까운 적부터 공격합니다.
- 모든 적이 격파되거나 통과했고 방어 수치가 남으면 성공, 방어 수치 0이면 실패합니다. 일부 적이 통과해도 성공할 수 있습니다.
- 덱·드로우·스킬·속성 상성·주문·저장·에디터는 아직 없습니다. 적은 단일 훈련용 표식입니다.

디버깅용 승리 예: 피카츄를 (3,2)에 아래 방향, 이상해씨를 (5,3)에 왼쪽 방향으로 먼저 배치합니다. 전투 중 코스트 14가 모이면 파이리를 (4,4)에 오른쪽, 이후 12가 모이면 꼬부기를 (7,5)에 왼쪽으로 배치합니다. 좌표는 화면의 1부터 시작하는 열·행 표기입니다. 이 흐름은 자동 테스트에서도 확인합니다.

## 파일 역할

| 경로 | 역할 |
| --- | --- |
| index.html / src/style.css | 전황·배치 목록·선택 패널·반응형 UI |
| src/main.ts | HTML 입력과 전투 상태/Phaser 연결 |
| src/core/battle.ts | Phaser와 독립적인 배치·이동·저지·공격·승패 |
| src/game/BattleScene.ts | 타일 좌표 변환, 렌더링, 타일 입력, 고정 시간 업데이트 |
| src/data/stage.json | 타일, 이동 경로, 적과 전투 임시 수치 |
| src/data/pokemon.json | 포켓몬의 역할·지형·공격·체력·범위 |
| src/game/BootScene.ts / src/data/demo.json | 보관된 최초 실행 확인 예제(현재 미사용) |
| tests/battle.test.mjs / tsconfig.test.json | Node 기본 테스트 도구로 순수 로직 검사 |
| tsconfig.json / vite.config.ts | strict 타입 검사와 정적 빌드 |
| package.json / package-lock.json | 명령과 재현 가능한 의존성 |
| AGENTS.md | 작업·한글 주석·검증·학습 자료 지침 |
| learning/ | 로컬 학습 문서·연습·답안(Git 제외) |
| .github/workflows/deploy.yml | main을 테스트·빌드하고 dist만 Pages에 배포 |

전투 수치는 JSON에서 조정합니다. 코드의 시간 단위는 초, 좌표 단위는 타일입니다. 렌더링 밀리초와 픽셀은 BattleScene에서만 변환합니다. 외부 JSON을 받게 되면 런타임 검증을 추가해야 합니다.

## Git·배포

main은 안정 배포, develop은 개발 통합, feature/*는 기능 개발에 사용합니다. 커밋·Push는 사용자 요청이 있을 때만 수행합니다. 루트 Pages이므로 Vite base는 '/'입니다. 프로젝트 Pages로 옮길 때 '/저장소이름/'으로 바꿉니다.

저장소 Settings → Pages → Source를 GitHub Actions로 설정한 후 main Push 또는 수동 workflow 실행으로 배포합니다. 이 작업에서는 실제 배포하지 않습니다. 업로드 대상은 dist뿐입니다. tests·learning·tools·.env는 배포하지 않습니다. public에 둔 파일은 그대로 복사되므로 개발 파일을 넣지 않습니다. 개발용 에디터는 필요할 때 tools/에 추가하고 게임에서 import하지 않습니다.

.env 파일은 Git에서 제외하지만 브라우저에 포함한 값은 공개됩니다. VITE_*에 비밀을 넣지 않습니다. IndexedDB/Firebase/Google 로그인은 후속 검토 사항입니다.

학습은 learning/README.md부터 시작합니다. learning은 Git 제외이므로 다른 PC로 clone하면 복원되지 않습니다. 필요하면 로컬 백업합니다.

참고: [Vite](https://vite.dev/guide/), [Pages 배포](https://vite.dev/guide/static-deploy), [Phaser](https://phaser.io/oss/docs/phaser/getting-started/installation).
