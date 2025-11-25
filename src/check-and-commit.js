// ============================================
// Auto Commit Tracker - 메인 스크립트 (최종 수정)
// ============================================
const { Octokit } = require('@octokit/rest');
const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const TARGET_USER = process.env.TARGET_USER || 'Jucy92';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const COUNTER_FILE = path.join(__dirname, '..', 'counter.txt');
const LOG_FILE = path.join(__dirname, '..', 'logs', 'commit-log.md');

const octokit = new Octokit({
  auth: GITHUB_TOKEN,
});

function getTodayDate() {
  const today = new Date();
  return today.toISOString().split('T')[0];
}

/**
 * Public 저장소의 커밋 체크
 *
 * 핵심 로직:
 * - 커밋 메시지에 "auto commit"이 포함된 것만 제외
 * - 저장소 이름과 무관하게 모든 수동 커밋 인정
 * - payload.commits가 비어있으면 추가 API로 확인
 */
async function hasManualCommitToday(username, date) {
  console.log(`🔍 ${username}의 ${date} Public 커밋 조회 중...\n`);
  console.log('='.repeat(60));

  try {
    // Public Events API 호출
    console.log('📡 Public Events API 조회...');
    const { data: events } = await octokit.activity.listPublicEventsForUser({
      username: username,
      per_page: 100,
    });

    console.log(`✅ 조회된 이벤트: ${events.length}개`);

    const pushEvents = events.filter(event => event.type === 'PushEvent');
    console.log(`✅ PushEvent: ${pushEvents.length}개\n`);

    // 오늘 날짜의 PushEvent 찾기
    let todayPushCount = 0;
    let autoCommitCount = 0;
    let manualCommitCount = 0;

    for (const event of pushEvents) {
      const eventDate = event.created_at.split('T')[0];
      const eventTime = event.created_at.split('T')[1].split('Z')[0];

      if (eventDate === date) {
        todayPushCount++;
        const repoName = event.repo.name;
        const commits = event.payload.commits || [];

        console.log(`📦 [${eventTime}] ${repoName}`);
        console.log(`   커밋 개수: ${commits.length}개`);

        if (commits.length === 0) {
          // ⚠️ commits가 비어있는 경우 → Commits API로 직접 조회
          console.log(`   → ⚠️ 커밋 정보 없음 (API 제한)`);
          console.log(`   → 🔍 Commits API로 직접 조회...`);

          try {
            const [owner, repo] = repoName.split('/');
            const { data: repoCommits } = await octokit.repos.listCommits({
              owner: owner,
              repo: repo,
              per_page: 5,
              since: `${date}T00:00:00Z`,
              until: `${date}T23:59:59Z`,
            });

            console.log(`   → 📋 조회된 커밋: ${repoCommits.length}개`);

            for (const commit of repoCommits) {
              const message = commit.commit.message.toLowerCase();
              const isAutoCommit = message.includes('auto commit');

              console.log(`   - "${commit.commit.message}"`);
              console.log(`     ${isAutoCommit ? '(자동 커밋 - 제외)' : '(✅ 수동 커밋!)'}`);

              if (!isAutoCommit) {
                manualCommitCount++;
                console.log('\n' + '='.repeat(60));
                console.log('✅ 수동 커밋 발견! (Commits API 조회)');
                console.log(`   저장소: ${repoName}`);
                console.log(`   메시지: "${commit.commit.message}"`);
                return true;
              } else {
                autoCommitCount++;
              }
            }
          } catch (error) {
            console.log(`   → ⚠️ Commits API 조회 실패: ${error.message}`);
            console.log(`   → 📌 안전하게 수동 커밋으로 간주`);
            manualCommitCount++;
            return true;
          }
        } else {
          // 커밋 목록이 있는 경우 → 메시지로 판단
          for (const commit of commits) {
            const message = commit.message.toLowerCase();
            const isAutoCommit = message.includes('auto commit');

            console.log(`   - "${commit.message}"`);
            console.log(`     ${isAutoCommit ? '(자동 커밋 - 제외)' : '(✅ 수동 커밋!)'}`);

            if (!isAutoCommit) {
              // ✅ "auto commit"이 아닌 모든 커밋은 수동 커밋
              // 저장소 이름과 무관!
              manualCommitCount++;
              console.log('\n' + '='.repeat(60));
              console.log('✅ 수동 커밋 발견!');
              console.log(`   저장소: ${repoName}`);
              console.log(`   메시지: "${commit.message}"`);
              return true;
            } else {
              autoCommitCount++;
            }
          }
        }
        console.log('');
      }
    }

    console.log('='.repeat(60));
    console.log(`📊 오늘(${date}) 통계:`);
    console.log(`   - 전체 PushEvent: ${todayPushCount}개`);
    console.log(`   - 자동 커밋: ${autoCommitCount}개`);
    console.log(`   - 수동 커밋: ${manualCommitCount}개`);
    console.log('='.repeat(60));

    if (manualCommitCount > 0) {
      console.log('✅ 수동 커밋 있음!');
      return true;
    }

    console.log('❌ 수동 커밋 없음');
    return false;

  } catch (error) {
    console.error('❌ API 오류:', error.message);
    return true; // 오류 시 안전하게 처리
  }
}

