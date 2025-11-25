// ============================================
// Auto Commit Tracker - 메인 스크립트
// ============================================
// 이 스크립트는 GitHub Actions에서 매일 자동으로 실행되어
// 사용자의 커밋을 체크하고 필요시 자동 커밋을 생성합니다.

// ============================================
// 필수 모듈 가져오기
// ============================================
const { Octokit } = require('@octokit/rest');  // GitHub API 클라이언트 라이브러리
const fs = require('fs');                       // 파일 시스템 모듈 (파일 읽기/쓰기)
const { execSync } = require('child_process');  // 시스템 명령어 실행 (git 명령어)
const path = require('path');                   // 파일 경로 처리 모듈

// ============================================
// 환경 변수에서 설정 값 가져오기
// ============================================
// process.env는 Node.js에서 환경 변수에 접근하는 방법
// 이 값들은 GitHub Actions 워크플로우 파일(auto-commit.yml)의
// env: 섹션에서 설정됩니다.

// TARGET_USER: 커밋을 체크할 GitHub 사용자명
// - GitHub Actions에서 설정: env.TARGET_USER
// - 설정 안 되어 있으면 기본값 'Jucy92' 사용
const TARGET_USER = process.env.TARGET_USER || 'Jucy92';

// GITHUB_TOKEN: GitHub API 인증 토큰
// - GitHub Actions가 자동으로 제공 (secrets.GITHUB_TOKEN)
// - GitHub API를 호출할 때 필요
// - 없으면 API 호출 제한 (시간당 60회 → 5000회)
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

// ============================================
// 파일 경로 설정
// ============================================
// __dirname: 현재 실행 중인 스크립트의 디렉토리 경로
// path.join(): 경로를 안전하게 합침 (OS별 경로 구분자 자동 처리)

// counter.txt: 연속 무커밋 일수를 저장하는 파일
// 예: "3" (3일 연속 커밋 없음)
const COUNTER_FILE = path.join(__dirname, '..', 'counter.txt');

// commit-log.md: 자동 커밋 이력을 저장하는 로그 파일
const LOG_FILE = path.join(__dirname, '..', 'logs', 'commit-log.md');

// ============================================
// GitHub API 클라이언트 초기화
// ============================================
// Octokit: GitHub의 공식 JavaScript API 클라이언트
// auth: 인증 토큰 설정 (이게 있어야 API 사용 가능)
const octokit = new Octokit({
  auth: GITHUB_TOKEN,
});

// ============================================
// 함수: 오늘 날짜 가져오기
// ============================================
/**
 * 오늘 날짜를 YYYY-MM-DD 형식으로 반환
 *
 * @returns {string} 오늘 날짜 (예: "2025-11-24")
 *
 * 작동 방식:
 * 1. new Date(): 현재 시간 객체 생성
 * 2. toISOString(): ISO 8601 형식으로 변환 (예: "2025-11-24T15:30:00.000Z")
 * 3. split('T')[0]: 'T' 기준으로 나눠서 날짜 부분만 가져옴
 */
function getTodayDate() {
  const today = new Date();
  return today.toISOString().split('T')[0];
}

// ============================================
// 함수: 오늘 수동 커밋이 있는지 확인
// ============================================
/**
 * 특정 날짜에 사용자가 직접 한 커밋이 있는지 확인
 * (자동 커밋은 제외)
 *
 * @param {string} username - GitHub 사용자명 (예: "Jucy92")
 * @param {string} date - 확인할 날짜 (예: "2025-11-24")
 * @returns {Promise<boolean>} 수동 커밋이 있으면 true, 없으면 false
 *
 * GitHub API 사용:
 * - octokit.activity.listPublicEventsForUser()
 * - 사용자의 최근 public 활동(이벤트) 조회
 * - 최대 100개까지 가져옴
 */
