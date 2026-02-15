#!/usr/bin/env node
/**
 * Baseline Batch Grading Test
 *
 * Sends 30 demo students to the grading server's /api/grade SSE endpoint
 * and captures all results + timing for A/B comparison.
 *
 * Usage: node test-data/run-baseline.js [output-file]
 * Default output: test-data/baseline.json
 */

const OUTPUT_FILE = process.argv[2] || 'test-data/baseline.json';
const STRATEGY = process.argv[3] || 'serial'; // 'serial' or 'parallel'
const MODEL = process.argv[4] || 'claude-haiku-4.5';
const CHUNK_SIZE = parseInt(process.argv[5]) || 30;
const STUDENT_COUNT = parseInt(process.argv[6]) || 30; // how many students to include
const SWEEP_MODE = process.argv[7] || 'auto'; // 'none', 'compact', 'pairwise', 'auto'
const SERVER_URL = 'http://localhost:3456';

// ── Demo student data (matches demo-grading-page.html) ──
const students = [
  { index: 0, name: "Anderson, Marcus", response: "The Central Limit Theorem (CLT) states that regardless of the population distribution, the sampling distribution of the sample mean approaches a normal distribution as the sample size n increases. The standard error is calculated as SE = σ/√n. Since the margin of error is MOE = z* × SE, increasing n makes SE smaller and therefore shrinks the margin of error. For example, quadrupling the sample size from 100 to 400 cuts the margin of error in half because √400/√100 = 20/10 = 2. This inverse square root relationship means there are diminishing returns — to get a 10× improvement in precision, you need 100× the sample size. This is why most national polls use around 1,000–1,500 respondents, balancing cost with acceptable precision." },
  { index: 1, name: "Brooks, Jaylen", response: "The CLT says that sample means follow a normal distribution when n is large enough. Standard error = σ/√n, so bigger samples give smaller SE. Since margin of error depends on SE (MOE = z* × SE), a larger sample reduces the margin of error. This is why researchers want large samples — they produce more precise estimates of population parameters. The relationship follows an inverse square root pattern." },
  { index: 2, name: "Chen, Lily", response: "According to the Central Limit Theorem, the sampling distribution of x-bar becomes approximately normal as n increases. The standard error σ/√n decreases with larger n. Because the margin of error equals the critical value times the standard error, it decreases too. If you double n, the margin of error decreases by a factor of √2 ≈ 1.41. To halve the margin of error, you need to quadruple n. This explains why polling organizations must balance sample size against cost — each incremental improvement in precision requires proportionally more data." },
  { index: 3, name: "Davis, Amara", response: "Larger sample sizes decrease the margin of error. The CLT shows that sample means are normally distributed with standard error σ/√n. Since MOE = z* × SE, when n goes up, SE goes down, and so does the margin of error. This is fundamental to statistical inference — larger samples give tighter confidence intervals around our estimates." },
  { index: 4, name: "Evans, Tyler", response: "The Central Limit Theorem tells us that the distribution of sample means becomes normal as sample size grows. The standard error is sigma over square root of n. The margin of error uses standard error in its formula, so when standard error shrinks from a bigger sample, the margin of error also shrinks. You need about 4 times the sample size to cut margin of error in half." },
  { index: 5, name: "Flores, Isabella", response: "When we take larger samples, the Central Limit Theorem guarantees that the sampling distribution is approximately normal. The spread of this distribution is measured by standard error SE = σ/√n. Margin of error = z* × SE. So increasing n → decreasing SE → decreasing MOE. The practical implication is that researchers can get more precise estimates (narrower confidence intervals) by sampling more individuals, though with diminishing returns due to the square root." },
  { index: 6, name: "Garcia, Diego", response: "The CLT says sample means are normal for large n. Standard error is σ divided by √n so it gets smaller with more data. Margin of error depends on standard error so it also gets smaller. This means bigger samples are more accurate. To reduce margin of error by half you need 4x the sample size." },
  { index: 7, name: "Harris, Kayla", response: "Sample size affects margin of error through the Central Limit Theorem. Bigger samples have smaller standard errors because SE = σ/√n. The margin of error formula includes SE, so when SE decreases, MOE decreases too. That's why polls with more people are more reliable — they have tighter margins of error and narrower confidence intervals." },
  { index: 8, name: "Ibrahim, Fatima", response: "The Central Limit Theorem is about how sample means form a normal distribution. When you have a large sample, your estimate of the mean is better because the standard error (σ/√n) is smaller. This connects to margin of error since MOE uses SE in its calculation. Larger n means smaller MOE which means more confidence in results." },
  { index: 9, name: "Johnson, Devin", response: "The CLT explains that with large enough samples, the sampling distribution of the mean is approximately normal regardless of the underlying population shape. Standard error = σ/√n decreases as n increases. Margin of error = z* × (σ/√n) also decreases. The key insight is the inverse square root relationship — doubling n only reduces MOE by about 29% (factor of 1/√2). This has practical implications for survey design: there are diminishing returns to increasing sample size, which is why most surveys find an optimal n that balances cost and precision." },
  { index: 10, name: "Kim, Sarah", response: "The Central Limit Theorem states that sample means will be normally distributed. With larger samples, the standard error gets smaller since SE equals sigma over root n. This matters because the margin of error includes the standard error in its formula. When SE is smaller, the margin of error is smaller too, giving more precise results. This is why sample size matters in statistics." },
  { index: 11, name: "Lopez, Miguel", response: "Bigger samples = smaller margin of error. The CLT proves this because the standard error σ/√n gets smaller when n increases. Since MOE = z × SE, the margin of error decreases with larger n. A sample of 1000 has a much smaller margin than a sample of 100." },
  { index: 12, name: "Martinez, Sofia", response: "The Central Limit Theorem is a fundamental concept that explains why larger samples produce more reliable estimates. As sample size increases, the sampling distribution of the mean becomes more tightly clustered around the true population mean. This happens because the standard error (σ/√n) decreases with n. Since margin of error is calculated as z* × SE, a smaller SE directly translates to a smaller margin of error. For practical applications like opinion polls, this means that increasing from 500 to 2000 respondents would cut the margin of error roughly in half (since √(2000/500) = 2)." },
  { index: 13, name: "Nguyen, Kevin", response: "According to the CLT, the distribution of sample means approaches normality as n increases. The standard error σ/√n quantifies the spread of this distribution. Margin of error is directly proportional to SE through the formula MOE = z* × SE. Therefore, increasing n reduces SE, which in turn reduces MOE. However, the relationship follows an inverse square root, meaning each doubling of n only gives about a 30% improvement in precision." },
  { index: 14, name: "O'Brien, Patrick", response: "The Central Limit Theorem says that means from samples are normally distributed when n is big. Standard error goes down when n goes up because of the √n in the denominator. Margin of error also goes down because it depends on standard error. That's basically how sample size affects precision in statistics." },
  { index: 15, name: "Patel, Priya", response: "Sample size and margin of error are inversely related through the CLT framework. The standard error SE = σ/√n establishes this mathematical relationship. As n increases, SE decreases proportionally to 1/√n. The margin of error (MOE = z_α/2 × SE) inherits this inverse square root relationship. Practically, to achieve a desired margin of error, we solve for n: n = (z × σ / E)². This formula is foundational in determining appropriate sample sizes for surveys, clinical trials, and quality control processes." },
  { index: 16, name: "Quinn, Aiden", response: "The CLT is important for understanding samples. When you take a bigger sample, you get closer to the real answer. This reduces the margin of error because there's less chance of being wrong. The formula involves dividing by the square root of n, which is why bigger n means less error." },
  { index: 17, name: "Rivera, Carmen", response: "Larger sample sizes lead to smaller margins of error because of the Central Limit Theorem. The theorem shows that SE = σ/√n, so as n grows, SE shrinks. Margin of error is calculated using SE, so it shrinks too. This is why opinion polls report margins like ±3% — they've chosen a sample size that produces that level of precision." },
  { index: 18, name: "Smith, Jordan", response: "The margin of error gets bigger when you have more samples because you have more data to be uncertain about. The Central Limit Theorem says things become normal with large samples. Standard error is σ times √n so it increases with more data." },
  { index: 19, name: "Thompson, Brianna", response: "The CLT tells us that the sampling distribution of x̄ is approximately N(μ, σ²/n) for large n. The standard error σ/√n decreases as n increases. Since MOE = z* × σ/√n, it follows that MOE decreases as well. The key mathematical insight is the 1/√n proportionality — margin of error is inversely proportional to the square root of sample size. This has an important practical consequence: there are diminishing returns to increasing n. Going from n=100 to n=400 halves the MOE, but getting another halving requires going to n=1600." },
  { index: 20, name: "Uribe, Daniel", response: "According to the Central Limit Theorem, the mean of a sufficiently large number of independent random variables will be approximately normally distributed. This means that as we increase our sample size n, the standard error (calculated as σ divided by √n) decreases. Because margin of error is found by multiplying the critical value z* by the standard error, a decrease in SE directly causes a decrease in MOE. In practice this means that for a 95% confidence level, a sample of about 1,000 yields a margin of error around ±3%." },
  { index: 21, name: "Vargas, Elena", response: "Sample size matters because of the Central Limit Theorem. Bigger samples have smaller standard errors (SE = σ/√n) and therefore smaller margins of error. The inverse square root relationship means you get diminishing returns — each additional participant helps less than the previous one." },
  { index: 22, name: "Washington, Malik", response: "The CLT states sample means are normally distributed. Standard error = σ/√n. Margin of error = z × SE. Bigger n → smaller SE → smaller margin. Need 4x n to halve the margin. This is the foundation of sample size calculations in survey research." },
  { index: 23, name: "Xu, Michelle", response: "The Central Limit Theorem says that when you collect samples, the average of those samples forms a bell curve. With more data points, this curve gets narrower because the standard error decreases. Standard error is σ/√n. The margin of error depends on standard error, so it also narrows. This explains why larger studies produce more precise estimates — their confidence intervals are tighter." },
  { index: 24, name: "Young, Caleb", response: "I think the Central Limit Theorem has something to do with normal distributions and large samples. Margin of error probably goes down with more data because you have more information. Statistics uses this for surveys and polls." },
  { index: 25, name: "Zhang, Amy", response: "The relationship between sample size and margin of error is mediated by the standard error, as described by the CLT. SE = σ/√n captures how the spread of the sampling distribution shrinks with larger n. Since MOE = z* × SE, the margin of error inherits this inverse square root decay. For researchers, this means: (1) larger samples always improve precision, but (2) the improvement has diminishing marginal returns, and (3) the required sample size scales quadratically with desired precision improvements. A practical rule: to estimate a proportion within ±3% at 95% confidence, you need about n ≈ 1,068 regardless of population size (for large populations)." },
  { index: 26, name: "Adams, Hailey", response: "The CLT shows that sample means have a normal distribution. The standard error gets smaller with larger n. Margin of error uses standard error so it also gets smaller. This is why we prefer large samples in research — they give us more accurate estimates of what we're trying to measure." },
  { index: 27, name: "Bennett, Chase", response: "" },
  { index: 28, name: "Cooper, Maya", response: "Central Limit Theorem. Margin of error. Sample size. These are related. More samples is better for accuracy." },
  { index: 29, name: "Diaz, Roberto", response: "The Central Limit Theorem is probably the most important theorem in statistics. It says that no matter what the population looks like — skewed, bimodal, uniform — the distribution of sample means will be approximately normal if n is large enough (usually n ≥ 30). The standard error SE = σ/√n measures the typical distance between a sample mean and the population mean. Since margin of error equals z* × SE, increasing n shrinks SE which shrinks MOE. This means we get narrower confidence intervals and more precise estimates. For example, in medical trials, this principle guides how many patients are needed to detect a treatment effect with acceptable precision." },
  { index: 30, name: "Foster, Grace", response: "The CLT says the sampling distribution of the mean is normal for large n. SE = σ/√n decreases as n grows. MOE = z* × SE, so larger samples produce smaller margins of error. The 4x rule applies: to halve MOE you need 4 times the sample size. In practice, surveys use n around 1000 for reasonable precision." },
  { index: 31, name: "Green, Xavier", response: "According to the Central Limit Theorem, when you repeatedly sample from any population, the means of those samples will form a normal distribution centered on the true population mean. The standard error SE = σ/√n tells us how spread out those sample means are. Because margin of error is MOE = z* × SE, increasing n reduces SE and therefore MOE. The inverse square root relationship creates diminishing returns — doubling n only improves precision by about 29%." },
  { index: 32, name: "Hall, Jasmine", response: "The Central Limit Theorem is important because it lets us use normal distribution calculations even when the population isn't normal. Standard error equals sigma divided by root n. When sample size goes up, standard error goes down, and so does the margin of error since MOE uses SE." },
  { index: 33, name: "Ishikawa, Kenji", response: "The CLT establishes that x̄ ~ N(μ, σ²/n) for large n, regardless of the population distribution. This is foundational because SE = σ/√n quantifies sampling variability. The margin of error MOE = z_{α/2} × σ/√n inherits the 1/√n proportionality. For practical sample size determination: n = (z × σ/E)² where E is the desired margin. For example, a 95% CI with E = 0.03 for a proportion requires n ≈ (1.96)²(0.25)/(0.03)² ≈ 1068. The diminishing returns from the square root relationship mean that after n ≈ 2000, additional sampling yields minimal precision gains for most applications." },
  { index: 34, name: "Jackson, Morgan", response: "Sample size affects margin of error. Bigger samples are better because they give you more accurate results. The CLT is about normal distributions. I think the formula has a square root in it somewhere." },
  { index: 35, name: "Klein, Rebecca", response: "The Central Limit Theorem tells us that the distribution of sample means approaches normality as sample size increases. Standard error = σ/√n measures spread of the sampling distribution. Margin of error = z* × SE. So: bigger n → smaller SE → smaller MOE → more precise estimates. This is why most polls use about 1000-1500 people and report margins of ±3%. Quadrupling sample size halves the margin — the classic diminishing returns of the square root relationship." },
  { index: 36, name: "Lewis, Brandon", response: "The CLT relates to normal distributions and sampling. When you increase sample size, you decrease standard error because SE is sigma over square root of n. This makes the margin of error smaller too since MOE depends on SE. So researchers want large samples for better precision." },
  { index: 37, name: "Murphy, Aria", response: "The Central Limit Theorem says sample means follow a normal distribution as n gets large. The key formula is SE = σ/√n — standard error decreases with more data. Margin of error (MOE = z* × SE) therefore also decreases. Practically, this means polling with 400 people gives half the margin of error of polling with 100 people, since √(400/100) = 2." },
  { index: 38, name: "Nelson, Isaiah", response: "" },
  { index: 39, name: "Ortiz, Valentina", response: "CLT: sampling distribution of x̄ → Normal(μ, σ²/n) as n increases. SE = σ/√n decreases with larger samples. MOE = z* × SE inherits this inverse relationship. The practical consequence is diminishing returns — each additional unit of sample size buys progressively less precision improvement. To halve MOE, quadruple n. Most opinion polls target n ≈ 1000 for ±3% at 95% confidence. In clinical trials, power analysis uses these relationships to determine minimum sample sizes needed to detect treatment effects of specified magnitude." },
  { index: 40, name: "Parker, Zoe", response: "The CLT tells us that sample means are normally distributed for large n. Standard error SE = σ/√n decreases as sample size grows. Since MOE = z* × SE, larger samples give smaller margins of error. The practical takeaway is that you get diminishing returns — doubling sample size only reduces MOE by about 29%. Most researchers find an optimal n that balances precision with cost." },
  { index: 41, name: "Ramirez, Lucas", response: "Larger samples reduce margin of error. This is because of the Central Limit Theorem. The standard error formula has n in the denominator under a square root, so bigger n means smaller SE and therefore smaller MOE." },
  { index: 42, name: "Scott, Natalie", response: "The Central Limit Theorem is a cornerstone of inferential statistics. It guarantees that x̄ ~ N(μ, σ²/n) for sufficiently large n, enabling the use of z-based confidence intervals. SE = σ/√n captures sampling variability. MOE = z* × SE = z* × σ/√n shows the direct mathematical chain. The inverse square root relationship means precision improvements follow the law of diminishing returns. For example, reducing MOE from ±4% to ±2% requires quadrupling n (e.g., 600 to 2400). This cost-precision tradeoff is central to experimental design in fields from epidemiology to market research." },
  { index: 43, name: "Turner, Blake", response: "Sample size and margin of error. The CLT says means are normal. Standard error is sigma over root n. Margin of error uses standard error. More samples means less error." },
  { index: 44, name: "Underwood, Mia", response: "The Central Limit Theorem explains why the sampling distribution of x̄ approaches normality as n increases. This is important because it allows us to calculate SE = σ/√n which gets smaller with more data. Margin of error (MOE = z* × SE) then decreases proportionally. However, the square root in the denominator means diminishing returns — to halve MOE you need 4× the sample size. A practical example: political polls with n = 1000 achieve about ±3% MOE at 95% confidence." },
  { index: 45, name: "Valdez, Christian", response: "The CLT says sample means form a bell curve. SE = σ/√n. When n goes up, SE goes down. MOE = z × SE, so MOE goes down too. This is why bigger samples are better in statistics." },
  { index: 46, name: "Williams, Hannah", response: "Understanding the relationship between sample size and margin of error requires the Central Limit Theorem. The CLT states that regardless of population shape, the distribution of sample means becomes approximately normal for large n. Standard error SE = σ/√n measures the spread of this distribution. Margin of error MOE = z* × SE inherits the 1/√n relationship. This creates a tradeoff: each increase in sample size yields less additional precision. Going from n=100 to n=400 halves MOE, but from n=400 to n=1600 is needed for another halving." },
  { index: 47, name: "Yang, Eric", response: "" },
  { index: 48, name: "Zimmerman, Ava", response: "The CLT is about normal distributions and large samples. I think margin of error gets smaller when you have more data. Standard error has something to do with the square root of n." },
  { index: 49, name: "Baker, Dominic", response: "According to the CLT, as n increases the sampling distribution of the mean approaches N(μ, σ²/n). The standard error σ/√n decreases with larger n, and since MOE = z* × σ/√n, margin of error follows suit. Practically speaking, the square root relationship means quadrupling sample size only halves the margin. Survey designers use this to calculate required n: for ±3% at 95% confidence with p=0.5, you need about n = (1.96)²(0.25)/(0.03)² ≈ 1068." },
  { index: 50, name: "Campbell, Olivia", response: "The Central Limit Theorem is fundamental to understanding sampling. It tells us that sample means tend toward a normal distribution. The standard error formula SE = σ/√n shows that larger samples have less variability. Since margin of error depends on standard error through MOE = z* × SE, bigger samples produce smaller margins. In real applications like quality control, this helps determine how many items to inspect." },
  { index: 51, name: "Dawson, Ryan", response: "Margin of error decreases with sample size. CLT makes means normal. SE = σ/√n. MOE = z × SE. That's the relationship." },
  { index: 52, name: "Ellis, Samantha", response: "The CLT guarantees approximate normality of x̄ for large n. Standard error SE = σ/√n is the key link — it decreases as n grows because of the square root in the denominator. MOE = z* × SE directly inherits this decrease. The practical implication is an inverse square root relationship between n and precision: doubling n gives only about 29% improvement in MOE. For researchers, this means there's an optimal sample size beyond which additional data collection has minimal benefit relative to cost." },
  { index: 53, name: "Fisher, Trent", response: "I know the Central Limit Theorem is important in statistics. Bigger samples should give better results. The margin of error probably gets smaller because you have more information to work with." },
  { index: 54, name: "Graham, Leah", response: "The Central Limit Theorem states that the sampling distribution of x̄ becomes normal as sample size increases. SE = σ/√n measures variability of sample means. MOE = z* × SE connects to confidence intervals. When n increases, SE decreases, leading to smaller MOE and narrower intervals. The 4x rule illustrates diminishing returns: halving MOE requires 4× the sample size." },
  { index: 55, name: "Howard, Mason", response: "Sample size affects accuracy. The CLT says things are normal with large samples. Standard error decreases with more data. Margin of error also decreases. Surveys use this to decide how many people to ask." },
  { index: 56, name: "Ingram, Chloe", response: "The CLT establishes normality of x̄ for large n. SE = σ/√n. MOE = z* × SE. The chain is: ↑n → ↓SE → ↓MOE. Diminishing returns due to √n. The formula n = (z*σ/E)² determines required sample size for a target margin E. For proportions near p = 0.5 with 95% confidence and ±3% margin, n ≈ 1068. This principle guides polling methodology, clinical trial enrollment, and A/B testing in tech." },
  { index: 57, name: "Jensen, Kyle", response: "The Central Limit Theorem connects sample size to margin of error. With larger samples, the standard error σ/√n gets smaller, which makes the margin of error smaller since MOE = z* × SE. This is why we trust large studies more than small ones. The relationship has diminishing returns because of the square root." },
  { index: 58, name: "King, Sophia", response: "CLT: x̄ → Normal as n grows. SE = σ/√n shrinks. MOE = z* × SE shrinks too. Need 4n to halve MOE. Polls use ~1000 for ±3%. Diminishing returns from √n." },
  { index: 59, name: "Lambert, Noah", response: "I think the Central Limit Theorem says something about sample means being normal. Margin of error is related to sample size somehow. Bigger is probably better." },
];

