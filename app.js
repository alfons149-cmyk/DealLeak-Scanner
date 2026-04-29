/**
 * DealLeak Scanner — calculation engine & UI controller
 *
 * Inputs:
 *   leadsPerMonth    – number of inbound leads per month
 *   avgDeal          – average deal value in euros
 *   followUpPct      – percentage of leads currently followed up (0-100)
 *   responseTimeHrs  – average response time in hours
 *
 * Outputs:
 *   missedRevenue    – estimated monthly revenue left on the table
 *   riskZones        – array of {label, level, detail} objects
 *   quickWins        – array of actionable improvement suggestions
 */

'use strict';

/* ============================================================
   Calculation logic (pure functions — easy to unit-test)
   ============================================================ */

/**
 * Returns a conversion-rate multiplier based on average response time.
 * Source: industry research on lead response time & conversion rates.
 *
 * @param {number} hours – average response time in hours
 * @returns {number} multiplier in range [0.08 … 1.0]
 */
function responseTimeMultiplier(hours) {
  if (hours <= 1)   return 1.00;  // Best case – respond within the hour
  if (hours <= 5)   return 0.80;  // Same morning / afternoon
  if (hours <= 24)  return 0.50;  // Same business day
  if (hours <= 72)  return 0.25;  // Within 3 days
  return 0.08;                    // Longer – lead has gone cold
}

/**
 * Calculates how much potential revenue is being lost per month.
 *
 * Approach:
 *   optimal revenue  = leadsPerMonth × avgDeal × BASE_CONVERSION
 *   current revenue  = leadsPerMonth × (followUpPct/100) × avgDeal
 *                      × BASE_CONVERSION × responseMultiplier
 *   missed revenue   = optimal - current
 *
 * BASE_CONVERSION is the industry-average B2B lead-to-close rate (20%).
 *
 * @param {number} leadsPerMonth
 * @param {number} avgDeal
 * @param {number} followUpPct   (0–100)
 * @param {number} responseTimeHrs
 * @returns {{ missedMonthly: number, missedYearly: number,
 *             optimalMonthly: number, currentMonthly: number,
 *             missedFromFollowUp: number, missedFromResponseTime: number }}
 */
function calcMissedRevenue(leadsPerMonth, avgDeal, followUpPct, responseTimeHrs) {
  const BASE_CONVERSION = 0.20;
  const rtm = responseTimeMultiplier(responseTimeHrs);
  const followUpRatio = followUpPct / 100;

  const optimalMonthly = leadsPerMonth * avgDeal * BASE_CONVERSION;
  const currentMonthly = leadsPerMonth * followUpRatio * avgDeal * BASE_CONVERSION * rtm;

  // Break-down of where the loss comes from
  // 1. Not following up at all
  const missedFromFollowUp =
    leadsPerMonth * (1 - followUpRatio) * avgDeal * BASE_CONVERSION;

  // 2. Slow response on the leads that ARE followed up
  const missedFromResponseTime =
    leadsPerMonth * followUpRatio * avgDeal * BASE_CONVERSION * (1 - rtm);

  const missedMonthly = optimalMonthly - currentMonthly;

  return {
    missedMonthly: Math.round(missedMonthly),
    missedYearly:  Math.round(missedMonthly * 12),
    optimalMonthly: Math.round(optimalMonthly),
    currentMonthly: Math.round(currentMonthly),
    missedFromFollowUp: Math.round(missedFromFollowUp),
    missedFromResponseTime: Math.round(missedFromResponseTime),
  };
}

/**
 * Determines risk zones for follow-up rate and response time.
 *
 * @param {number} followUpPct
 * @param {number} responseTimeHrs
 * @returns {Array<{ label: string, level: 'high'|'medium'|'low', detail: string }>}
 */
