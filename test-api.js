// GitHub API 테스트 스크립트
const { Octokit } = require('@octokit/rest');

const octokit = new Octokit({
  // 토큰 없이도 public 데이터는 조회 가능 (제한적)
});

async function testAPI() {
  const username = 'Jucy92';
  const date = '2025-11-25';

  console.log('🔍 GitHub API 테스트\n');
  console.log(`사용자: ${username}`);
  console.log(`날짜: ${date}\n`);
  console.log('='.repeat(60) + '\n');

  try {
    // Public Events API 테스트
    console.log('📡 Public Events API 호출 중...\n');
    const { data: events } = await octokit.activity.listPublicEventsForUser({
      username: username,
      per_page: 100,
    });

    console.log(`✅ 조회된 이벤트: ${events.length}개\n`);

    // PushEvent 필터링
    const pushEvents = events.filter(event => event.type === 'PushEvent');
    console.log(`✅ PushEvent: ${pushEvents.length}개\n`);

    // 오늘 날짜의 PushEvent 찾기
    console.log('='.repeat(60));
    console.log(`📅 ${date} 날짜의 PushEvent 찾기...\n`);

    let found = false;
    for (const event of pushEvents) {
      const eventDate = event.created_at.split('T')[0];
      const eventTime = event.created_at.split('T')[1];

      console.log(`이벤트: ${event.repo.name}`);
      console.log(`  날짜: ${eventDate}`);
      console.log(`  시간: ${eventTime}`);

      if (eventDate === date) {
        found = true;
        console.log(`  ✅ 오늘 날짜 매치!`);

        const commits = event.payload.commits || [];
        console.log(`  커밋 개수: ${commits.length}개`);

        commits.forEach((commit, i) => {
          console.log(`    ${i+1}. ${commit.message}`);
        });
      } else {
        console.log(`  ❌ 날짜 불일치 (찾는 날짜: ${date})`);
      }
      console.log('');
    }

    if (!found) {
      console.log('⚠️ 오늘 날짜의 PushEvent를 찾지 못했습니다!\n');
      console.log('📋 최근 PushEvent 날짜들:');
      pushEvents.slice(0, 5).forEach(event => {
        const eventDate = event.created_at.split('T')[0];
        console.log(`  - ${eventDate}: ${event.repo.name}`);
      });
    }

    console.log('\n' + '='.repeat(60));
    console.log('\n📊 요약:');
    console.log(`  - 전체 이벤트: ${events.length}개`);
    console.log(`  - PushEvent: ${pushEvents.length}개`);
    console.log(`  - ${date} PushEvent: ${found ? '✅ 발견' : '❌ 없음'}`);

  } catch (error) {
    console.error('❌ API 호출 실패:', error.message);
  }
}

testAPI();