async function hasManualCommitToday(username, date) {
  try {
    console.log(`🔍 ${username}의 ${date} 커밋 조회 중...`);

    // GitHub API 호출: 사용자의 최근 이벤트 가져오기
    // 반환값: { data: [...이벤트 배열...] }
    const { data: events } = await octokit.activity.listPublicEventsForUser({
      username: username,    // 조회할 사용자
      per_page: 100,         // 최대 100개 이벤트 가져오기
    });

    // 이벤트 중에서 PushEvent만 필터링
    // PushEvent: Git 저장소에 커밋을 푸시한 이벤트
    // 다른 이벤트 타입: IssueEvent, PullRequestEvent, CreateEvent 등
    const pushEvents = events.filter(event => event.type === 'PushEvent');

    // 각 PushEvent를 순회하면서 확인
    for (const event of pushEvents) {
      // 이벤트 발생 시간에서 날짜 부분만 추출
      // event.created_at 예시: "2025-11-24T10:30:00Z"
      // split('T')[0] 결과: "2025-11-24"
      const eventDate = event.created_at.split('T')[0];

      // 오늘 날짜의 이벤트만 확인
      if (eventDate === date) {
        // 이벤트의 커밋 목록 가져오기
        // event.payload: 이벤트의 상세 정보
        // commits: 푸시된 커밋들의 배열
        const commits = event.payload.commits || [];

        // 각 커밋 확인
        for (const commit of commits) {
          // 커밋 메시지를 소문자로 변환
          const message = commit.message.toLowerCase();

          // "auto commit"이 포함되지 않은 커밋 = 수동 커밋
          // 자동 커밋은 "auto commit 1day" 형식이므로 제외됨
          if (!message.includes('auto commit')) {
            console.log(`✅ 수동 커밋 발견: "${commit.message}"`);
            return true;  // 수동 커밋 발견!
          }
        }
      }
    }

    // 여기까지 왔다면 수동 커밋이 없음
    console.log(`❌ ${date}에 수동 커밋 없음`);
    return false;

  } catch (error) {
    // API 오류 발생 시 (네트워크 오류, 권한 오류 등)
    console.error('❌ GitHub API 오류:', error.message);

    // 오류 시 안전하게 처리: 커밋이 있다고 가정
    // 이유: 잘못 자동 커밋하는 것보다 안전
    return true;
  }
}

// ============================================
// 함수: 카운터 파일 읽기
// ============================================
/**
 * counter.txt 파일에서 현재 카운터 값을 읽어옴
 *
 * @returns {number} 카운터 값 (예: 3)
 *
 * counter.txt 파일 내용 예시:
 * 3
 *
 * 작동 방식:
 * 1. fs.readFileSync(): 파일 내용을 동기적으로 읽음
 * 2. 'utf8': 텍스트 형식으로 읽기
 * 3. trim(): 앞뒤 공백 제거
 * 4. parseInt(): 문자열을 숫자로 변환
 */
function readCounter() {
  try {
    // 파일 읽기
    const content = fs.readFileSync(COUNTER_FILE, 'utf8').trim();

    // 문자열 → 숫자 변환
    // parseInt() 실패 시 NaN 반환
    // || 0: NaN이면 0을 반환
    return parseInt(content) || 0;

  } catch (error) {
    // 파일이 없거나 읽기 실패 시
    console.log('⚠️ counter.txt 없음. 0으로 초기화');
    return 0;
  }
}

// ============================================
// 함수: 카운터 파일 쓰기
// ============================================
/**
 * counter.txt 파일에 카운터 값 저장
 *
 * @param {number} value - 저장할 카운터 값 (예: 3)
 *
 * 작동 방식:
 * 1. value.toString(): 숫자를 문자열로 변환 (3 → "3")
 * 2. fs.writeFileSync(): 파일에 동기적으로 쓰기
 * 3. 기존 내용은 덮어씀
 */
function writeCounter(value) {
  fs.writeFileSync(COUNTER_FILE, value.toString());
  console.log(`💾 카운터 저장: ${value}`);
}

// ============================================
// 함수: 로그 파일에 기록 추가
// ============================================
/**
 * logs/commit-log.md 파일에 로그 추가
 *
 * @param {string} date - 날짜 (예: "2025-11-24")
 * @param {string} message - 로그 메시지
 *
 * 로그 파일 예시:
 * # Auto Commit Log
 *
 * - 2025-11-24: auto commit 1day
 * - 2025-11-25: Manual commit detected. Counter reset from 1 to 0.
 * - 2025-11-26: auto commit 1day
 */
