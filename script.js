// ==========================
// LANGUAGE SYSTEM
// ==========================

let currentLang = "en";

function t(key) {
  return translations[currentLang][key] || key;
}

function updateLanguage() {
  document.documentElement.lang = currentLang;

  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    el.textContent = t(key);
  });

  document.getElementById("lang-toggle").textContent =
    currentLang === "en" ? "VI" : "EN";

  updateAll(); // re-render summary + dynamic text
}

document.getElementById("lang-toggle").addEventListener("click", () => {
  currentLang = currentLang === "en" ? "vi" : "en";
  updateLanguage();
});

// ==========================
// EVENT DATA
// ==========================

const eventData = {
  skill: {
    ppPerItem: 10,
    stellaritePerItem: 100,
    tiers: [
      { max: 150, cost: 30, tasha: 20 },
      { max: 850, cost: 50, tasha: 50 }
    ]
  },
  melo: {
    ppPerItem: 15,
    stellaritePerItem: 150,
    tiers: [
      { max: 150, cost: 10, tasha: 15 },
      { max: 700, cost: 50, tasha: 75 }
    ]
  },
  mount: {
    ppPerItem: 2,
    tiers: [
      { max: 150, cost: 25, tasha: 10 },
      { max: 600, cost: 50, tasha: 20 }
    ]
  },
  artifact: {
    ppPerItem: 3,
    convertDivisor: 10, // 10 energy = 1 calc unit
    tiers: [
      { max: 300, cost: 50, tasha: 10 },
      { max: 1100, cost: 100, tasha: 20 }
    ]
  },
  rune: {
    ppPerItem: 1,
    convertDivisor: 10, // 10 rune = 1 calc unit
    tiers: [
      { max: 800, cost: 100, tasha: 10 },
      { max: 2400, cost: 200, tasha: 20 }
    ]
  },
  wood: {
    convertDivisor: 10, // 10 wood = 1 calc unit
    tiers: [
      { max: 400, cost: 50, tasha: 10 },
      { max: 1100, cost: 100, tasha: 20 }
    ]
  },
  stellar: {
    stellaritePerItem: 100,
    tiers: [
      { max: 150, cost: 30, tasha: 30 },
      { max: 1000, cost: 50, tasha: 50 }
    ]
  }
};

// ==========================
// CORE FUNCTIONS
// ==========================

function calculateResource(category, rawAmount) {
  const resource = eventData[category];

  // Apply floor division if needed
  let amount = rawAmount;
  if (resource.convertDivisor) {
    amount = Math.floor(rawAmount / resource.convertDivisor);
  }
  
  let totalPP = resource.ppPerItem ? amount * resource.ppPerItem : 0;
  let totalTasha = 0;

  const cap = resource.tiers.at(-1).max;
  const capped = Math.min(amount, cap);

  let prev = 0;

  for (let tier of resource.tiers) {
    if (capped <= prev) break;

    const usable = Math.min(capped, tier.max) - prev;
    const cycles = Math.floor(usable / tier.cost);
    totalTasha += cycles * tier.tasha;

    prev = tier.max;
  }

  return { totalPP, totalTasha };
}

function getNextThresholdCost(category, currentAmount) {
  const resource = eventData[category];
  if (!resource.stellaritePerItem) return null;

  let prevMax = 0;

  for (let tier of resource.tiers) {
    if (currentAmount < tier.max) {

      const insideTier = currentAmount - prevMax;
      const progress = insideTier % tier.cost;
      const need = progress === 0 ? tier.cost : tier.cost - progress;

      return {
        category,
        stellariteNeeded: need * resource.stellaritePerItem,
        remainingItems: need
      };
    }

    prevMax = tier.max;
  }

  return null;
}