function readCounter() {
  try {
    const content = fs.readFileSync(COUNTER_FILE, 'utf8').trim();
    return parseInt(content) || 0;
  } catch (error) {
    return 0;
  }
}

function writeCounter(value) {
  fs.writeFileSync(COUNTER_FILE, value.toString());
  console.log(`💾 카운터 저장: ${value}`);
}

function appendLog(date, message) {
  try {
    const logDir = path.dirname(LOG_FILE);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    if (!fs.existsSync(LOG_FILE)) {
      fs.writeFileSync(LOG_FILE, '# Auto Commit Log\n\n');
    }

    const logEntry = `- ${date}: ${message}\n`;
    fs.appendFileSync(LOG_FILE, logEntry);
    console.log(`📝 로그 기록: ${message}`);
  } catch (error) {
    console.error('⚠️ 로그 기록 실패:', error.message);
  }
}

function executeGitCommit(message) {
  try {
    console.log('\n🔧 Git 설정 중...');
    execSync('git config user.name "GitHub Actions Bot"', { encoding: 'utf8' });
    execSync('git config user.email "actions@github.com"', { encoding: 'utf8' });

    console.log('📦 변경사항 스테이징...');
    execSync('git add counter.txt logs/', { encoding: 'utf8' });

    console.log(`💬 커밋 생성: "${message}"`);
    execSync(`git commit -m "${message}"`, { encoding: 'utf8' });

    console.log('🚀 푸시 중...');

    // Pull 후 Push (충돌 방지)
    try {
      execSync('git pull --rebase', { encoding: 'utf8' });
    } catch (pullError) {
      console.log('⚠️ Pull 중 충돌 발생, 재시도...');
    }

    execSync('git push', { encoding: 'utf8' });

    console.log('✅ Git 푸시 완료!');
  } catch (error) {
    console.error('❌ Git 명령 실패:', error.message);
    throw error;
  }
}

function resetCounter(date) {
  const currentCounter = readCounter();

  if (currentCounter > 0) {
    writeCounter(0);
    appendLog(date, `Manual commit detected. Counter reset from ${currentCounter} to 0.`);
    console.log(`\n🔄 카운터 리셋: ${currentCounter} → 0`);
  } else {
    console.log(`\n✅ 카운터 이미 0`);
  }
}

async function autoCommit(date) {
  const counter = readCounter();
  const newCounter = counter + 1;

  console.log(`\n📈 카운터 증가: ${counter} → ${newCounter}`);
  writeCounter(newCounter);

  appendLog(date, `auto commit ${newCounter}day`);

  const commitMessage = `auto commit ${newCounter}day`;
  executeGitCommit(commitMessage);

  console.log(`✅ 자동 커밋 완료: ${commitMessage}`);
}

async function main() {
  console.log('🚀 Auto Commit Tracker 시작\n');
  console.log('='.repeat(60));

  const today = getTodayDate();
  console.log(`📅 오늘 날짜: ${today}`);
  console.log(`👤 대상 사용자: ${TARGET_USER}`);
  console.log(`🔑 토큰: ${GITHUB_TOKEN ? '✅ 설정됨' : '❌ 없음'}`);
  console.log('='.repeat(60) + '\n');

  try {
    const hasManualCommit = await hasManualCommitToday(TARGET_USER, today);

    console.log('\n' + '='.repeat(60));
    if (hasManualCommit) {
      console.log('✅ 최종 결론: 오늘 수동 커밋 있음');
      console.log('   → 자동 커밋 안 함 (카운터 리셋)');
      console.log('='.repeat(60));
      resetCounter(today);
    } else {
      console.log('❌ 최종 결론: 오늘 수동 커밋 없음');
      console.log('   → 자동 커밋 실행');
      console.log('='.repeat(60));
      await autoCommit(today);
    }

    console.log('\n🎉 작업 완료!');
  } catch (error) {
    console.error('\n❌ 오류 발생:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };

// ============================================
// 최종 수정 내역
// ============================================
//
// 핵심 원칙:
// - "auto commit"이라는 메시지만 제외
// - 저장소 이름과 무관하게 모든 수동 커밋 인정
// - auto-commit 저장소의 일반 커밋도 수동 커밋으로 인정
//
// 예시:
// ✅ "Fix bug" in auto-commit repo → 수동 커밋
// ✅ "Add feature" in auto-commit repo → 수동 커밋
// ✅ "알고리즘 풀이" in Java_Algorithm repo → 수동 커밋
// ❌ "auto commit 1day" in auto-commit repo → 자동 커밋 (제외)
//
// payload.commits가 비어있는 경우:
// - API 제한으로 커밋 목록을 못 받은 경우
// - 안전하게 수동 커밋으로 간주
// - 실제 자동 커밋이었다면 다음 실행 때 카운터 리셋됨
