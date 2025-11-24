const { Octokit } = require('@octokit/rest');
const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

// 설정
const TARGET_USER = process.env.TARGET_USER || 'Jucy92';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const COUNTER_FILE = path.join(__dirname, '..', 'counter.txt');
const LOG_FILE = path.join(__dirname, '..', 'logs', 'commit-log.md');

// GitHub API 클라이언트
const octokit = new Octokit({
  auth: GITHUB_TOKEN,
});

/**
 * 오늘 날짜를 YYYY-MM-DD 형식으로 반환
 */
function getTodayDate() {
  const today = new Date();
  return today.toISOString().split('T')[0];
}

/**
 * 특정 날짜의 사용자 커밋 조회 (자동 커밋 제외)
 */
async function hasManualCommitToday(username, date) {
  try {
    console.log(`🔍 ${username}의 ${date} 커밋 조회 중...`);

    // GitHub API로 사용자의 최근 이벤트 조회
    const { data: events } = await octokit.activity.listPublicEventsForUser({
      username: username,
      per_page: 100,
    });

    // PushEvent만 필터링
    const pushEvents = events.filter(event => event.type === 'PushEvent');

    // 오늘 날짜의 커밋 중 자동 커밋이 아닌 것 찾기
    for (const event of pushEvents) {
      const eventDate = event.created_at.split('T')[0];

      if (eventDate === date) {
        // 커밋 메시지 확인
        const commits = event.payload.commits || [];

        for (const commit of commits) {
          const message = commit.message.toLowerCase();

          // "auto commit"이 포함되지 않은 커밋이 있으면 true
          if (!message.includes('auto commit')) {
            console.log(`✅ 수동 커밋 발견: "${commit.message}"`);
            return true;
          }
        }
      }
    }

    console.log(`❌ ${date}에 수동 커밋 없음`);
    return false;
  } catch (error) {
    console.error('❌ GitHub API 오류:', error.message);

    // API 오류 시 안전하게 처리 (커밋이 있다고 가정)
    return true;
  }
}

/**
 * counter.txt 파일 읽기
 */
function readCounter() {
  try {
    const content = fs.readFileSync(COUNTER_FILE, 'utf8').trim();
    return parseInt(content) || 0;
  } catch (error) {
    console.log('⚠️ counter.txt 없음. 0으로 초기화');
    return 0;
  }
}

/**
 * counter.txt 파일 쓰기
 */
function writeCounter(value) {
  fs.writeFileSync(COUNTER_FILE, value.toString());
  console.log(`💾 카운터 저장: ${value}`);
}

/**
 * 로그 파일에 기록 추가
 */
function appendLog(date, message) {
  try {
    // 로그 디렉토리가 없으면 생성
    const logDir = path.dirname(LOG_FILE);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    // 로그 파일이 없으면 헤더 생성
    if (!fs.existsSync(LOG_FILE)) {
      fs.writeFileSync(LOG_FILE, '# Auto Commit Log\n\n');
    }

    // 로그 추가
    const logEntry = `- ${date}: ${message}\n`;
    fs.appendFileSync(LOG_FILE, logEntry);
    console.log(`📝 로그 기록: ${message}`);
  } catch (error) {
    console.error('⚠️ 로그 기록 실패:', error.message);
  }
}

/**
 * Git 커밋 및 푸시 실행
 */
function executeGitCommit(message) {
  try {
    console.log('🔧 Git 설정 중...');
    execSync('git config user.name "GitHub Actions Bot"', { encoding: 'utf8' });
    execSync('git config user.email "actions@github.com"', { encoding: 'utf8' });

    console.log('📦 변경사항 스테이징...');
    execSync('git add counter.txt logs/', { encoding: 'utf8' });

    console.log(`💬 커밋 생성: "${message}"`);
    execSync(`git commit -m "${message}"`, { encoding: 'utf8' });

    console.log('🚀 푸시 중...');
    execSync('git push', { encoding: 'utf8' });

    console.log('✅ Git 푸시 완료!');
  } catch (error) {
    console.error('❌ Git 명령 실패:', error.message);
    throw error;
  }
}

/**
 * 카운터 리셋 (커밋하지 않음)
 */
function resetCounter(date) {
  const currentCounter = readCounter();

  if (currentCounter > 0) {
    writeCounter(0);
    appendLog(date, `Manual commit detected. Counter reset from ${currentCounter} to 0.`);
    console.log(`🔄 카운터 리셋: ${currentCounter} → 0`);
  } else {
    console.log(`✅ 카운터 이미 0`);
  }
}

/**
 * 자동 커밋 실행
 */
async function autoCommit(date) {
  const counter = readCounter();
  const newCounter = counter + 1;

  console.log(`📈 카운터 증가: ${counter} → ${newCounter}`);
  writeCounter(newCounter);

  appendLog(date, `auto commit ${newCounter}day`);

  const commitMessage = `auto commit ${newCounter}day`;
  executeGitCommit(commitMessage);

  console.log(`✅ 자동 커밋 완료: ${commitMessage}`);
}

/**
 * 메인 로직
 */
async function main() {
  console.log('🚀 Auto Commit Tracker 시작\n');

  const today = getTodayDate();
  console.log(`📅 오늘 날짜: ${today}`);
  console.log(`👤 대상 사용자: ${TARGET_USER}\n`);

  try {
    // 1. 오늘 수동 커밋이 있는지 확인
    const hasManualCommit = await hasManualCommitToday(TARGET_USER, today);

    if (hasManualCommit) {
      // 2-1. 수동 커밋이 있으면 카운터 리셋 (커밋하지 않음)
      console.log('\n✅ 오늘 수동 커밋이 있습니다. 카운터를 리셋합니다.');
      resetCounter(today);
    } else {
      // 2-2. 수동 커밋이 없으면 자동 커밋 실행
      console.log('\n❌ 오늘 수동 커밋이 없습니다. 자동 커밋을 실행합니다.');
      await autoCommit(today);
    }

    console.log('\n🎉 작업 완료!');
  } catch (error) {
    console.error('\n❌ 오류 발생:', error.message);
    process.exit(1);
  }
}

// 스크립트 실행
if (require.main === module) {
  main();
}

module.exports = { main };