function simulateStellariteSpending() {
  let available =
    Number(document.getElementById("available-stellarites").value) || 0;

  const resources = ["skill", "melo", "stellar"];

  const currentAmounts = {};
  resources.forEach(r => {
    currentAmounts[r] =
      Number(document.getElementById(r).value) || 0;
  });

  let totalExtraTasha = 0;
  let steps = [];

  // ==========================
  // PHASE 1: Finish Partial Tier
  // ==========================

  let bestPartial = null;

  for (let r of resources) {
    const resource = eventData[r];
    if (!resource.stellaritePerItem) continue;

    const tier2 = resource.tiers[1];
    const tier1Max = resource.tiers[0].max;

    let current = currentAmounts[r];
    if (current < tier1Max) continue;

    const tierCost = tier2.cost;
    const tierTasha = tier2.tasha;

    const insideTier = (current - tier1Max) % tierCost;
    if (insideTier === 0) continue;

    const need = tierCost - insideTier;
    const stellarCost = need * resource.stellaritePerItem;

    if (stellarCost > available) continue;

    const score = tierTasha / stellarCost;

    if (!bestPartial || score > bestPartial.score) {
      bestPartial = {
        category: r,
        need,
        stellarCost,
        gain: tierTasha,
        score
      };
    }
  }

  if (bestPartial) {
    available -= bestPartial.stellarCost;
    currentAmounts[bestPartial.category] += bestPartial.need;
    totalExtraTasha += bestPartial.gain;

    steps.push({
      phase: t("first"),
      text: `${t(bestPartial.category)}: ${bestPartial.need} ${t("pulls")} → +${bestPartial.gain} ${t("tasha")}`
    });

  }

  // ==========================
  // PHASE 2: Full Block Comparison
  // ==========================

  const blockResults = [];

  for (let r of resources) {
    const resource = eventData[r];
    if (!resource.stellaritePerItem) continue;

    const tier2 = resource.tiers[1];
    const tierMax = tier2.max;

    const itemCost = resource.stellaritePerItem;
    const tierCost = tier2.cost;
    const tierTasha = tier2.tasha;

    const current = currentAmounts[r];
    if (current >= tierMax) continue;

    const remainingCap = tierMax - current;
    const maxItems = Math.floor(available / itemCost);
    const usableItems = Math.min(maxItems, remainingCap);

    const cycles = Math.floor(usableItems / tierCost);
    const totalTashaBlock = cycles * tierTasha;

    if (cycles > 0) {
      blockResults.push({
        category: r,
        totalTasha: totalTashaBlock,
        pulls: cycles * tierCost
      });
    }
  }

  const maxTasha = blockResults.length
    ? Math.max(...blockResults.map(r => r.totalTasha))
    : 0;

  if (maxTasha > 0) {
    const bestBlocks = blockResults.filter(r => r.totalTasha === maxTasha);

    const nextText = bestBlocks
      .map(r =>
        `${t(r.category)}: ${r.pulls} ${t("pulls")} → +${r.totalTasha} ${t("tasha")}`
      )
      .join(" // ");

    steps.push({
      phase: t("next"),
      text: nextText
    });

    totalExtraTasha += maxTasha;
  }

  // ==========================
  // FORMAT OUTPUT
  // ==========================

  const formattedPlan = steps
    .map(s => `<strong>${s.phase}:</strong> ${s.text}`)
    .join("<br>");

  return {
    planText: formattedPlan || "None",
    totalExtraTasha
  };
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}



// ==========================
// LIVE UPDATE
// ==========================

document.querySelectorAll("input").forEach(i =>
  i.addEventListener("input", updateAll)
);

function clampInput(id) {
  const input = document.getElementById(id);
  if (!input) return 0;

  const min = input.min !== "" ? Number(input.min) : -Infinity;
  const max = input.max !== "" ? Number(input.max) : Infinity;

  let value = Number(input.value) || 0;

  value = Math.max(min, Math.min(max, value));

  input.value = value; // write back corrected value

  return value;
}


function updateAll() {
  let baseTasha = 0;
  let totalPP = 0;

  for (let category in eventData) {
    const input = document.getElementById(category);
    if (!input) continue;

    const amount = Number(input.value) || 0;
    const result = calculateResource(category, amount);

    totalPP += result.totalPP;
    baseTasha += result.totalTasha;

    const ppCell = document.getElementById(category + "-pp");
    const tashaCell = document.getElementById(category + "-tasha");

    if (ppCell) ppCell.textContent = result.totalPP.toLocaleString();
    if (tashaCell) tashaCell.textContent = result.totalTasha.toLocaleString();
  }

  const overflowWarning =
  totalPP > 9000
    ? `<div style="color:#ef4444;font-weight:bold;">
         ⚠ Warning: PP Overflow (> 9000)
       </div>`
    : "";

  const current = Number(document.getElementById("current-tasha").value) || 0;
  const days = clampInput("days-left");
  const daily = days * 80;
  
  // ===== PACKAGE SYSTEM =====

  const packStellarQty = clampInput("pack-stellar");
  const pack099Qty = clampInput("pack-099");
  const pack499Qty = clampInput("pack-499");
  const pack999Qty = clampInput("pack-999");

  const stellarPackCost = packStellarQty * 40;
  const stellarPackTasha = packStellarQty * 10;

  const pack099Tasha = pack099Qty * 30;
  const pack499Tasha = pack499Qty * 120;
  const pack999Tasha = pack999Qty * 200;

  const packageTasha =
    stellarPackTasha +
    pack099Tasha +
    pack499Tasha +
    pack999Tasha;

  // Update package display text
  document.getElementById("pack-stellar-info").innerText =
    `${stellarPackCost} → +${stellarPackTasha} ${t("tasha")}`;

  document.getElementById("pack-099-info").innerText =
    `+${pack099Tasha} ${t("tasha")}`

  document.getElementById("pack-499-info").innerText =
    `+${pack499Tasha} ${t("tasha")}`

  document.getElementById("pack-999-info").innerText =
    `+${pack999Tasha} ${t("tasha")}`


  const sim = simulateStellariteSpending();

  const final =
    current + baseTasha + daily + packageTasha + sim.totalExtraTasha;


  document.getElementById("summary").innerHTML = `
    ${t("totalPP")}: ${totalPP.toLocaleString()}<br>
    ${totalPP > 9000 ? `<div style="color:#ef4444;font-weight:bold;">${t("warningPP")}</div>` : ""}
    ${t("baseTasha")}: ${baseTasha.toLocaleString()}<br>
    ${t("dailyTasha")}: ${daily.toLocaleString()}<br>
    ${t("packageTasha")}: ${packageTasha.toLocaleString()}<br>
    ${t("currentTasha")}: ${current.toLocaleString()}
    <hr>
    <strong style="font-size:18px;">
      ${t("totalPossible")}: ${final.toLocaleString()}
    </strong>
    <br><br>
    <strong>${t("spendPlan")}:</strong><br>
    ${sim.planText}
  `;


}

updateLanguage();