function appendLog(date, message) {
  try {
    // 로그 디렉토리가 없으면 생성
    const logDir = path.dirname(LOG_FILE);
    if (!fs.existsSync(logDir)) {
      // recursive: true → 중간 디렉토리도 자동 생성
      fs.mkdirSync(logDir, { recursive: true });
    }

    // 로그 파일이 없으면 헤더 생성
    if (!fs.existsSync(LOG_FILE)) {
      fs.writeFileSync(LOG_FILE, '# Auto Commit Log\n\n');
    }

    // 로그 항목 추가
    const logEntry = `- ${date}: ${message}\n`;
    // appendFileSync: 파일 끝에 추가 (덮어쓰지 않음)
    fs.appendFileSync(LOG_FILE, logEntry);
    console.log(`📝 로그 기록: ${message}`);

  } catch (error) {
    // 로그 실패는 치명적이지 않으므로 경고만 출력
    console.error('⚠️ 로그 기록 실패:', error.message);
  }
}

// ============================================
// 함수: Git 커밋 및 푸시 실행
// ============================================
/**
 * Git 명령어로 파일을 커밋하고 원격 저장소에 푸시
 *
 * @param {string} message - 커밋 메시지 (예: "auto commit 3day")
 *
 * 실행되는 Git 명령어:
 * 1. git config user.name "GitHub Actions Bot"
 * 2. git config user.email "actions@github.com"
 * 3. git add counter.txt logs/
 * 4. git commit -m "메시지"
 * 5. git push
 */
function executeGitCommit(message) {
  try {
    console.log('🔧 Git 설정 중...');

    // Git 사용자 정보 설정
    // - GitHub Actions에서 커밋할 때 필요
    // - 이 정보가 커밋 로그에 표시됨
    execSync('git config user.name "GitHub Actions Bot"', { encoding: 'utf8' });
    execSync('git config user.email "actions@github.com"', { encoding: 'utf8' });

    console.log('📦 변경사항 스테이징...');

    // git add: 변경된 파일을 스테이징 영역에 추가
    // - counter.txt: 카운터 파일
    // - logs/: 로그 디렉토리 (새 로그 파일 포함)
    execSync('git add counter.txt logs/', { encoding: 'utf8' });

    console.log(`💬 커밋 생성: "${message}"`);

    // git commit: 스테이징된 변경사항을 커밋
    // -m: 커밋 메시지 지정
    execSync(`git commit -m "${message}"`, { encoding: 'utf8' });

    console.log('🚀 푸시 중...');

    // git push: 로컬 커밋을 원격 저장소(GitHub)에 업로드
    // GitHub Actions의 GITHUB_TOKEN으로 자동 인증됨
    execSync('git push', { encoding: 'utf8' });

    console.log('✅ Git 푸시 완료!');

  } catch (error) {
    // Git 명령어 실패 시 (권한 오류, 네트워크 오류 등)
    console.error('❌ Git 명령 실패:', error.message);
    throw error;  // 오류를 다시 던져서 스크립트 종료
  }
}

// ============================================
// 함수: 카운터 리셋 (커밋하지 않음)
// ============================================
/**
 * 카운터를 0으로 리셋 (파일만 수정, Git 커밋은 안 함)
 *
 * @param {string} date - 날짜 (로그용)
 *
 * 주의: 이 함수는 Git 커밋을 하지 않습니다!
 * 이유: 사용자가 이미 커밋했으므로 추가 커밋 불필요
 */
function resetCounter(date) {
  const currentCounter = readCounter();

  if (currentCounter > 0) {
    // 카운터가 0보다 크면 리셋
    writeCounter(0);
    appendLog(date, `Manual commit detected. Counter reset from ${currentCounter} to 0.`);
    console.log(`🔄 카운터 리셋: ${currentCounter} → 0`);
  } else {
    // 이미 0이면 아무것도 안 함
    console.log(`✅ 카운터 이미 0`);
  }
}

// ============================================
// 함수: 자동 커밋 실행
// ============================================
/**
 * 카운터를 증가시키고 자동 커밋 생성
 *
 * @param {string} date - 날짜 (로그용)
 *
 * 실행 순서:
 * 1. counter.txt 읽기 (예: 2)
 * 2. 카운터 +1 (예: 3)
 * 3. counter.txt에 새 값 저장
 * 4. 로그 기록
 * 5. Git 커밋 & 푸시 ("auto commit 3day")
 */