function calcRiskZones(followUpPct, responseTimeHrs) {
  const zones = [];

  // --- Follow-up rate risk ---
  let followUpLevel, followUpDetail;
  if (followUpPct < 50) {
    followUpLevel  = 'high';
    followUpDetail = `Je laat meer dan de helft (${100 - followUpPct}%) van je leads volledig liggen.`;
  } else if (followUpPct < 80) {
    followUpLevel  = 'medium';
    followUpDetail = `${100 - followUpPct}% van je leads krijgt geen opvolging.`;
  } else {
    followUpLevel  = 'low';
    followUpDetail = `Je volgt ${followUpPct}% op — goed bezig! Optimaliseer nu je snelheid.`;
  }
  zones.push({
    label:  'Opvolgingspercentage',
    level:  followUpLevel,
    detail: followUpDetail,
  });

  // --- Response time risk ---
  let rtLevel, rtDetail;
  if (responseTimeHrs > 24) {
    rtLevel  = 'high';
    rtDetail = `${responseTimeHrs} uur responstijd — de meeste leads zijn dan al afgekoeld.`;
  } else if (responseTimeHrs > 5) {
    rtLevel  = 'medium';
    rtDetail = `${responseTimeHrs} uur responstijd — sneller reageren verhoogt conversie sterk.`;
  } else {
    rtLevel  = 'low';
    rtDetail = `${responseTimeHrs} uur responstijd — je zit in de top van je markt.`;
  }
  zones.push({
    label:  'Responstijd',
    level:  rtLevel,
    detail: rtDetail,
  });

  // --- Combination risk: both bad at once ---
  if (followUpPct < 50 && responseTimeHrs > 24) {
    zones.push({
      label:  'Gecombineerd risico',
      level:  'high',
      detail: 'Lage opvolging én trage respons versterken elkaar — dit is de grootste lek.',
    });
  }

  return zones;
}

/**
 * Generates prioritised quick-win suggestions.
 *
 * @param {number} leadsPerMonth
 * @param {number} avgDeal
 * @param {number} followUpPct
 * @param {number} responseTimeHrs
 * @returns {Array<{ icon: string, text: string, gain: number }>}
 */
function calcQuickWins(leadsPerMonth, avgDeal, followUpPct, responseTimeHrs) {
  const BASE_CONVERSION = 0.20;
  const rtm = responseTimeMultiplier(responseTimeHrs);
  const followUpRatio = followUpPct / 100;
  const wins = [];

  // Win 1 – Improve follow-up rate to 100 %
  if (followUpPct < 100) {
    const gain = leadsPerMonth * (1 - followUpRatio) * avgDeal * BASE_CONVERSION * rtm;
    if (gain > 0) {
      wins.push({
        icon: '📋',
        text: `Volg <strong>alle ${leadsPerMonth} leads</strong> op in plaats van ${followUpPct}%`,
        gain: Math.round(gain),
      });
    }
  }

  // Win 2 – Reduce response time to < 1 hour
  if (responseTimeHrs > 1) {
    const gainWithFullFollowUp =
      leadsPerMonth * followUpRatio * avgDeal * BASE_CONVERSION * (1.0 - rtm);
    if (gainWithFullFollowUp > 0) {
      wins.push({
        icon: '⏱️',
        text: `Reageer <strong>binnen 1 uur</strong> op leads (nu: ${responseTimeHrs} uur)`,
        gain: Math.round(gainWithFullFollowUp),
      });
    }
  }

  // Win 3 – Combined: 100% follow-up AND < 1 hour response
  const currentRevenue =
    leadsPerMonth * followUpRatio * avgDeal * BASE_CONVERSION * rtm;
  const optimalRevenue =
    leadsPerMonth * 1.0 * avgDeal * BASE_CONVERSION * 1.0;
  const combinedGain  = optimalRevenue - currentRevenue;

  if (combinedGain > 0 && wins.length > 1) {
    wins.push({
      icon: '🏆',
      text: `Doe <strong>beide</strong>: 100% opvolging + respons &lt; 1 uur`,
      gain: Math.round(combinedGain),
    });
  }

  // Sort by gain descending so the biggest opportunity is shown first
  wins.sort((a, b) => b.gain - a.gain);

  return wins;
}

/* ============================================================
   Utility helpers
   ============================================================ */

/**
 * Formats a euro amount with thousands separator.
 * @param {number} amount
 * @returns {string}  e.g. "€ 12.500"
 */
