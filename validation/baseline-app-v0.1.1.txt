import { validate, improvement } from './optimizer.mjs';
import { scenarios } from './scenarios.mjs';
import { parseScenario, scenarioJSON, reportJSON, allocationCSV } from './io.mjs';

const $ = id => document.getElementById(id);
const number = value => value === 0 ? '0' : Math.abs(value) < 0.001 ? value.toExponential(2) : new Intl.NumberFormat('en', { maximumFractionDigits: 3 }).format(value);
const whole = value => new Intl.NumberFormat('en', { maximumFractionDigits: 0 }).format(value);
const percent = value => value === null ? 'N/A' : value > 0 && value < 0.0001 ? '<0.0001%' : `${new Intl.NumberFormat('en', { maximumFractionDigits: 4 }).format(Math.max(0, value))}%`;
const element = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
let lastResult = null, worker = null, revision = 0, importRevision = 0, dirty = true;
const fields = ['name', 'population', 'sd', 'cost', 'min', 'max'];
const fieldLabels = ['name', 'population', 'planning standard deviation', 'cost per sample', 'minimum sample', 'maximum sample'];

function readInput() {
  return { title: $('study-title').value, synthetic: $('synthetic').checked, budget: numericValue($('budget')), strata: [...$('strata-rows').children].map(row => Object.fromEntries(fields.map(field => [field, field === 'name' ? row.querySelector(`[data-field="${field}"]`).value : numericValue(row.querySelector(`[data-field="${field}"]`))]))) };
}
function numericValue(input) { return input.value.trim() === '' ? NaN : Number(input.value); }
function setError(message) { $('error').textContent = message; $('error').hidden = !message; }
function setExportState(disabled) { $('export-report').disabled = disabled; $('export-csv').disabled = disabled; $('sensitivity-stratum').disabled = disabled; }
function stopWorker() { if (worker) { worker.terminate(); worker = null; } $('run').disabled = false; $('run').textContent = 'Find the best allocation →'; }
function markDirty() {
  importRevision++;
  revision++; dirty = true; stopWorker(); setExportState(true);
  $('stale-banner').hidden = !lastResult;
  $('dirty-note').textContent = 'Inputs changed. Run again to update the plan.';
  $('status').textContent = ''; setError(''); updateInputSummary();
}
function updateInputSummary() {
  const input = readInput();
  const cost = input.strata.reduce((sum, s) => sum + s.min * s.cost, 0);
  $('input-summary').textContent = `${input.strata.length} strata · minimum spend ${Number.isFinite(cost) ? whole(cost) : '—'} credits`;
  $('data-badge').textContent = input.synthetic ? 'SYNTHETIC PLANNING INPUTS' : 'USER-SUPPLIED INPUTS';
  $('add-stratum').disabled = input.strata.length >= 12;
  [...$('strata-rows').children].forEach((row, i) => {
    const label = row.querySelector('[data-field="name"]').value.trim() || `Stratum ${i + 1}`;
    row.querySelectorAll('input').forEach((input, j) => input.setAttribute('aria-label', `${label}: ${fieldLabels[j]}`));
    row.querySelector('button').disabled = input.strata.length === 1;
    row.querySelector('button').setAttribute('aria-label', `Remove ${label}`);
  });
}
function appendRow(stratum) {
  const row = element('tr');
  fields.forEach((field, index) => {
    const cell = element('td'); const input = element('input');
    input.dataset.field = field; input.type = index === 0 ? 'text' : 'number'; input.value = stratum[field];
    input.required = true;
    if (index === 0) input.maxLength = 60;
    else { input.min = field === 'sd' ? '0' : '1'; input.step = field === 'sd' ? 'any' : '1'; input.max = field === 'cost' ? '10000' : field === 'sd' ? '1000000' : '10000000'; }
    input.addEventListener('input', markDirty); cell.append(input); row.append(cell);
  });
  const cell = element('td'), remove = element('button', '×', 'remove-row'); remove.type = 'button';
  remove.addEventListener('click', () => { if ($('strata-rows').children.length > 1) { row.remove(); markDirty(); } });
  cell.append(remove); row.append(cell); $('strata-rows').append(row);
}
function loadScenario(scenario, runNow = true) {
  stopWorker(); $('strata-rows').replaceChildren();
  $('study-title').value = scenario.title; $('budget').value = scenario.budget; $('synthetic').checked = scenario.synthetic === true;
  scenario.strata.forEach(appendRow); markDirty();
  if (runNow) run(0);
}
function run(selectedIndex = Number($('sensitivity-stratum').value) || 0) {
  importRevision++;
  setError(''); const input = readInput();
  try { validate(input); } catch (error) { setError(error.message); $('status').textContent = 'Check the inputs above; the previous plan has not been updated.'; return; }
  stopWorker(); const id = ++revision;
  $('run').disabled = true; $('run').textContent = 'Solving the integer allocation…';
  $('status').textContent = 'Checking every feasible integer choice, plus two sensitivity scenarios…';
  setExportState(true);
  try { worker = new Worker(new URL('./worker.mjs', import.meta.url), { type: 'module' }); }
  catch { setError('The calculation worker could not start. Run npm start and open the localhost address; file:// pages are not supported.'); stopWorker(); return; }
  worker.onmessage = ({ data }) => {
    if (data.id !== revision) return;
    stopWorker();
    if (data.error) { setError(data.error); $('status').textContent = 'No new allocation was produced.'; return; }
    lastResult = data.result; dirty = false;
    render(lastResult); setExportState(false);
    $('dirty-note').textContent = 'The results below match these inputs.';
    $('status').textContent = `Allocation ready. ${whole(lastResult.exact.samples)} samples, ${whole(lastResult.exact.cost)} credits, estimated SE ${number(lastResult.exact.se)}.`;
  };
  worker.onerror = event => { if (id !== revision) return; event.preventDefault(); stopWorker(); setError('The calculation worker failed. Serve this folder with npm start, then reload.'); $('status').textContent = 'Calculation unavailable.'; };
  worker.postMessage({ id, input, sensitivityIndex: Math.min(selectedIndex, input.strata.length - 1) });
}
function render(result) {
  const { scenario, exact, balanced, greedy } = result;
  $('results').hidden = false; $('stale-banner').hidden = true;
  $('se-value').textContent = number(exact.se);
  $('se-note').textContent = exact.se === 0 ? 'Zero under the supplied finite-population model.' : 'Outcome units. Lower means more precise under the model.';
  $('samples-value').textContent = whole(exact.samples);
  $('samples-note').textContent = `Across ${scenario.strata.length} strata, with every minimum met.`;
  $('cost-value').textContent = whole(exact.cost);
  $('cost-note').textContent = `${whole(exact.unused)} of ${whole(scenario.budget)} credits remain.`;
  $('gain-value').textContent = percent(improvement(greedy.variance, exact.variance));
  $('gain-note').textContent = greedy.variance === 0 ? 'Greedy variance is zero; a percentage is undefined.' : 'Modeled variance reduction at the same budget cap.';
  $('optimal-label').textContent = scenario.synthetic ? 'SYNTHETIC / EXACT INTEGER OPTIMUM' : 'EXACT INTEGER OPTIMUM';
  $('allocation-bars').replaceChildren();
  const maxCount = Math.max(...exact.allocation);
  scenario.strata.forEach((s, i) => {
    const row = element('div', undefined, 'allocation-row'), label = element('div', undefined, 'allocation-label');
    label.append(element('span', s.name), element('strong', whole(exact.allocation[i])));
    const track = element('div', undefined, 'allocation-track'), fill = element('div', undefined, 'allocation-fill');
    fill.style.width = `${100 * exact.allocation[i] / maxCount}%`; track.append(fill); track.setAttribute('aria-hidden', 'true');
    const meta = element('div', undefined, 'allocation-meta');
    meta.append(element('span', `${whole(s.cost * exact.allocation[i])} credits · bounds ${s.min}–${s.max}`), element('span', exact.variance > 0 ? `${(100 * exact.contributions[i] / exact.variance).toFixed(1)}% of variance` : 'zero variance'));
    row.append(label, track, meta); $('allocation-bars').append(row);
  });
  $('comparison').replaceChildren();
  for (const [label, plan] of [['Exact optimum', exact], ['Cost-aware greedy', greedy], ['Balanced counts', balanced]]) {
    const row = element('tr'); if (label === 'Exact optimum') row.className = 'recommended';
    for (const value of [label, number(plan.variance), number(plan.se), whole(plan.cost)]) row.append(element('td', value));
    $('comparison').append(row);
  }
  const greedyGain = improvement(greedy.variance, exact.variance);
  $('greedy-note').textContent = greedyGain === null ? 'Both the greedy and exact plans have zero modeled variance. A percentage improvement is undefined.' : greedyGain === 0 ? 'The cost-aware greedy plan reaches the same modeled precision here. Exact optimization checks that there is no better feasible integer plan.' : `Exact optimization reduces modeled variance by ${percent(greedyGain)} versus cost-aware greedy. Unequal integer costs can make a locally attractive sample block a better combination.`;
  renderFrontier(result);
  $('sensitivity-stratum').replaceChildren();
  scenario.strata.forEach((s, i) => { const option = element('option', s.name); option.value = i; $('sensitivity-stratum').append(option); });
  $('sensitivity-stratum').value = result.sensitivity.index;
  renderSensitivity(result);
  const largestIndex = exact.contributions.indexOf(Math.max(...exact.contributions));
  const binding = scenario.strata.filter((s, i) => exact.allocation[i] === s.min || exact.allocation[i] === s.max).length;
  $('rationale-text').textContent = exact.variance === 0 ? 'Every stratum has zero contribution under the supplied model: it is fully sampled or its planning SD is zero. Extra samples cannot lower the modeled variance further. A pilot SD of zero is an assumption to review, not proof of no variation.' : `${scenario.strata[largestIndex].name} contributes the most remaining variance. The optimizer balances population weight, planning SD and marginal variance reduction against each sample's cost. ${binding} of ${scenario.strata.length} strata sit at a minimum or maximum; those constraints are part of this answer.`;
  $('certificate').textContent = `${result.certificate.method} · ${whole(result.certificate.statesPerLayer)} cost states per layer · at most ${whole(result.certificate.operationUpperBound)} transitions per solve. Equal-objective plans prefer lower spend. Optimality applies to the stated model and Float64 arithmetic.`;
}
const svgElement = (tag, attrs, text) => { const node = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value); if (text !== undefined) node.textContent = text; return node; };
function renderFrontier(result) {
  const points = result.frontier, width = 540, height = 220, left = 52, right = 15, top = 20, bottom = 35;
  const minBudget = points[0].budget, maxBudget = points.at(-1).budget;
  const maxSE = points[0].se || 1;
  const x = b => left + (maxBudget === minBudget ? 0.5 : (b - minBudget) / (maxBudget - minBudget)) * (width - left - right);
  const y = se => height - bottom - se / maxSE * (height - top - bottom);
  const svg = svgElement('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': `Optimal estimated standard error falls from ${number(points[0].se)} at ${minBudget} credits to ${number(points.at(-1).se)} at ${maxBudget} credits. Exact values are available in the table below.` });
  for (let i = 0; i <= 3; i++) { const value = maxSE * i / 3; svg.append(svgElement('line', { x1: left, x2: width - right, y1: y(value), y2: y(value), stroke: '#e0e5d7', 'stroke-dasharray': '3 4' }), svgElement('text', { x: left - 8, y: y(value) + 3, 'text-anchor': 'end' }, number(value))); }
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.budget)},${y(p.se)}`).join(' ');
  svg.append(svgElement('path', { d: `${path} L${x(maxBudget)},${height - bottom} L${x(minBudget)},${height - bottom} Z`, fill: '#dce9c8', opacity: '.5' }), svgElement('path', { d: path, fill: 'none', stroke: '#426743', 'stroke-width': 2.5 }));
  points.forEach((p, i) => { const dot = svgElement('circle', { cx: x(p.budget), cy: y(p.se), r: 2.5, fill: '#426743', 'data-point': i }); dot.append(svgElement('title', {}, `${p.budget} credits: SE ${number(p.se)}, allocation ${p.allocation.join(', ')}`)); svg.append(dot); });
  svg.append(svgElement('text', { x: x(minBudget), y: height - 9, 'text-anchor': maxBudget === minBudget ? 'middle' : 'start' }, `${whole(minBudget)} cr`));
  if (maxBudget !== minBudget) svg.append(svgElement('text', { x: x(maxBudget), y: height - 9, 'text-anchor': 'end' }, `${whole(maxBudget)} cr`));
  $('frontier-chart').replaceChildren(svg);
  $('frontier-index').max = points.length - 1; $('frontier-index').value = points.length - 1; $('frontier-index').disabled = points.length < 2;
  $('frontier-table').replaceChildren();
  points.forEach(p => { const row = element('tr'); [whole(p.budget), whole(p.cost), whole(p.samples), number(p.se)].forEach(value => row.append(element('td', value))); $('frontier-table').append(row); });
  updateFrontier();
}
function updateFrontier() {
  if (!lastResult) return;
  const index = Number($('frontier-index').value), point = lastResult.frontier[index];
  $('frontier-budget').textContent = `${whole(point.budget)} credits`;
  $('frontier-note').textContent = `Estimated SE ${number(point.se)} · ${whole(point.samples)} samples · ${whole(point.cost)} credits spent. Allocation: ${lastResult.scenario.strata.map((s, i) => `${s.name} ${point.allocation[i]}`).join('; ')}.`;
  $('frontier-chart').querySelectorAll('[data-point]').forEach(dot => { const selected = Number(dot.dataset.point) === index; dot.setAttribute('r', selected ? '5.5' : '2.5'); dot.setAttribute('fill', selected ? '#c66b3b' : '#426743'); });
}
function renderSensitivity(result) {
  $('sensitivity-cases').replaceChildren();
  result.sensitivity.cases.forEach(s => {
    const card = element('div', undefined, 'sensitivity-case');
    card.append(element('h4', `${s.multiplier < 1 ? '−25%' : '+25%'} planning SD${s.sd !== undefined ? ` · ${number(s.sd)}` : ''}`));
    if (s.unavailable) card.append(element('p', s.unavailable));
    else {
      const p = element('p'); p.append('Keep this plan: SE ', element('strong', number(s.retained.se)), '. Re-optimize: SE ', element('strong', number(s.optimal.se)), '.'); card.append(p);
      const changes = result.scenario.strata.flatMap((stratum, i) => s.optimal.allocation[i] === result.exact.allocation[i] ? [] : [`${stratum.name}: ${result.exact.allocation[i]} → ${s.optimal.allocation[i]}`]);
      card.append(element('p', changes.length ? changes.join('; ') : 'The optimal allocation is unchanged in this scenario.'));
    }
    $('sensitivity-cases').append(card);
  });
}
function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = element('a'); link.href = url; link.download = name; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  $('status').textContent = `Prepared ${name} for download.`;
}
$('example').addEventListener('change', () => loadScenario(structuredClone(scenarios[$('example').value])));
$('study-title').addEventListener('input', markDirty); $('budget').addEventListener('input', markDirty); $('synthetic').addEventListener('change', markDirty);
$('add-stratum').addEventListener('click', () => { if ($('strata-rows').children.length >= 12) return; const names = readInput().strata.map(s => s.name); let i = 1; while (names.includes(`Stratum ${i}`)) i++; appendRow({ name: `Stratum ${i}`, population: 100, sd: 10, cost: 1, min: 5, max: 50 }); markDirty(); $('strata-rows').lastElementChild.querySelector('input').focus(); });
$('run').addEventListener('click', () => run()); $('sensitivity-stratum').addEventListener('change', () => run()); $('frontier-index').addEventListener('input', updateFrontier);
$('export-scenario').addEventListener('click', () => { try { download('samplewise-scenario.json', scenarioJSON(readInput()), 'application/json'); setError(''); } catch (error) { setError(error.message); } });
$('export-report').addEventListener('click', () => { if (lastResult && !dirty) download('samplewise-report.json', reportJSON(lastResult), 'application/json'); });
$('export-csv').addEventListener('click', () => { if (lastResult && !dirty) download('samplewise-allocation.csv', allocationCSV(lastResult), 'text/csv;charset=utf-8'); });
$('import-button').addEventListener('click', () => $('import-file').click());
$('import-file').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  event.target.value = '';
  const id = ++importRevision;
  try {
    if (file.size > 100000) throw new Error('Use a scenario JSON file smaller than 100 KB.');
    const text = await file.text();
    if (id !== importRevision) return;
    const scenario = parseScenario(text);
    $('example').selectedIndex = -1; loadScenario(scenario);
  } catch (error) { if (id === importRevision) setError(error.message); }
});
setExportState(true); loadScenario(structuredClone(scenarios.water));
