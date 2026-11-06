import { validate } from './optimizer.mjs';
export function parseScenario(text) {
  if (typeof text !== 'string' || text.length > 100000) throw new Error('Use a scenario JSON file smaller than 100 KB.');
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('This is not valid JSON. Import an exported scenario or the example file.'); }
  const checked = validate(data);
  return { title: checked.title, synthetic: checked.synthetic, budget: checked.budget, strata: checked.strata };
}
export function scenarioJSON(input) {
  const s = validate(input);
  return JSON.stringify({ schemaVersion: 1, title: s.title, synthetic: s.synthetic, budget: s.budget, strata: s.strata }, null, 2) + '\n';
}
const csvCell = value => {
  let text = String(value);
  if (/^[=+\-@\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
};
export function allocationCSV(result) {
  const rows = [['stratum', 'population', 'planning_sd', 'cost_credits', 'minimum', 'maximum', 'exact_n', 'balanced_n', 'greedy_n', 'exact_variance_contribution']];
  result.scenario.strata.forEach((s, i) => rows.push([s.name, s.population, s.sd, s.cost, s.min, s.max, result.exact.allocation[i], result.balanced.allocation[i], result.greedy.allocation[i], result.exact.contributions[i]]));
  return rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
export function reportJSON(result) {
  return JSON.stringify({ schemaVersion: 1, application: 'Samplewise 1.0.0', assumptions: ['Synthetic examples are illustrative, not field evidence.', 'Independent simple random sampling without replacement within each stratum.', 'Population weights N_h / total N; finite-population SD uses denominator N_h - 1.', 'Pilot SD estimates are treated as fixed planning inputs.', 'Standard error is model-based; sensitivity is a scenario, not a confidence interval.', 'Costs are positive integer credits; recruitment, travel overhead and nonresponse are not modeled.'], ...result }, null, 2) + '\n';
}
