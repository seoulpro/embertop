# Embertop CLI

[English](CLI.md)

CLI는 웹 대시보드와 같은 텔레메트리를 터미널에 맞게 보여줍니다. CLI 실행
경로는 Node.js 내장 모듈만 사용하지만, 저장소 전체를 내려받아 설치하면 웹
대시보드 개발 의존성도 함께 설치됩니다.

## 설치

소스 체크아웃에서 실행:

```bash
cd embertop
npm ci
npm run cli --
```

현재 Node.js 도구 체인에 명령을 연결할 수도 있습니다.

```bash
npm link
embertop
```

## `embertop watch`

`watch`는 기본 명령입니다.

```bash
embertop [watch] [options]
```

로컬 텔레메트리:

```bash
embertop --site example.com
```

로컬 텔레메트리와 접근 로그:

```bash
embertop \
  --log /var/log/nginx/access.log \
  --format nginx
```

원격 텔레메트리:

```bash
EMBERTOP_TOKEN=secret \
  embertop --endpoint https://telemetry.example.com/stream
```

옵션:

| 옵션 | 용도 |
|---|---|
| `-e, --endpoint URL` | Embertop SSE 스트림 연결 |
| `-t, --token TOKEN` | SSE bearer token. `EMBERTOP_TOKEN` 사용 권장 |
| `-l, --log PATH` | 접근 로그 tail. 여러 번 지정 가능 |
| `--format FORMAT` | `auto`, `nginx`, `json` 중 하나 |
| `--site NAME` | 화면에 표시할 이름 |
| `--interval MS` | 750~30000ms 범위의 로컬 샘플링 간격 |
| `--focus` | 수치와 로그를 감춘 멍 모드로 시작 |
| `--ascii` | 블록·선 문자를 ASCII로 치환 |
| `--json` | JSON Lines 출력 |
| `--once` | JSON 프레임 하나를 출력하고 종료 |
| `--no-color` | ANSI 색상 비활성화 |
| `--hide-paths` | 모든 요청 경로를 `/…`로 치환 |

표준 출력이 TTY가 아니면 JSON Lines 모드가 자동 선택되므로 스크립트와
파이프에서 안전하게 사용할 수 있습니다.

환경이 지원한다고 알리면 UTF-8 문자와 256색 팔레트를 사용합니다. 활성
로케일이 UTF-8이 아니면 ASCII로, 256색을 지원하지 않으면 절제된 16색
팔레트로 자동 전환합니다. ASCII를 강제하려면 `--ascii`, 색상을 끄려면
`NO_COLOR=1`을 사용하세요.

운영체제 로케일과 관계없이 화면 언어는 영어가 기본입니다. 선택적으로
한국어 화면을 사용하려면 `EMBERTOP_LANG=ko`를 설정하세요.

## `embertop serve`

웹 대시보드와 원격 CLI가 사용할 인증된 SSE 수집기를 시작합니다.

```bash
EMBERTOP_COLLECTOR_TOKEN=secret \
  embertop serve \
  --host 0.0.0.0 \
  --port 4318 \
  --log /var/log/nginx/access.log
```

토큰 없이 localhost 외 주소에 바인딩하는 요청은 거부됩니다.

### 권장 구성: 수집기는 서버에, 불은 내 컴퓨터에

수집기를 인터넷에 노출하면 인증이 필요한 서비스를 하나 더 운영하게 됩니다.
대개는 그럴 필요가 없습니다. localhost에만 바인딩하고 SSH 터널로 접근하면
인증은 SSH 하나로 끝납니다.

서버에서:

```bash
embertop serve \
  --host 127.0.0.1 \
  --site example.com \
  --log /var/log/nginx/access.log
```

내 컴퓨터의 터미널 하나에서:

```bash
ssh -N -L 4318:127.0.0.1:4318 operator@example.com
```

다른 터미널에서:

```bash
embertop --endpoint http://127.0.0.1:4318/stream
```

수집기에는 `root` 권한이 필요하지 않습니다. 계정에 로그 파일 읽기 전용
권한만 주면 되며, 함께 제공되는 `collector/embertop.service.example`도
`User=embertop`, `Group=adm`를 전제로 합니다.

추가 옵션:

| 옵션 | 용도 |
|---|---|
| `--host HOST` | 수신 주소 |
| `--port PORT` | 수신 포트 |
| `--metrics-url URL` | 기존 CPU·메모리·load JSON API 폴링 |
| `--metrics-token TOKEN` | 지표 API bearer token |

## `embertop doctor`

UI를 시작하지 않고 현재 설정을 확인합니다.

```bash
embertop doctor --log /var/log/nginx/access.log
EMBERTOP_TOKEN=secret embertop doctor -e https://host.example/stream
```

Node.js 버전, 로그 읽기 권한, 로컬 지표 또는 원격 SSE, 수집기 바인딩 안전성을
검사합니다.

## 환경 변수

명령줄 값은 환경 변수보다 우선합니다.

| 변수 | 사용 모드 |
|---|---|
| `EMBERTOP_ENDPOINT` | 터미널 원격 모드 |
| `EMBERTOP_TOKEN` | 터미널 원격 모드 |
| `EMBERTOP_SITE_NAME` | 모든 모드(기본값: `this-machine`) |
| `EMBERTOP_LOG_PATHS` | 로컬 터미널과 수집기 |
| `EMBERTOP_LOG_FORMAT` | 로컬 터미널과 수집기 |
| `EMBERTOP_INCLUDE_PATHS` | 로컬 터미널과 수집기 |
| `EMBERTOP_SAMPLE_INTERVAL_MS` | 로컬 터미널과 수집기 |
| `EMBERTOP_HOST` / `EMBERTOP_PORT` | 수집기 |
| `EMBERTOP_COLLECTOR_TOKEN` | 수집기 |
| `EMBERTOP_METRICS_URL` | 로컬 터미널과 수집기 |
| `EMBERTOP_METRICS_TOKEN` | 로컬 터미널과 수집기 |
| `EMBERTOP_LANG` | 터미널 UI 언어(기본 `en`, 선택 `ko`) |
| `NO_COLOR` | 터미널 UI |

명령줄 인수로 전달한 토큰은 프로세스 목록에 노출될 수 있습니다. 공유
시스템에서는 환경 변수 사용을 권장합니다.
