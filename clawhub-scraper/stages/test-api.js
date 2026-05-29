// 测试不同 API 端点的速率限制差异
async function test() {
  const endpoints = [
    { name: 'download ZIP', url: 'https://clawhub.ai/api/v1/download?slug=weather' },
    { name: 'file endpoint', url: 'https://clawhub.ai/api/v1/skills/weather/file?path=SKILL.md' },
  ];

  for (const ep of endpoints) {
    const t = Date.now();
    try {
      const r = await fetch(ep.url, { signal: AbortSignal.timeout(10000) });
      const body = await r.text();
      console.log(`${ep.name}: ${r.status} ${body.length}bytes ${Date.now()-t}ms`);
    } catch (e) {
      console.log(`${ep.name}: ERROR ${e.message} ${Date.now()-t}ms`);
    }
  }

  // 连续快速请求测试 429 阈值
  console.log('\n--- Rate limit test: 10 rapid requests ---');
  let ok = 0, limited = 0;
  for (let i = 0; i < 10; i++) {
    const r = await fetch('https://clawhub.ai/api/v1/skills/weather/file?path=SKILL.md',
      { signal: AbortSignal.timeout(10000) });
    if (r.status === 200) ok++;
    else if (r.status === 429) limited++;
    else console.log(`  ${i}: ${r.status}`);
  }
  console.log(`OK: ${ok}, 429: ${limited}`);
}
test().catch(e => console.error(e));
