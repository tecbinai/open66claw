#!/usr/bin/env node

const GUIDE_URL = "https://skillhub.cn/install/skillhub.md";

const result = {
  ok: false,
  reason: "skillhub_required",
  action: "detail",
  message:
    "The built-in 66Claw cloud skill mirror was removed from the open-source build. Install and configure SkillHub China mirror service instead.",
  guide: GUIDE_URL,
};

console.error(`SkillHub China mirror setup guide: ${GUIDE_URL}`);
console.log(JSON.stringify(result, null, 2));
process.exitCode = 1;
