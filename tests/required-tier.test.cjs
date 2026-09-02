const test = require("node:test");
const assert = require("node:assert/strict");

const ranking = require("../ranking.js");

function candidate(roleId, factors) {
  return {
    role_id: roleId,
    hero_card: {
      factors: factors.map((factor, index) => ({
        factor_id: index + 1,
        rarity: factor.rarity || 0,
        total_rarity: factor.stars,
        ...factor
      }))
    }
  };
}

test("blue, red, green, and white factors preserve required priority", () => {
  const desiredFactors = [
    { type: 1, num: 1, name: "速度", tier: ranking.REQUIRED_TIER, minStars: 1, minSelfStars: 0 },
    { type: 2, num: 34, name: "泥地", tier: ranking.REQUIRED_TIER, minStars: 1, minSelfStars: 0 },
    { type: 3, num: 101, name: "固有", tier: ranking.REQUIRED_TIER, minStars: 1, minSelfStars: 0 },
    { type: 4, num: 201, name: "技能", tier: ranking.REQUIRED_TIER, minStars: 1, minSelfStars: 0 }
  ];
  const scored = ranking.scoreCandidate(candidate("all", desiredFactors.map((factor) => ({
    type: factor.type,
    num: factor.num,
    stars: 1
  }))), { colorOrder: ["blue", "red", "green", "white"], desiredFactors });

  assert.equal(scored.requiredRequestedCount, 4);
  assert.equal(scored.requiredSatisfiedCount, 4);
  assert.ok(scored.matches.every((match) => match.tier === ranking.REQUIRED_TIER));
});

test("required dirt outranks a fully satisfied higher-color preference", () => {
  const preferences = {
    colorOrder: ["blue", "red", "green", "white"],
    desiredFactors: [
      { type: 2, num: 34, name: "泥地", tier: ranking.REQUIRED_TIER, minStars: 1, minSelfStars: 0 },
      { type: 1, num: 1, name: "速度", tier: 1, minStars: 9, minSelfStars: 3 }
    ]
  };
  const hasDirt = candidate("has-dirt", [{ type: 2, num: 34, stars: 1 }]);
  const hasSpeed = candidate("has-speed", [{ type: 1, num: 1, stars: 9, rarity: 3 }]);

  const ranked = ranking.rankCandidates([hasSpeed, hasDirt], preferences);
  assert.equal(ranked[0].candidate.role_id, "has-dirt");
  assert.equal(ranked[0].requiredSatisfiedCount, 1);
});

test("query planning discovers required factors before all ordinary priorities", () => {
  const plans = ranking.planQueries({
    colorOrder: ["blue", "red", "green", "white"],
    desiredFactors: [
      { type: 1, num: 1, name: "高蓝", tier: 1, minStars: 1, minSelfStars: 0 },
      { type: 2, num: 34, name: "必需泥地", tier: ranking.REQUIRED_TIER, minStars: 1, minSelfStars: 0 },
      { type: 3, num: 101, name: "中绿", tier: 2, minStars: 1, minSelfStars: 0 }
    ]
  });

  assert.deepEqual(
    plans.filter((plan) => plan.id.startsWith("factor-")).map((plan) => plan.label),
    ["必需泥地", "高蓝", "中绿"]
  );
});
