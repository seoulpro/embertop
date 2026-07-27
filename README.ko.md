# Embertop

**서버를 운영하는 사람을 위한 불멍.**

[![CI](https://github.com/seoulpro/embertop/actions/workflows/ci.yml/badge.svg)](https://github.com/seoulpro/embertop/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A522.13-brightgreen.svg)](package.json)

[English](README.md) · [CLI 가이드](docs/CLI.ko.md) · [연동 가이드](docs/INTEGRATION.ko.md) · [보안 정책](SECURITY.md) · [고지](THIRD-PARTY-NOTICES.md)

![Embertop — 모든 요청은 하나의 불씨를 남깁니다](public/og.png)

Embertop은 서버의 트래픽을 모닥불로 바꿉니다. 요청 하나가 불씨 하나로 튀고,
CPU 사용량이 불꽃을 들어 올리고, 메모리 사용량이 잔불을 밝게 유지합니다.
차트도 임계값도 확인 버튼도 없습니다. 남는 터미널 한 칸에 띄워 두고 가끔
쳐다보면 됩니다.

이름은 잔불을 뜻하는 `ember`와 터미널 모니터 `top`을 합쳤습니다. 남는
터미널에 오래 켜 두는 서버 불멍이라는 뜻입니다.

```bash
npx embertop
```

## 불 읽는 법

인터넷에 열려 있는 서버에는 방문자만 오지 않습니다. 그래서 불은 **누가
두드렸는지**와 **서버가 뭐라고 답했는지**를 구분해서 보여 줍니다.

| 불씨 | 의미 |
|---|---|
| 따뜻한 주황, 위로 올라감 | 방문자에게 정상 응답 |
| 청록 | 자기를 밝힌 크롤러 — Googlebot, Bingbot, AhrefsBot |
| 잿빛 보라 | 신원을 밝히지 않은 요청: `curl`, 스크립트, 빈 User-Agent |
| 호박색, 무릎 높이에서 사그라듦 | 4xx. 페이지가 되지 못한 요청이라 불을 키우지 않습니다 |
| 빨강, 크게 튐 | 5xx. 호출자가 아니라 내 서버가 깨진 것 |

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

CLI 실행 경로는 Node.js 내장 모듈만 사용합니다. 로컬 머신을 보는 데는
아무것도 설치할 필요가 없습니다.

## 로컬 머신 보기

```bash
npx embertop
```

설정도 권한 상승도 없이 CPU·메모리·load average를 봅니다. 접근 로그를
추가하면 요청이 불씨가 됩니다.

```bash
embertop --log /var/log/nginx/access.log
embertop -l /var/log/nginx/site-a.log -l /var/log/nginx/site-b.log
```

Nginx와 JSON 형식은 자동으로 판별합니다. Embertop이 시작한 *이후*에 기록된
줄만 읽으므로, 기존 로그 내용은 다시 재생되지 않습니다.

키: `f` 집중 모드, `space` 또는 `p` 일시정지, `h` 도움말, `q` 종료.

## 원격 서버 보기

권장 구성은 수집기를 서버의 localhost에만 띄우고 SSH 터널로 접근하는
방식입니다. 인터넷에 새 포트를 열지 않고, 새 자격 증명도 만들지 않습니다.
SSH 인증을 그대로 씁니다.

**서버에서**, 로그 읽기 권한만 가진 일반 사용자로:

```bash
embertop serve --host 127.0.0.1 --site example.com --log /var/log/nginx/access.log
```

**내 컴퓨터에서** 터널을 엽니다:

```bash
ssh -N -L 4318:127.0.0.1:4318 operator@example.com
```

**다른 터미널에서** 불 앞에 앉습니다:

```bash
embertop --endpoint http://127.0.0.1:4318/stream
```

수집기는 `root`가 필요 없습니다. 로그 파일에 대한 읽기 전용 권한이면
충분하며, 함께 제공되는 서비스 파일도 `User=embertop`, `Group=adm`를
전제로 합니다. 토큰 없이 loopback 밖 주소에 바인딩하려 하면 거부됩니다.

## 선택 사항: 웹 대시보드

벽면 화면이 필요하거나, 여러 사람이 이미 로그인하는 백오피스 안에 패널로
넣고 싶을 때 유용합니다. 수집기를 프록시하는 Next.js 앱이라서 브라우저에는
수집기 주소와 토큰이 노출되지 않습니다.

업스트림을 설정하지 않으면 **웹 서버가 돌고 있는 그 컴퓨터**를 CLI와 같은
샘플러로 읽습니다. 설정 없이, 체크아웃 직후 바로 실제 수치가 나옵니다:

```bash
npm ci && npm run dev
```

접근 로그는 CLI와 동일하게 `EMBERTOP_LOG_PATHS`로 붙입니다. Embertop에는
가짜 데이터 모드가 없습니다. 화면에 그려지는 모든 프레임은 실제로 일어난
일입니다.

### 실제 운영

빌드하면 **자기완결적인 디렉터리**(약 22MB, 자체 `node_modules` 포함)가
나오고, 서버에서는 설치 과정 없이 순수 Node로 실행됩니다.

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

메이저 Node 버전만 같으면 어디서 빌드해도 됩니다. 산출물에 아키텍처 종속
파일이 없기 때문입니다 — 네이티브 바이너리가 하나도 포함되지 않습니다.

> [!IMPORTANT]
> Embertop에는 자체 로그인 기능이 없습니다. 웹 대시보드는 백오피스를 이미
> 보호하고 있는 인증 뒤에 두십시오. 방문자를 모두 익명화하더라도 요청
> 빈도와 트래픽 패턴 자체가 운영 정보입니다.

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

트래픽 데이터는 운영 정보이므로, 가리는 작업을 표시 단계가 아니라 수집
단계에서 수행합니다.

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
