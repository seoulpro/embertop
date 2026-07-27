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

Nginx combined 형식은 그대로 사용할 수 있습니다.

```nginx
log_format embertop '$remote_addr - $remote_user [$time_local] '
  '"$request" $status $body_bytes_sent '
  '"$http_referer" "$http_user_agent" $request_time';
```

수집기는 IP가 포함된 원문을 읽지만, 파싱 결과에는 IP 필드가 존재하지
않습니다. 쿼리 문자열도 즉시 제거됩니다. 로그 파일 읽기 권한만 부여하고 쓰기
권한은 부여하지 마세요.

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

## 직접 SSE 제공

기존 백오피스가 이미 이벤트 스트림을 만들 수 있다면 수집기를 생략할 수
있습니다. `README.md`의 telemetry schema를 따르고, 이벤트 ID는 재사용하지
않도록 하세요. 프록시는 schema 1 프레임만 허용하며, 알 수 없는 필드를 버리고
텍스트·수치·경로를 다시 정규화한 뒤 브라우저에 전달합니다.

## 공개 배포 전 확인

1. UI 경로에 기존 백오피스 인증이 적용되는지 확인합니다.
2. 브라우저 개발자 도구에 수집기 토큰이 나타나지 않는지 확인합니다.
3. 샘플 로그에 쿼리 문자열, 숫자 ID, UUID가 남지 않는지 확인합니다.
4. `/api/stream`이 CDN에서 캐시되지 않는지 확인합니다.
5. 연결이 끊겼을 때 UI가 `RECONNECTING`으로 바뀌는지 확인합니다.
