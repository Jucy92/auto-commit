// ============================================
// 개선된 커밋 체크 로직
// ============================================
// 더 정확한 커밋 감지를 위한 개선 버전

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

// ============================================
// 개선된 커밋 체크 함수
// ============================================
/**
 * 여러 방법을 조합하여 오늘 커밋 여부 확인
 *
 * 방법 1: Public Events API (기존)
 * 방법 2: Search Commits API (더 정확)
 * 방법 3: 사용자 저장소 목록 + 각 저장소의 커밋 조회
 */
async function hasManualCommitToday(username, date) {
  console.log(`🔍 ${username}의 ${date} 커밋 조회 중...\n`);

  try {
    // ========================================
    // 방법 1: Public Events API (빠르지만 제한적)
    // ========================================
    console.log('📡 방법 1: Public Events API 조회...');
    const hasCommitFromEvents = await checkCommitsFromEvents(username, date);

    if (hasCommitFromEvents) {
      console.log('✅ Public Events에서 수동 커밋 발견!');
      return true;
    }
    console.log('❌ Public Events에서 수동 커밋 없음');

    // ========================================
    // 방법 2: Search Commits API (더 정확)
    // ========================================
    console.log('\n📡 방법 2: Search Commits API 조회...');
    const hasCommitFromSearch = await checkCommitsFromSearch(username, date);

    if (hasCommitFromSearch) {
      console.log('✅ Search API에서 수동 커밋 발견!');
      return true;
    }
    console.log('❌ Search API에서도 수동 커밋 없음');

    // ========================================
    // 방법 3: 사용자 저장소 직접 조회 (가장 정확)
    // ========================================
    console.log('\n📡 방법 3: 사용자 저장소 직접 조회...');
    const hasCommitFromRepos = await checkCommitsFromRepos(username, date);

    if (hasCommitFromRepos) {
      console.log('✅ 저장소에서 수동 커밋 발견!');
      return true;
    }
    console.log('❌ 저장소에서도 수동 커밋 없음');

    // 모든 방법에서 커밋을 찾지 못함
    console.log('\n❌ 모든 방법에서 커밋을 찾지 못했습니다.');
    return false;

  } catch (error) {
    console.error('❌ 커밋 조회 오류:', error.message);
    // 오류 시 안전하게 처리: 커밋이 있다고 가정
    return true;
  }
}

/**
 * 방법 1: Public Events API로 커밋 확인
 */
async function checkCommitsFromEvents(username, date) {
  try {
    const { data: events } = await octokit.activity.listPublicEventsForUser({
      username: username,
      per_page: 100,
    });

    const pushEvents = events.filter(event => event.type === 'PushEvent');

    for (const event of pushEvents) {
      const eventDate = event.created_at.split('T')[0];

      if (eventDate === date) {
        const commits = event.payload.commits || [];

        for (const commit of commits) {
          const message = commit.message.toLowerCase();

          if (!message.includes('auto commit')) {
            console.log(`   → 발견: "${commit.message}" (${event.repo.name})`);
            return true;
          }
        }
      }
    }

    return false;
  } catch (error) {
    console.error('   ⚠️ Events API 오류:', error.message);
    return false;
  }
}

/**
 * 방법 2: Search Commits API로 커밋 확인
 * 더 정확하지만 인증 필요
 */
async function checkCommitsFromSearch(username, date) {
  try {
    // GitHub Search API: author와 날짜로 커밋 검색
    // 쿼리: "author:Jucy92 committer-date:2025-11-24"
    const query = `author:${username} committer-date:${date}`;

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

    // "auto commit"이 아닌 커밋이 있는지 확인
    for (const item of data.items) {
      const message = item.commit.message.toLowerCase();

      if (!message.includes('auto commit')) {
        console.log(`   → 발견: "${item.commit.message}" (${item.repository.full_name})`);
        return true;
      }
    }

    console.log('   → 모든 커밋이 자동 커밋');
    return false;

  } catch (error) {
    console.error('   ⚠️ Search API 오류:', error.message);
    // Search API 실패는 치명적이지 않음
    return false;
  }
}

/**
 * 방법 3: 사용자의 저장소 목록 가져와서 각 저장소의 커밋 조회
 * 가장 정확하지만 느림
 */
async function checkCommitsFromRepos(username, date) {
  try {
    // 사용자의 저장소 목록 가져오기
    const { data: repos } = await octokit.repos.listForUser({
      username: username,
      per_page: 100,
      sort: 'updated',
      type: 'all', // public + private (권한 있으면)
    });

    console.log(`   → 저장소: ${repos.length}개 확인 중...`);

    // 최근 업데이트된 저장소부터 확인 (최적화)
    for (const repo of repos.slice(0, 10)) { // 최근 10개만 확인
      try {
        // 해당 저장소의 오늘 커밋 조회
        const since = new Date(date + 'T00:00:00Z').toISOString();
        const until = new Date(date + 'T23:59:59Z').toISOString();

        const { data: commits } = await octokit.repos.listCommits({
          owner: username,
          repo: repo.name,
          since: since,
          until: until,
          author: username,
          per_page: 100,
        });

        if (commits.length > 0) {
          console.log(`   → ${repo.name}: ${commits.length}개 커밋 발견`);

          // "auto commit"이 아닌 커밋 확인
          for (const commit of commits) {
            const message = commit.commit.message.toLowerCase();

            if (!message.includes('auto commit')) {
              console.log(`   → 발견: "${commit.commit.message}" (${repo.name})`);
              return true;
            }
          }
        }
      } catch (repoError) {
        // Private 저장소 접근 오류 등 무시
        if (repoError.status !== 404 && repoError.status !== 403) {
          console.error(`   ⚠️ ${repo.name} 조회 오류:`, repoError.message);
        }
      }
    }

    return false;

  } catch (error) {
    console.error('   ⚠️ Repos API 오류:', error.message);
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
  console.log('🚀 Auto Commit Tracker (개선 버전) 시작\n');

  const today = getTodayDate();
  console.log(`📅 오늘 날짜: ${today}`);
  console.log(`👤 대상 사용자: ${TARGET_USER}\n`);

  try {
    const hasManualCommit = await hasManualCommitToday(TARGET_USER, today);

    console.log('\n' + '='.repeat(50));
    if (hasManualCommit) {
      console.log('✅ 결론: 오늘 수동 커밋이 있습니다. 카운터를 리셋합니다.');
      console.log('='.repeat(50) + '\n');
      resetCounter(today);
    } else {
      console.log('❌ 결론: 오늘 수동 커밋이 없습니다. 자동 커밋을 실행합니다.');
      console.log('='.repeat(50) + '\n');
      await autoCommit(today);
    }

    console.log('\n🎉 작업 완료!');
  } catch (error) {
    console.error('\n❌ 오류 발생:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
