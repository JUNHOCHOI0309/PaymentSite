# Commit Rules

## Message Format

Use the following format for every commit message:

```text
<type> - 한글 내용
```

Examples:

```text
feat - 무대 서비스 신청 흐름 보강
fix - 신청 조회 환불 정보 표시 수정
docs - 보류 작업 목록 정리
```

Use one of the types below followed by a Korean description. Do not use the conventional `type: message` format.

| Type | Purpose |
| --- | --- |
| `feat` | 새로운 기능에 대한 커밋 |
| `fix` | 버그 수정에 대한 커밋 |
| `build` | 빌드 관련 파일 수정 또는 모듈 설치/삭제에 대한 커밋 |
| `chore` | 그 외 자잘한 수정에 대한 커밋 |
| `ci` | CI 관련 설정 수정에 대한 커밋 |
| `docs` | 문서 수정에 대한 커밋 |
| `style` | 코드 스타일 또는 포맷에 관한 커밋 |
| `refactor` | 코드 리팩토링에 대한 커밋 |
| `test` | 테스트 코드 수정에 대한 커밋 |
| `perf` | 성능 개선에 대한 커밋 |

## SQL Files

Never include SQL files in a Git commit.

- Do not stage files ending in `.sql`.
- Do not stage files in `sql/` or `migrations/`.
- Share database migration SQL through the response or apply it separately to the database server.
- Before committing, confirm staged files with `git diff --cached --name-only`.
