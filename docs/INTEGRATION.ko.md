# 기존 백오피스 연동

[English](INTEGRATION.md)

Embertop은 화면과 수집기를 분리합니다. 이미 인증, CPU 지표, Nginx 접근 로그가
있는 백오피스라면 기존 구성을 교체하지 않고 얇게 연결할 수 있습니다.

## 권장 배치

```text
browser
  └─ https://example.com/backoffice/embertop
       └─ Embertop /api/stream (same origin)
            └─ http://127.0.0.1:4318/stream (Bearer token)
                 ├─ existing metrics JSON API
                 └─ Nginx access.log
```

UI는 기존 백오피스 인증과 접근 제어 뒤에 둡니다. 수집기는 localhost에서
실행하고, UI 서버만 수집기에 접근하게 만드는 구성이 가장 단순합니다.
위 경로로 배치하려면 `EMBERTOP_BASE_PATH=/backoffice/embertop`을 지정한 뒤
웹 앱을 빌드하세요. 경로를 바꾸면 다시 빌드해야 합니다.

## 기존 지표 API가 있는 경우

수집기의 `EMBERTOP_METRICS_URL`에 내부 JSON API를 지정하세요. API 응답이
`{"metrics": {...}}`로 감싸져 있어도 되고, 지표 객체 자체여도 됩니다.

```json
{
  "cpu": 27.1,
  "memory": 58.4,
  "load1": 0.72
}
```

값의 단위는 CPU와 메모리가 `0..100`, load가 음수가 아닌 숫자입니다. 일부
키를 생략하면 수집기가 운영체제 값을 사용합니다.

## 접근 로그 연결

Embertop은 Nginx와 구조화된 JSON 접근 로그를 읽습니다. Nginx에서는 Embertop
전용 원본 로그의 수집 항목을 최소화하는 다음 형식을 권장합니다.

```nginx
log_format embertop '- - - [$time_local] '
  '"$request_method $uri $server_protocol" $status $body_bytes_sent '
  '"-" "$http_user_agent" $request_time';

access_log /var/log/nginx/embertop-access.log embertop;
```

이 전용 로그에는 클라이언트 IP·리퍼러·쿼리 문자열이 기록되지 않습니다.
`$uri`는 쿼리 인자를 제외한 Nginx의 정규화된 현재 경로입니다. 경로와
User-Agent는 원본 로그에 남습니다. Embertop은 User-Agent 원문을 사람·크롤러·
미상이라는 상위 분류로 줄여서 사용합니다.

기존 combined 로그도 읽을 수 있지만, Embertop이 읽기 전에 클라이언트 IP,
리퍼러, 쿼리 문자열이 포함된 전체 요청 줄을 디스크에 남길 수 있습니다.
Embertop은 내보내는 이벤트에서 해당 값을 제거하거나 가리며, 이미 기록된 원본
로그를 다시 쓰지는 않습니다.

수집기에는 로그 읽기 전용 권한만 부여하세요. 다른 계정의 읽기 권한도 제한하고
운영에 필요한 기간보다 오래 보관하지 마세요. 수집기에 쓰기 권한은 필요하지
않습니다. 바로 조정해서 쓸 수 있는 예시는
`deploy/nginx-access-log.example.conf`에 있습니다.

## 리버스 프록시

SSE가 버퍼링되지 않도록 중계 구간에서 버퍼링을 끕니다.

```nginx
location /internal/embertop-stream {
    proxy_pass http://127.0.0.1:4318/stream;
    proxy_http_version 1.1;
    proxy_set_header Authorization "Bearer ${EMBERTOP_COLLECTOR_TOKEN}";
    proxy_set_header Connection "";
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 1h;
}
```

환경 변수를 Nginx 설정에 직접 보간하는 방식은 배포 환경마다 다릅니다. 실제
토큰은 저장소에 커밋하지 마세요.

## 배포 상태 점검

다음 명령은 흔히 쓰는 유닛 이름을 예로 듭니다. 실제로 설치한 이름이 다르면
바꾸세요.

```bash
sudo systemctl status embertop-collector embertop-web
sudo journalctl -f -u embertop-collector -u embertop-web
```

UI를 띄우지 않고 로그 접근과 파싱을 확인합니다.

```bash
embertop doctor --log /var/log/nginx/embertop-access.log
```

`doctor`는 Node.js 버전, 로그 읽기 가능 여부, 로컬 지표 또는 원격 스트림 연결,
수집기 바인딩 안전성을 보고합니다.

## 직접 SSE 제공

기존 백오피스가 이미 이벤트 스트림을 만들 수 있다면 수집기를 생략할 수
있습니다. `README.md`의 telemetry schema를 따르고, 이벤트 ID는 재사용하지
않도록 하세요. 프록시는 schema 1 프레임만 허용하며, 알 수 없는 필드를 버리고
텍스트·수치·경로를 다시 정규화한 뒤 브라우저에 전달합니다.

## 공개 배포 전 확인

1. UI 경로에 기존 백오피스 인증이 적용되는지 확인합니다.
2. 브라우저 개발자 도구에 수집기 토큰이 나타나지 않는지 확인합니다.
3. 원본 로그의 필드·권한·순환·보관 기간이 의도한 설정인지 확인합니다.
4. 쿼리 문자열, 숫자 ID, UUID, 긴 토큰이 포함된 경로가 이벤트에서 정제되는지
   확인합니다.
5. `/api/stream`이 CDN에서 캐시되지 않는지 확인합니다.
6. 연결이 끊겼을 때 UI가 `RECONNECTING`으로 바뀌는지 확인합니다.