function formatEuro(amount) {
  return '€\u00a0' + Math.round(amount).toLocaleString('nl-NL');
}

const RISK_LABELS = { high: 'Hoog risico', medium: 'Matig risico', low: 'Laag risico' };

/* ============================================================
   DOM interaction
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  const form           = document.getElementById('scanner-form');
  const resultsSection = document.getElementById('results');

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const inputs = {
      leads:       document.getElementById('leads'),
      dealAmount:  document.getElementById('deal-amount'),
      followUpPct: document.getElementById('follow-up-pct'),
      responseTime: document.getElementById('response-time'),
    };

    // --- Validate ---
    let valid = true;

    function setError(field, errorId, msg) {
      const errEl = document.getElementById(errorId);
      const wrapper = field.closest('.input-wrapper');
      if (msg) {
        errEl.textContent = msg;
        wrapper.classList.add('error');
        valid = false;
      } else {
        errEl.textContent = '';
        wrapper.classList.remove('error');
      }
    }

    const leadsVal       = parseFloat(inputs.leads.value);
    const dealVal        = parseFloat(inputs.dealAmount.value);
    const followUpVal    = parseFloat(inputs.followUpPct.value);
    const responseVal    = parseFloat(inputs.responseTime.value);

    setError(inputs.leads, 'leads-error',
      isNaN(leadsVal) || leadsVal < 1 ? 'Voer een getal in van minimaal 1' : null);

    setError(inputs.dealAmount, 'deal-amount-error',
      isNaN(dealVal) || dealVal < 1 ? 'Voer een positief bedrag in' : null);

    setError(inputs.followUpPct, 'follow-up-pct-error',
      isNaN(followUpVal) || followUpVal < 0 || followUpVal > 100
        ? 'Voer een percentage in tussen 0 en 100' : null);

    setError(inputs.responseTime, 'response-time-error',
      isNaN(responseVal) || responseVal < 0 ? 'Voer een getal van 0 of meer in' : null);

    if (!valid) return;

    // --- Calculate ---
    const revenue   = calcMissedRevenue(leadsVal, dealVal, followUpVal, responseVal);
    const riskZones = calcRiskZones(followUpVal, responseVal);
    const quickWins = calcQuickWins(leadsVal, dealVal, followUpVal, responseVal);

    // --- Render missed revenue ---
    document.getElementById('missed-monthly').textContent = formatEuro(revenue.missedMonthly);
    document.getElementById('missed-yearly').textContent  = formatEuro(revenue.missedYearly);
    document.getElementById('revenue-breakdown').textContent =
      `Huidige omzet (schatting): ${formatEuro(revenue.currentMonthly)}/mnd  •  `
      + `Niet-opgevolgde leads: ${formatEuro(revenue.missedFromFollowUp)}/mnd  •  `
      + `Langzame respons: ${formatEuro(revenue.missedFromResponseTime)}/mnd`;

    // --- Render risk zones ---
    const riskList = document.getElementById('risk-list');
    riskList.innerHTML = riskZones.map(zone => `
      <div class="risk-item">
        <span class="risk-badge ${zone.level}">${RISK_LABELS[zone.level]}</span>
        <div>
          <div class="risk-description"><strong>${zone.label}</strong></div>
          <div class="risk-detail">${zone.detail}</div>
        </div>
      </div>
    `).join('');

    // --- Render quick wins ---
    const winsList = document.getElementById('quick-wins-list');
    if (quickWins.length === 0) {
      winsList.innerHTML = '<li class="quick-win-item"><span class="win-icon">✅</span>'
        + '<span class="win-text">Geweldig — je benut je leads al optimaal!</span></li>';
    } else {
      winsList.innerHTML = quickWins.map(win => `
        <li class="quick-win-item">
          <span class="win-icon">${win.icon}</span>
          <span class="win-text">
            ${win.text}
            <br>
            <span class="win-gain">+ ${formatEuro(win.gain)} / maand extra</span>
          </span>
        </li>
      `).join('');
    }

    // --- Show results ---
    resultsSection.classList.remove('hidden');
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});