// ── Rubric (matches demo-grading-page.html) ──
const rubric = {
  maxScore: '10',
  essayPrompt: `Explain how the Central Limit Theorem (CLT) relates sample size to the margin of error. In your response:
- State what the CLT says about the sampling distribution of the sample mean
- Explain the formula for standard error and how it depends on sample size
- Connect standard error to the margin of error formula
- Describe the practical implications of this relationship for researchers`,
  checklistItems: [
    { category: "CLT Statement", points: "2", items: ["States sampling distribution of x̄ approaches normality", "Mentions condition: sufficiently large n"] },
    { category: "Standard Error", points: "3", items: ["Provides formula SE = σ/√n", "Explains SE decreases as n increases"] },
    { category: "Margin of Error Connection", points: "3", items: ["Provides MOE formula: MOE = z* × SE", "Explains MOE decreases as SE decreases"] },
    { category: "Practical Implications", points: "2", items: ["Discusses inverse square root relationship or diminishing returns", "Provides concrete example or application"] },
  ],
  rubricItems: [
    { category: "CLT Statement (2 pts)", items: ["Full (2): Clearly states sampling distribution of x̄ approaches normal distribution as n increases", "Partial (1): Mentions normality or CLT but vague or incomplete", "Missing (0): No mention of what CLT states"] },
    { category: "Standard Error (3 pts)", items: ["Full (3): Correct formula SE = σ/√n AND explains SE decreases with n", "Partial (2): Formula OR explanation but not both", "Minimal (1): Mentions SE without formula or clear explanation", "Missing (0): No discussion of standard error"] },
    { category: "MOE Connection (3 pts)", items: ["Full (3): Correct MOE formula AND clear logical chain: ↑n → ↓SE → ↓MOE", "Partial (2): Shows connection but incomplete formula or chain", "Minimal (1): States MOE decreases with n but no mechanism", "Missing (0): No connection made"] },
    { category: "Practical Implications (2 pts)", items: ["Full (2): Discusses diminishing returns / inverse √n AND gives example", "Partial (1): Mentions one practical aspect", "Missing (0): No practical discussion"] },
  ],
  modelText: `The Central Limit Theorem states that the sampling distribution of the sample mean x̄ approaches a normal distribution N(μ, σ²/n) as the sample size n increases, regardless of the shape of the underlying population distribution. The standard error SE = σ/√n quantifies the spread of this sampling distribution and decreases as n increases. Since the margin of error is calculated as MOE = z* × SE = z* × σ/√n, an increase in sample size directly reduces the margin of error. This relationship follows an inverse square root pattern — to halve the margin of error, the sample size must be quadrupled. For researchers, this means there are diminishing returns to increasing sample size: going from n=100 to n=400 halves the MOE, but achieving another halving requires n=1,600. National polls typically use n ≈ 1,000–1,500 as a practical balance between cost and a margin of error around ±3% at the 95% confidence level.`,
};

