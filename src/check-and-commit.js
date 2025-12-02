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
const LAST_RUN_FILE = path.join(__dirname, '..', 'last-run.txt');

const octokit = new Octokit({
  auth: GITHUB_TOKEN,
});

function getTodayDate() {
  const today = new Date();
  return today.toISOString().split('T')[0];
}

/**
 * Public 저장소의 커밋 체크 (신뢰성 개선 버전)
 *
 * 핵심 로직:
 * - 모든 Public 저장소를 직접 조회 (Commits API)
 * - 커밋 메시지에 "auto commit"이 포함된 것만 제외
 * - 저장소 이름과 무관하게 모든 수동 커밋 인정
 */
async function hasManualCommitToday(username, date) {
  console.log(`🔍 ${username}의 ${date} 커밋 조회 중 (Commits API 직접 조회)...\n`);
  console.log('='.repeat(60));

  try {
    // 1단계: 사용자의 모든 Public 저장소 가져오기
    console.log('📡 Public 저장소 목록 조회...');
    const { data: repos } = await octokit.repos.listForUser({
      username: username,
      type: 'public',
      per_page: 100,
      sort: 'updated',
    });

    console.log(`✅ 조회된 저장소: ${repos.length}개\n`);

    let totalAutoCommits = 0;
    let totalManualCommits = 0;
    let checkedRepos = 0;

    // 2단계: 각 저장소의 오늘 커밋 조회
    for (const repo of repos) {
      try {
        const { data: commits } = await octokit.repos.listCommits({
          owner: username,
          repo: repo.name,
          author: username,
          since: `${date}T00:00:00Z`,
          until: `${date}T23:59:59Z`,
          per_page: 100,
        });

        if (commits.length > 0) {
          checkedRepos++;
          console.log(`📦 저장소: ${repo.name}`);
          console.log(`   커밋 개수: ${commits.length}개`);

          // 3단계: 각 커밋 메시지 확인
          for (const commit of commits) {
            const message = commit.commit.message.toLowerCase();
            const isAutoCommit = message.includes('auto commit');
            const commitTime = commit.commit.author.date.split('T')[1].split('Z')[0];

            console.log(`   [${commitTime}] "${commit.commit.message}"`);
            console.log(`     → ${isAutoCommit ? '(자동 커밋 - 제외)' : '(✅ 수동 커밋!)'}`);

            if (!isAutoCommit) {
              totalManualCommits++;
              console.log('\n' + '='.repeat(60));
              console.log('✅ 수동 커밋 발견!');
              console.log(`   저장소: ${repo.name}`);
              console.log(`   메시지: "${commit.commit.message}"`);
              console.log(`   시간: ${commit.commit.author.date}`);
              console.log('='.repeat(60));
              return true;
            } else {
              totalAutoCommits++;
            }
          }
          console.log('');
        }
      } catch (error) {
        // 개별 저장소 접근 실패는 무시하고 계속
        if (error.status === 409) {
          console.log(`   ⚠️ ${repo.name}: 빈 저장소 (스킵)`);
        } else {
          console.log(`   ⚠️ ${repo.name}: 접근 실패 (${error.message})`);
        }
        continue;
      }
    }

    console.log('='.repeat(60));
    console.log(`📊 오늘(${date}) 통계:`);
    console.log(`   - 확인한 저장소: ${checkedRepos}개 / ${repos.length}개`);
    console.log(`   - 자동 커밋: ${totalAutoCommits}개`);
    console.log(`   - 수동 커밋: ${totalManualCommits}개`);
    console.log('='.repeat(60));

    if (totalManualCommits > 0) {
      console.log('✅ 수동 커밋 있음!');
      return true;
    }

    console.log('❌ 수동 커밋 없음');
    return false;

  } catch (error) {
    console.error('❌ API 오류:', error.message);
    console.error('   → 안전을 위해 수동 커밋으로 간주');
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

function getLastRunDate() {
  try {
    const content = fs.readFileSync(LAST_RUN_FILE, 'utf8').trim();
    return content || null;
  } catch (error) {
    return null;
  }
}

function setLastRunDate(date) {
  fs.writeFileSync(LAST_RUN_FILE, date);
  console.log(`📅 마지막 실행 날짜 저장: ${date}`);
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
    execSync('git config user.name "Jucy92"', { encoding: 'utf8' });
    execSync('git config user.email "cyju92@gmail.com"', { encoding: 'utf8' });

    console.log('📦 변경사항 스테이징...');
    // counter.txt와 logs/ 는 항상 추가
    execSync('git add counter.txt logs/', { encoding: 'utf8' });

    // last-run.txt는 존재할 때만 추가
    if (fs.existsSync(LAST_RUN_FILE)) {
      execSync('git add last-run.txt', { encoding: 'utf8' });
    }

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
    setLastRunDate(date); // 실행 날짜 기록 (커밋 전에 파일 생성)
    appendLog(date, `Manual commit detected. Counter reset from ${currentCounter} to 0.`);
    console.log(`\n🔄 카운터 리셋: ${currentCounter} → 0`);

    // ✅ 카운터 리셋을 즉시 커밋하여 GitHub에 반영
    try {
      const commitMessage = `Reset counter: Manual commit detected on ${date}`;
      executeGitCommit(commitMessage);
      console.log('✅ 카운터 리셋 커밋 완료');
    } catch (error) {
      console.error('⚠️ 카운터 리셋 커밋 실패:', error.message);
      // 실패해도 계속 진행 (로컬 파일은 이미 수정됨)
    }
  } else {
    console.log(`\n✅ 카운터 이미 0 (리셋 불필요)`);
  }
}

async function autoCommit(date) {
  const counter = readCounter();
  const newCounter = counter + 1;

  console.log(`\n📈 카운터 증가: ${counter} → ${newCounter}`);
  writeCounter(newCounter);
  setLastRunDate(date); // 실행 날짜 기록

  appendLog(date, `auto commit ${newCounter}day`);

  const commitMessage = `auto commit ${newCounter}day`;
  executeGitCommit(commitMessage);

  console.log(`✅ 자동 커밋 완료: ${commitMessage}`);
}

async function main() {
  console.log('🚀 Auto Commit Tracker 시작\n');
  console.log('='.repeat(60));

  const today = getTodayDate();
  const lastRun = getLastRunDate();

  console.log(`📅 오늘 날짜: ${today}`);
  console.log(`📅 마지막 실행: ${lastRun || '없음'}`);
  console.log(`👤 대상 사용자: ${TARGET_USER}`);
  console.log(`🔑 토큰: ${GITHUB_TOKEN ? '✅ 설정됨' : '❌ 없음'}`);
  console.log('='.repeat(60) + '\n');

  // ✅ 중복 실행 방지: 오늘 이미 실행되었으면 종료
  if (lastRun === today) {
    console.log('⏭️ 오늘 이미 실행됨. 중복 실행 방지로 종료.');
    console.log('   (수동으로 다시 실행하려면 last-run.txt 삭제)');
    return;
  }

  try {
    const hasManualCommit = await hasManualCommitToday(TARGET_USER, today);

    console.log('\n' + '='.repeat(60));
    if (hasManualCommit) {
      console.log('✅ 최종 결론: 오늘 수동 커밋 있음');
      console.log('   → 자동 커밋 안 함 (카운터 리셋)');
      console.log('='.repeat(60));
      resetCounter(today);
      // resetCounter 내부에서 setLastRunDate(today) 호출됨
    } else {
      console.log('❌ 최종 결론: 오늘 수동 커밋 없음');
      console.log('   → 자동 커밋 실행');
      console.log('='.repeat(60));
      await autoCommit(today);
      // autoCommit 내부에서 setLastRunDate(today) 호출됨
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
