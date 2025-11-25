// ============================================
// Auto Commit Tracker - 메인 스크립트 (개선 버전)
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

/**
 * 오늘 날짜를 YYYY-MM-DD 형식으로 반환
 */
function getTodayDate() {
  const today = new Date();
  return today.toISOString().split('T')[0];
}

/**
 * Public 저장소의 커밋만 체크 (2가지 방법)
 * 1. Public Events API (빠름)
 * 2. Search Commits API (더 정확)
 */
async function hasManualCommitToday(username, date) {
  console.log(`🔍 ${username}의 ${date} Public 커밋 조회 중...\n`);

  try {
    // ========================================
    // 방법 1: Public Events API
    // ========================================
    console.log('📡 [방법 1] Public Events API 조회...');
    const hasCommitFromEvents = await checkCommitsFromEvents(username, date);

    if (hasCommitFromEvents) {
      console.log('✅ Public Events에서 수동 커밋 발견!');
      return true;
    }
    console.log('❌ Public Events에서 수동 커밋 없음');

    // ========================================
    // 방법 2: Search Commits API (더 정확)
    // ========================================
    console.log('\n📡 [방법 2] Search Commits API 조회...');
    const hasCommitFromSearch = await checkCommitsFromSearch(username, date);

    if (hasCommitFromSearch) {
      console.log('✅ Search API에서 수동 커밋 발견!');
      return true;
    }
    console.log('❌ Search API에서도 수동 커밋 없음');

    console.log('\n❌ 결론: 모든 방법에서 수동 커밋을 찾지 못했습니다.');
    return false;

  } catch (error) {
    console.error('❌ 커밋 조회 오류:', error.message);
    // 오류 시 안전하게 처리: 커밋이 있다고 가정
    return true;
  }
}

/**
 * Public Events API로 커밋 확인
 * - 최근 100개 이벤트만 조회 (GitHub API 제한)
 * - Public 이벤트만 조회 가능
 */
async function checkCommitsFromEvents(username, date) {
  try {
    const { data: events } = await octokit.activity.listPublicEventsForUser({
      username: username,
      per_page: 100,
    });

    console.log(`   → 조회된 이벤트: ${events.length}개`);

    const pushEvents = events.filter(event => event.type === 'PushEvent');
    console.log(`   → PushEvent: ${pushEvents.length}개`);

    let todayPushEvents = 0;
    let todayCommits = 0;

    for (const event of pushEvents) {
      const eventDate = event.created_at.split('T')[0];
      const eventTime = event.created_at.split('T')[1].split('Z')[0];

      if (eventDate === date) {
        todayPushEvents++;
        const commits = event.payload.commits || [];

        console.log(`   → [${eventTime}] ${event.repo.name}: ${commits.length}개 커밋`);

        for (const commit of commits) {
          todayCommits++;
          const message = commit.message.toLowerCase();
          const isAutoCommit = message.includes('auto commit');

          console.log(`      - "${commit.message}" ${isAutoCommit ? '(자동 커밋 - 제외)' : '(수동 커밋!)'}`);

          if (!isAutoCommit) {
            console.log(`   ✅ 수동 커밋 발견!`);
            return true;
          }
        }
      }
    }

    console.log(`   → ${date}의 PushEvent: ${todayPushEvents}개, 커밋: ${todayCommits}개`);

    if (todayCommits > 0) {
      console.log(`   ⚠️ 커밋은 있지만 모두 자동 커밋`);
    }

    return false;

  } catch (error) {
    console.error('   ❌ Events API 오류:', error.message);
    return false;
  }
}

/**
 * Search Commits API로 커밋 확인
 * - Public Events에서 못 찾은 경우 사용
 * - 더 정확하지만 요청 제한이 있음
 */
async function checkCommitsFromSearch(username, date) {
  try {
    // GitHub Search API
    // 쿼리: "author:Jucy92 committer-date:2025-11-24"
    const query = `author:${username} committer-date:${date}`;
    console.log(`   → 검색 쿼리: "${query}"`);

    const { data } = await octokit.search.commits({
      q: query,
      per_page: 100,
      sort: 'committer-date',
      order: 'desc',
    });

    console.log(`   → 검색된 커밋: ${data.total_count}개`);

    if (data.total_count === 0) {
      return false;
    }

    // 각 커밋 확인
    for (const item of data.items) {
      const message = item.commit.message.toLowerCase();
      const isAutoCommit = message.includes('auto commit');
      const repoName = item.repository.full_name;
      const commitDate = item.commit.committer.date;

      console.log(`   → [${commitDate}] ${repoName}`);
      console.log(`      - "${item.commit.message}" ${isAutoCommit ? '(자동 커밋 - 제외)' : '(수동 커밋!)'}`);

      if (!isAutoCommit) {
        console.log(`   ✅ 수동 커밋 발견!`);
        return true;
      }
    }

    console.log(`   ⚠️ ${data.total_count}개 커밋 모두 자동 커밋`);
    return false;

  } catch (error) {
    console.error('   ❌ Search API 오류:', error.message);
    return false;
  }
}

function readCounter() {
  try {
    const content = fs.readFileSync(COUNTER_FILE, 'utf8').trim();
    return parseInt(content) || 0;
  } catch (error) {
    console.log('⚠️ counter.txt 없음. 0으로 초기화');
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

async function main() {
  console.log('🚀 Auto Commit Tracker 시작\n');
  console.log('='.repeat(60));

  const today = getTodayDate();
  console.log(`📅 오늘 날짜: ${today}`);
  console.log(`👤 대상 사용자: ${TARGET_USER}`);
  console.log(`🔑 토큰 설정: ${GITHUB_TOKEN ? '✅ 있음' : '❌ 없음'}`);
  console.log('='.repeat(60) + '\n');

  try {
    const hasManualCommit = await hasManualCommitToday(TARGET_USER, today);

    console.log('\n' + '='.repeat(60));
    if (hasManualCommit) {
      console.log('✅ 최종 결론: 오늘 수동 커밋이 있습니다.');
      console.log('   → 카운터를 0으로 리셋합니다.');
      console.log('='.repeat(60) + '\n');
      resetCounter(today);
    } else {
      console.log('❌ 최종 결론: 오늘 수동 커밋이 없습니다.');
      console.log('   → 자동 커밋을 실행합니다.');
      console.log('='.repeat(60) + '\n');
      await autoCommit(today);
    }

    console.log('\n🎉 작업 완료!');
  } catch (error) {
    console.error('\n❌ 오류 발생:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };

// ============================================
// 디버깅 팁
// ============================================
//
// GitHub Actions 로그에서 다음을 확인하세요:
//
// 1. "조회된 이벤트: N개"
//    - 100개 미만: 정상
//    - 100개 정확히: 이벤트가 더 있을 수 있음 (오래된 커밋은 못 찾음)
//
// 2. "PushEvent: N개"
//    - 0개: 최근에 푸시를 안 했거나, 모두 100개 범위 밖
//
// 3. "검색된 커밋: N개"
//    - Search API가 더 정확함
//    - 0개면 정말 커밋이 없는 것
//
// 4. 시간대 확인:
//    - GitHub API는 UTC 시간
//    - 한국 시간 자정 = UTC 15:00 전날
//    - 예: 한국 2025-11-25 00:30 = UTC 2025-11-24 15:30