// ── Main ──
async function main() {
  const fs = await import('fs');

  // Get handshake token
  console.log('Fetching handshake token...');
  const hsRes = await fetch(`${SERVER_URL}/api/handshake`);
  if (!hsRes.ok) throw new Error(`Handshake failed: ${hsRes.status}`);
  const { token } = await hsRes.json();
  console.log(`Token: ${token.slice(0, 8)}...`);

  // Slice students to requested count
  const testStudents = students.slice(0, STUDENT_COUNT);

  // Call /api/grade SSE endpoint
  console.log(`\nSending ${testStudents.length} students to /api/grade (model=${MODEL}, strategy=${STRATEGY}, chunkSize=${CHUNK_SIZE}, sweep=${SWEEP_MODE})...`);
  const startTime = Date.now();

  const res = await fetch(`${SERVER_URL}/api/grade`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      provider: 'github-models',
      model: MODEL,
      rubric,
      students: testStudents,
      strategy: STRATEGY,
      chunkSize: CHUNK_SIZE,
      sweep: SWEEP_MODE,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`/api/grade failed (${res.status}): ${text}`);
  }

  // Parse SSE stream
  const allChunkResults = [];
  const outlierAdjustments = [];
  let doneData = null;
  const events = [];

  const text = await res.text();
  const lines = text.split('\n');
  let currentEvent = null;
  let currentData = '';

  for (const line of lines) {
    if (line.startsWith('event: ')) {
      currentEvent = line.slice(7).trim();
    } else if (line.startsWith('data: ')) {
      currentData = line.slice(6);
    } else if (line.trim() === '' && currentEvent && currentData) {
      // End of SSE message
      try {
        const parsed = JSON.parse(currentData);
        events.push({ event: currentEvent, data: parsed });

        if (currentEvent === 'progress') {
          console.log(`  [progress] phase=${parsed.phase} ${parsed.chunkIndex !== undefined ? `chunk ${parsed.chunkIndex + 1}/${parsed.totalChunks}` : ''} ${parsed.outlierCount !== undefined ? `outliers=${parsed.outlierCount}` : ''}`);
        } else if (currentEvent === 'chunk') {
          console.log(`  [chunk ${parsed.chunkIndex}] ${parsed.results.length} results`);
          allChunkResults.push(...parsed.results);
        } else if (currentEvent === 'sweep') {
          console.log(`  [sweep] ${parsed.count} consistency adjustment(s)`);
        } else if (currentEvent === 'outlier') {
          console.log(`  [outlier] ${parsed.adjustedResults.length} adjustments`);
          outlierAdjustments.push(...parsed.adjustedResults);
        } else if (currentEvent === 'done') {
          doneData = parsed;
          console.log(`  [done] mean=${parsed.stats.mean.toFixed(2)}, stdDev=${parsed.stats.stdDev.toFixed(2)}, outliers=${parsed.stats.outliers}, adjusted=${parsed.stats.adjusted}`);
        } else if (currentEvent === 'error') {
          console.error(`  [error] ${parsed.message}`);
        }
      } catch (e) {
        console.warn(`  Failed to parse SSE data: ${currentData.slice(0, 100)}`);
      }
      currentEvent = null;
      currentData = '';
    }
  }

  const elapsed = (Date.now() - startTime) / 1000;

  // Apply outlier adjustments to results
  for (const adj of outlierAdjustments) {
    const r = allChunkResults.find(r => r.studentIndex === adj.studentIndex);
    if (r) {
      r.score = adj.score;
      r.feedback = adj.feedback || r.feedback;
      r.adjusted = true;
    }
  }

  // Sort by student index
  allChunkResults.sort((a, b) => a.studentIndex - b.studentIndex);

  // Build output
  const output = {
    timestamp: new Date().toISOString(),
    strategy: STRATEGY,
    sweep: SWEEP_MODE,
    provider: 'github-models',
    model: MODEL,
    chunkSize: CHUNK_SIZE,
    studentCount: testStudents.length,
    elapsedSeconds: elapsed,
    serverElapsedSeconds: doneData?.metadata?.elapsedSeconds || null,
    stats: doneData?.stats || null,
    anchors: doneData?.anchors || null,
    results: allChunkResults.map(r => {
      const student = testStudents.find(s => s.index === r.studentIndex);
      return {
        index: r.studentIndex,
        name: student?.name || `Student ${r.studentIndex}`,
        score: r.score,
        feedback: r.feedback,
        adjusted: r.adjusted || false,
      };
    }),
  };

  // Print summary table
  console.log(`\n${'='.repeat(60)}`);
  console.log(`${STRATEGY.toUpperCase()} | ${MODEL} | chunk=${CHUNK_SIZE} | sweep=${SWEEP_MODE} | ${testStudents.length} students — ${elapsed.toFixed(1)}s`);
  console.log(`${'='.repeat(60)}`);
  console.log(`${'Student'.padEnd(25)} ${'Score'.padStart(8)} ${' Adjusted'}`);
  console.log(`${'-'.repeat(25)} ${'-'.repeat(8)} ${'-'.repeat(9)}`);
  for (const r of output.results) {
    const scoreStr = Number.isInteger(r.score) ? `${r.score}/10` : `${r.score.toFixed(1)}/10`;
    console.log(`${r.name.padEnd(25)} ${scoreStr.padStart(8)} ${r.adjusted ? '  YES' : ''}`);
  }
  console.log(`${'-'.repeat(42)}`);
  console.log(`Mean: ${output.stats?.mean?.toFixed(2) || 'N/A'} | StdDev: ${output.stats?.stdDev?.toFixed(2) || 'N/A'} | Outliers: ${output.stats?.outliers || 0} | Adjusted: ${output.stats?.adjusted || 0}`);

  // Save
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.log(`\nResults saved to ${OUTPUT_FILE}`);
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