async function autoCommit(date) {
  const counter = readCounter();       // 현재 카운터 읽기
  const newCounter = counter + 1;       // 카운터 증가

  console.log(`📈 카운터 증가: ${counter} → ${newCounter}`);

  // 새 카운터 값 저장
  writeCounter(newCounter);

  // 로그 기록
  appendLog(date, `auto commit ${newCounter}day`);

  // Git 커밋 메시지 생성
  const commitMessage = `auto commit ${newCounter}day`;

  // Git 커밋 & 푸시 실행
  executeGitCommit(commitMessage);

  console.log(`✅ 자동 커밋 완료: ${commitMessage}`);
}

// ============================================
// 메인 함수: 전체 로직 실행
// ============================================
/**
 * 메인 로직:
 * 1. 오늘 날짜 확인
 * 2. GitHub API로 사용자 커밋 조회
 * 3-1. 커밋 있음 → 카운터 리셋 (커밋 안 함)
 * 3-2. 커밋 없음 → 자동 커밋 실행
 */
async function main() {
  console.log('🚀 Auto Commit Tracker 시작\n');

  // 오늘 날짜 가져오기 (예: "2025-11-24")
  const today = getTodayDate();
  console.log(`📅 오늘 날짜: ${today}`);
  console.log(`👤 대상 사용자: ${TARGET_USER}\n`);

  try {
    // ========================================
    // 1. 오늘 수동 커밋이 있는지 확인
    // ========================================
    // GitHub API를 호출하여 사용자의 오늘 커밋 조회
    // 자동 커밋("auto commit")은 제외
    const hasManualCommit = await hasManualCommitToday(TARGET_USER, today);

    if (hasManualCommit) {
      // ========================================
      // 2-1. 수동 커밋이 있는 경우
      // ========================================
      // 카운터를 0으로 리셋 (Git 커밋은 안 함)
      // 이유: 사용자가 이미 커밋했으므로 추가 커밋 불필요
      console.log('\n✅ 오늘 수동 커밋이 있습니다. 카운터를 리셋합니다.');
      resetCounter(today);

    } else {
      // ========================================
      // 2-2. 수동 커밋이 없는 경우
      // ========================================
      // 자동 커밋 실행
      // - 카운터 +1
      // - counter.txt 업데이트
      // - 로그 기록
      // - Git 커밋 & 푸시
      console.log('\n❌ 오늘 수동 커밋이 없습니다. 자동 커밋을 실행합니다.');
      await autoCommit(today);
    }

    console.log('\n🎉 작업 완료!');

  } catch (error) {
    // 오류 발생 시 에러 메시지 출력 및 종료
    console.error('\n❌ 오류 발생:', error.message);
    process.exit(1);  // 종료 코드 1 = 오류
  }
}

// ============================================
// 스크립트 실행
// ============================================
// require.main === module: 이 파일이 직접 실행되었는지 확인
// (다른 파일에서 import된 경우 실행 안 함)
if (require.main === module) {
  main();  // 메인 함수 실행
}

// 다른 파일에서 import 가능하도록 export
module.exports = { main };

// ============================================
// 추가 설명
// ============================================
//
// 🔑 환경 변수 접근:
//    - process.env.GITHUB_TOKEN
//    - process.env.TARGET_USER
//    - GitHub Actions의 env: 섹션에서 설정됨
//
// 📁 파일 경로:
//    - __dirname: 현재 스크립트의 디렉토리
//    - path.join(): 안전한 경로 합치기
//
// 🔄 실행 흐름:
//    main()
//    ├─ getTodayDate() → "2025-11-24"
//    ├─ hasManualCommitToday() → true/false
//    │  ├─ GitHub API 호출
//    │  └─ 커밋 메시지 확인 ("auto commit" 제외)
//    │
//    ├─ if (수동 커밋 있음)
//    │  └─ resetCounter()
//    │     ├─ readCounter()
//    │     ├─ writeCounter(0)
//    │     └─ appendLog()
//    │
//    └─ else (수동 커밋 없음)
//       └─ autoCommit()
//          ├─ readCounter()
//          ├─ writeCounter(newCounter)
//          ├─ appendLog()
//          └─ executeGitCommit()
//             ├─ git config
//             ├─ git add
//             ├─ git commit
//             └─ git push
//
// 🧪 로컬 테스트:
//    export GITHUB_TOKEN=your_token_here
//    export TARGET_USER=Jucy92
//    node src/check-and-commit.js
