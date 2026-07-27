# Embertop

**서버를 운영하는 사람을 위한 불멍.**

[![CI](https://github.com/seoulpro/embertop/actions/workflows/ci.yml/badge.svg)](https://github.com/seoulpro/embertop/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A522.13-brightgreen.svg)](package.json)

[English](README.md) · [CLI 가이드](docs/CLI.ko.md) · [연동 가이드](docs/INTEGRATION.ko.md) · [보안 정책](SECURITY.md) · [고지](THIRD-PARTY-NOTICES.md)

![Embertop — 모든 요청은 하나의 불씨를 남깁니다](public/og.png)

Embertop은 머신의 실시간 움직임을 모닥불로 바꿉니다. CPU 사용량이 불꽃을
들어 올리고, 메모리가 잔불을 밝히며, 새로 기록된 접근 로그 한 줄이 불씨
하나가 됩니다. 읽어야 할 차트도, 조정할 임계값도, 확인할 알림도 없습니다.
남는 터미널 한 칸에 띄워 두면 불의 모양이 변화를 알려 줍니다.

이름은 잔불을 뜻하는 `ember`와 터미널 모니터 `top`을 합쳤습니다. 남는
터미널에 오래 켜 두는 서버 불멍이라는 뜻입니다.

```bash
git clone https://github.com/seoulpro/embertop.git
cd embertop
npm ci
npm run cli
```

## 불 읽는 법

인터넷에 열려 있는 서버에는 방문자만 오지 않습니다. 그래서 불은 **누가
두드렸는지**와 **서버가 뭐라고 답했는지**를 구분해서 보여 줍니다.

| 불씨 | 의미 |
|---|---|
| 따뜻한 주황, 위로 올라감 | 브라우저로 보이는 방문자 |
| 청록 | 자기를 밝힌 크롤러 — Googlebot, Bingbot, AhrefsBot |
| 잿빛 보라 | 브라우저가 아니거나 신원을 밝히지 않은 요청: `curl`, 스크립트, 빈 User-Agent |
| 호박색, 무릎 높이에서 사그라듦 | 4xx 응답: 서버가 요청을 거절했거나 경로를 찾지 못함 |
| 빨강, 크게 튐 | 5xx 응답: 요청을 처리하던 서버에서 오류가 발생함 |

수치 아래의 60초 막대 두 개가 같은 정보를 흐름이 아니라 **형태**로 보여
줍니다. 누가 두드렸고, 무엇을 받아 갔는지입니다. 각 막대는 자기 구간과
같은 색의 단어로 설명되므로 따로 찾아볼 범례가 없고, 발생하지 않은 항목은
아예 표시되지 않습니다. 그래서 없던 항목이 나타나는 것 자체가 신호가 됩니다.

조용한 사이트는 첫 줄이 대부분 주황, 둘째 줄이 대부분 회색입니다.
`신원 불명`과 `거절 4xx`이 함께 늘어나기 시작하면 누군가 `/wp-login.php`
같은 경로를 훑고 있다는 뜻입니다. 흔한 일이지만, 한 줄도 읽지 않고
알아차릴 수 있어야 하는 일이기도 합니다.

이 막대는 요청 스트림을 클라이언트에서 집계하므로, 문서화된 스키마를
구현한 어떤 소스에서도(직접 만든 것 포함) 동작합니다.

## 이것이 아닌 것

모니터링 시스템이 아닙니다. 알림을 보내지 않고, 이력을 보관하지 않으며,
Grafana나 Netdata, `htop`을 대체하지 않습니다. *지금 무슨 일이 일어나고
있는가* 하나만 답하고, 그 답을 읽지 않아도 알 수 있게 보여 줍니다.

## 두 개의 명령과 선택적인 웹 화면

Embertop은 CLI가 기본입니다. 터미널 UI가 제품 자체이고, 웹 대시보드는 벽면
화면이나 기존 백오피스를 위한 선택적 동반자입니다.

| | 역할 | 실행 위치 |
|---|---|---|
| `embertop watch` | 터미널 속의 불. 기본 명령입니다. | 내 노트북 또는 서버 |
| `embertop serve` | 텔레메트리를 SSE로 내보내는 경량 수집기 | 관찰 대상 서버 |
| 웹 대시보드 | 같은 스트림의 브라우저 화면 | 백오피스 인증 뒤 |

CLI 실행 경로는 Node.js 내장 모듈만 사용하며 백그라운드 서비스를 띄우지
않습니다. 아직 npm에는 게시되지 않았습니다. 이후 예제에서는 읽기 쉽게
설치된 경우의 `embertop` 명령을 사용하며, 체크아웃에서 실행할 때는 이를
`npm run cli --`로 바꾸면 됩니다.

## 로컬 머신 보기

```bash
npm run cli
```

로그를 지정하지 않으면 시스템 활동만 표시합니다. 읽을 수 있는 접근 로그를
하나 이상 추가하면 새로 기록되는 요청이 불씨가 됩니다.

```bash
npm run cli -- --log /var/log/nginx/access.log
npm run cli -- -l /var/log/nginx/site-a.log -l /var/log/nginx/site-b.log
```

Nginx와 JSON 형식은 자동으로 판별합니다. Embertop이 시작한 *이후*에 기록된
줄만 읽으므로, 기존 로그 내용은 다시 재생되지 않습니다.

키: `f` 집중 모드, `space` 또는 `p` 일시정지, `h` 도움말, `q` 종료.

### 플랫폼별 참고 사항

Node.js 22.13 이상이 필요합니다. 로컬 샘플링에 권한 상승은 필요 없지만,
메모리와 load는 운영체제가 제공하는 값의 의미가 조금씩 다릅니다.

| 플랫폼 | 로컬 측정값 | 참고 |
|---|---|---|
| Linux | CPU, `MemAvailable` 기반 메모리, 1분 load average | 주 서버 대상이며 CI와 함께 제공되는 systemd/Nginx 예제가 Linux에서 동작합니다 |
| macOS | CPU, `memory_pressure` 기반 메모리 백분율, 1분 load average | 터미널에서 로컬 프리뷰할 수 있으며, 메모리 값은 Activity Monitor의 ‘사용된 메모리’와 정확히 같지 않습니다 |
| Windows | Node.js 시스템 API 기반 CPU·메모리 | Node.js가 Windows에서 load average를 `0`으로 반환하며, Windows 서비스 예제는 제공하지 않습니다 |

접근 로그는 Node.js 프로세스가 파일을 읽을 수 있는 플랫폼이면 따라갑니다.
이 문서의 `/var/log/nginx/...` 경로와 함께 제공되는 서비스 파일은
크로스플랫폼 기본값이 아니라 Linux 예제입니다. 현재 자동 테스트는
Linux에서 실행되므로 macOS와 Windows에서는 대상 머신에서 동작을
확인하십시오.

## 원격 서버 보기

권장 구성은 수집기를 서버의 localhost에만 띄우고 SSH 터널로 접근하는
방식입니다. 인터넷에 새 포트를 열지 않고, 새 자격 증명도 만들지 않습니다.
SSH 인증을 그대로 씁니다.

**서버에서**, 로그 읽기 권한만 가진 일반 사용자로:

```bash
embertop serve --host 127.0.0.1 --site example.com --log /var/log/nginx/embertop-access.log
```

**내 컴퓨터에서** 터널을 엽니다:

```bash
ssh -N -o ExitOnForwardFailure=yes \
  -L 127.0.0.1:4318:127.0.0.1:4318 operator@example.com
```

**다른 터미널에서** 불 앞에 앉습니다:

```bash
embertop --endpoint http://127.0.0.1:4318/stream
```

로컬 주소를 명시하면 SSH 클라이언트 설정과 관계없이 전달 포트가 loopback에만
열립니다. `ExitOnForwardFailure=yes`는 터널을 만들지 못했을 때 즉시
종료합니다.

수집기는 `root`가 필요 없습니다. 로그 파일에 대한 읽기 전용 권한이면
충분합니다. 함께 제공되는 systemd 유닛은 `User=embertop`, `Group=adm`를
전제로 한 Linux 예제이므로, 로그 그룹이 다른 배포판에서는 값을 바꿔야
합니다. 토큰 없이 loopback 밖 주소에 바인딩하려 하면 거부됩니다.

## 선택 사항: 웹 대시보드

벽면 화면이 필요하거나, 여러 사람이 이미 로그인하는 백오피스 안에 패널로
넣고 싶을 때 유용합니다. 수집기를 프록시하는 Next.js 앱이라서 브라우저에는
수집기 주소와 토큰이 노출되지 않습니다.

업스트림을 설정하지 않으면 CLI와 같은 샘플러로 **Node.js 프로세스에서
보이는 머신**을 읽습니다. 일반 호스트나 VM에서는 해당 호스트지만,
컨테이너에서는 런타임이 노출하는 값이며 cgroup 제한이나 물리 호스트의
수치와 일치한다고 보장하지 않습니다. 측정 대상을 명확히 하려면 수집기나
`EMBERTOP_METRICS_URL`을 사용하십시오.

체크아웃 직후에도 실제 로컬 수치가 나옵니다:

```bash
npm ci && npm run dev
```

읽을 수 있는 접근 로그는 `EMBERTOP_LOG_PATHS`로 붙입니다. Embertop에는
가짜 데이터 모드가 없습니다. 화면에 그려지는 모든 프레임은 실시간 샘플러나
스트림에서 옵니다.

### 실제 운영

빌드하면 런타임 `node_modules`까지 포함한 **자기완결적인
`.next/standalone` 디렉터리**가 나옵니다. 서버에는 호환되는 Node.js
런타임이 필요하지만 별도의 `npm install`은 필요하지 않습니다.

```bash
npm ci && npm run build
```

필요한 것이 전부 `.next/standalone`에 들어갑니다. 서버로 복사한 뒤 실행합니다:

```bash
rsync -a .next/standalone/ operator@example.com:/opt/embertop/web/
```

```bash
NODE_ENV=production PORT=3000 HOSTNAME=127.0.0.1 node /opt/embertop/web/server.js
```

이를 위한 systemd 유닛이 `deploy/embertop-web.service.example`,
앞단 Nginx 예시가 `deploy/nginx.example.conf`입니다. Nginx 쪽에서 SSE
버퍼링을 끄는 것이 중요합니다 — 버퍼링하면 불이 멈춘 것처럼 보입니다.
수집기용 유닛은 `collector/embertop.service.example`에 있습니다.

현재 standalone 번들에는 네이티브 바이너리가 없습니다. 릴리스 빌드는
Linux에서 검증하므로, 다른 운영체제에 배포하거나 의존성 구성을 바꾼
경우에는 대상 운영체제에서 직접 빌드와 테스트를 확인하십시오.

> [!IMPORTANT]
> Embertop에는 자체 로그인 기능이 없습니다. 웹 대시보드는 백오피스를 이미
> 보호하고 있는 인증 뒤에 두십시오. 방문자 식별자를 제거해도 요청 빈도와
> 트래픽 패턴 자체가 운영 정보입니다.

리버스 프록시 구성, 하위 경로 배포, 기존 메트릭 API 재사용은
[연동 가이드](docs/INTEGRATION.ko.md)를 참고하십시오.

## 스크립트에서 쓰기

stdout이 터미널이 아니면 화면을 그리는 대신 JSON Lines를 출력합니다.

```bash
embertop --once | jq .metrics
embertop --json >> telemetry.jsonl
```

`embertop doctor`는 UI를 띄우지 않고 Node 버전, 로그 읽기 가능 여부, 원격
스트림 연결, 수집기 바인딩 안전성을 점검합니다.

## 개인정보

트래픽 데이터는 운영 정보입니다. Embertop은 각 이벤트를 내보내기 전에
민감한 값을 정제합니다.

- 클라이언트 IP 주소는 내보내지 않습니다.
- 쿼리 문자열은 제거합니다.
- 숫자 ID, UUID, 토큰 형태의 경로 조각은 마스킹합니다.
- `--hide-paths`는 모든 경로를 `/…`로 바꿉니다.
- 시작 시점 이전의 로그 내용은 재생하지 않습니다.
- 머신 호스트명은 기본적으로 내보내지 않습니다. 필요한 경우에만 `--site`
  또는 `EMBERTOP_SITE_NAME`으로 라벨을 명시하십시오.
- 수집기는 기본적으로 localhost에 바인딩하고, 그 밖에는 토큰을 요구합니다.
- 업스트림 자격 증명은 서버에만 두며, 웹 프록시는 외부 SSE에서 받은 내용을
  다시 한번 정제합니다.

이 과정은 원본 로그를 다시 쓰지 않습니다. `EMBERTOP_INCLUDE_PATHS=false`
(또는 `--hide-paths`)는 내보내는 이벤트의 경로만 바꾸며, Nginx가 이미
디스크에 기록한 줄에는 영향을 주지 않습니다. Embertop용 접근 로그에도 IP
주소·리퍼러·쿼리 문자열을 남기고 싶지 않다면 [연동
가이드](docs/INTEGRATION.ko.md)의 최소 수집 형식을 사용하세요.

공개 배포 전에 [SECURITY.md](SECURITY.md)를 읽어 주십시오.

## 개발

Node.js 22.13 이상이 필요합니다.

```bash
npm ci
npm run cli -- --once     # JSON 프레임 한 개
npm run dev               # 이 컴퓨터를 읽는 웹 대시보드
npm run typecheck
npm run lint
npm test
```

CI는 모든 풀 리퀘스트에서 웹 빌드, CLI 동작, 개인정보 파서, 패키지 구성을
검증합니다. 기여를 환영합니다. [CONTRIBUTING.md](CONTRIBUTING.md)를 참고하십시오.

## 라이선스

[MIT](LICENSE) © Sumin Lim. 함께 배포되는 서드파티 구성 요소는
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)에 정리되어 있습니다.
