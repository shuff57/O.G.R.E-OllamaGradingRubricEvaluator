// Generator for mock MyOpenMath page with 30 students
import fs from 'fs';

const names = [
  'Alice Anderson', 'Brian Baker', 'Carol Chen', 'David Davis', 'Emma Edwards',
  'Frank Foster', 'Grace Garcia', 'Henry Harris', 'Iris Ibrahim', 'Jack Johnson',
  'Karen Kim', 'Liam Lopez', 'Maria Martinez', 'Nathan Nelson', "Olivia O'Connor",
  'Peter Parker', 'Quinn Ramirez', 'Rachel Rodriguez', 'Sam Smith', 'Tina Taylor',
  'Uma Patel', 'Victor Valdez', 'Wendy Williams', 'Xavier Xiong', 'Yara Young',
  'Zach Zhang', 'Amy Adams', 'Ben Brown', 'Chloe Clark', 'Dylan Diaz'
];

const responses = [
  'The Central Limit Theorem states that as sample size n increases, the sampling distribution of the mean approaches normality with standard error σ/√n. This directly affects margin of error because MOE = z* × SE. When we increase n, the denominator √n gets larger, making SE smaller. Since margin of error is proportional to SE, it also decreases. For example, to cut the margin in half, we need to quadruple the sample size (because √4 = 2). This inverse square root relationship is fundamental to survey design.',
  'Larger sample sizes reduce the margin of error. The Central Limit Theorem shows that the standard error equals σ/√n, so when n increases, SE decreases. Margin of error depends on standard error (MOE = critical value × SE), so smaller SE means smaller margin. That\'s why statisticians prefer large samples - they get more accurate estimates of population parameters.',
  'Sample size affects margin of error through the Central Limit Theorem. When you have a bigger sample, your estimates are more accurate because the standard error gets smaller. The formula for standard error has √n in the denominator, so larger n makes it smaller. This makes the margin of error smaller too.',
  'Bigger samples mean smaller margin of error. The CLT says that sample means are normally distributed, and the spread of this distribution (standard error) decreases as sample size increases. Since margin of error uses standard error in its calculation, when SE goes down, margin goes down too.',
  'The Central Limit Theorem explains that larger samples give better estimates. When you increase sample size, the margin of error decreases because there\'s less variability in your sample mean. This is why researchers try to get large samples - to reduce the margin of error.',
  'According to the Central Limit Theorem, when we increase the sample size n, the standard error decreases by a factor of 1/√n. This reduction in standard error directly translates to a smaller margin of error, which is calculated as the critical value times the standard error. The relationship is inverse and proportional to the square root.',
  'Larger samples reduce margin of error. When you have more data points, your average is closer to the true population mean. The Central Limit Theorem says sample means follow a normal distribution, and bigger samples have less spread.',
  'Sample size is inversely related to margin of error through the standard error formula SE = σ/√n. As n increases, SE decreases, and since MOE = z × SE, the margin also decreases. The CLT guarantees this relationship holds for large samples.',
  'The Central Limit Theorem shows that sampling distributions become more concentrated around the true mean as sample size increases. This means the standard error σ/√n gets smaller with larger n. Because margin of error is a multiple of standard error, it also shrinks when we increase sample size.',
  'When sample size goes up, margin of error goes down. This happens because the CLT tells us that standard error = σ/√n, and this appears in the margin of error formula. More data means more precision.',
  'Bigger samples lead to smaller margins of error due to the Central Limit Theorem. The theorem states that the distribution of sample means has a standard deviation of σ/√n, which decreases as n increases. Since margin of error incorporates this standard error, it too decreases with larger samples.',
  'The relationship between sample size and margin of error is inverse. According to CLT, as we collect more data, the standard error shrinks proportionally to 1/√n. This makes our confidence intervals narrower and our estimates more precise.',
  'Sample size directly impacts the precision of our estimates through the standard error. The CLT shows that SE = σ/√n, meaning larger samples produce smaller standard errors. The margin of error, being a function of SE, therefore also decreases with increased sample size.',
  'As explained by the Central Limit Theorem, increasing the sample size reduces variability in the sampling distribution. Specifically, the standard error decreases as 1/√n. This reduction in standard error causes the margin of error to shrink, giving us more confident estimates.',
  'Larger samples mean smaller margin of error. The Central Limit Theorem proves that sample means are normally distributed with standard error that depends on n. When n is larger, the standard error is smaller, so the margin is smaller too.',
  'Sample size affects margin of error because of how standard error works. The CLT says standard error = σ/√n, so bigger n makes smaller standard error. Margin of error uses standard error, so it gets smaller too when you have more data.',
  'The Central Limit Theorem tells us that as sample size increases, the sampling distribution becomes tighter around the population mean. The standard error formula σ/√n shows this mathematically - larger n in the denominator means smaller SE, which directly reduces the margin of error.',
  'Increasing sample size decreases margin of error due to the inverse square root relationship in the standard error formula. The CLT establishes that SE = σ/√n, and since MOE = critical value × SE, larger samples produce narrower margins.',
  'According to CLT, larger samples have smaller standard errors because of the √n term in the denominator. This makes the margin of error smaller since MOE depends on SE. That\'s why bigger studies are more precise.',
  'Sample size and margin of error have an inverse relationship. The Central Limit Theorem shows that standard error decreases with sample size (SE = σ/√n), and because margin of error is calculated using standard error, it also decreases when we increase n.',
  'The Central Limit Theorem demonstrates that the spread of the sampling distribution narrows as sample size grows. Mathematically, SE = σ/√n, so quadrupling the sample size cuts the standard error in half. Since MOE = z* × SE, this halves the margin of error too.',
  'Bigger samples reduce margin of error. The CLT says that the standard error equals σ divided by the square root of n. When n gets bigger, this fraction gets smaller, and since margin of error depends on standard error, the margin also gets smaller.',
  'When you increase sample size, the margin of error decreases. This is because the Central Limit Theorem tells us that standard error = σ/√n. Larger values of n in the denominator create smaller standard errors, which lead to smaller margins of error in our estimates.',
  'The CLT establishes that sampling distributions have standard error σ/√n. This inverse square root relationship means that to cut margin of error in half, you need four times as many samples. Larger n always produces smaller margins.',
  'Sample size impacts margin of error through the standard error component. As the CLT shows, SE = σ/√n decreases with larger samples. Since margin of error equals the critical value times SE, increasing n reduces the margin and improves precision.',
  'According to the Central Limit Theorem, the standard error of the sampling distribution is σ/√n. This means larger samples have proportionally smaller standard errors. Because margin of error is calculated as z* × (σ/√n), increasing the sample size directly reduces the margin.',
  'Larger sample sizes result in smaller margins of error because the CLT shows that standard error decreases with √n. The formula MOE = critical value × (σ/√n) makes this relationship explicit - more data means less uncertainty.',
  'The Central Limit Theorem explains that standard error = σ/√n, which decreases as sample size increases. Since margin of error is proportional to standard error, larger samples always produce narrower margins and more precise estimates.',
  'Sample size affects precision through the standard error term in the margin of error calculation. The CLT guarantees that SE = σ/√n, so doubling the sample size reduces standard error by a factor of √2, thereby reducing the margin of error.',
  'Increasing sample size decreases the margin of error because the CLT shows that larger samples have smaller standard errors (SE = σ/√n). This inverse relationship means more data always improves the precision of our statistical estimates.'
];

function generateStudentHTML(name, response, index) {
  const timestamp = 1708000000 + index + 1;
  const fbName = `fb-${index + 1}`;

  return `
        <!-- Student ${index + 1} -->
        <div data-lastchange="${timestamp}">
            <b>${name}</b>
            <div role="region" aria-label="Question 1">
                <p class="seqsep" role="heading">Part 1 of 2</p>
                <div>
                    <div>
                        <p><strong>Essay Question:</strong> Explain the relationship between sample size and margin of error in statistical inference. Use the Central Limit Theorem to support your explanation.</p>
                        <details>
                            <summary>Grading Checklist (Click to expand)</summary>
                            <div>
                                <table>
                                    <tr>
                                        <td><b>Understanding of Sample Size Effect (3 points)</b></td>
                                        <td>
                                            <label>✓ Explains that larger samples reduce margin of error</label><br>
                                            <label>✓ Mentions inverse relationship (as n increases, margin decreases)</label><br>
                                            <label>✓ Uses correct mathematical relationship (margin ∝ 1/√n)</label>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td><b>Central Limit Theorem Connection (4 points)</b></td>
                                        <td>
                                            <label>✓ States that CLT describes sampling distribution behavior</label><br>
                                            <label>✓ Explains that standard error decreases with sample size</label><br>
                                            <label>✓ Connects standard error to margin of error calculation</label>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td><b>Mathematical Precision (2 points)</b></td>
                                        <td>
                                            <label>✓ Uses correct notation (n, σ, standard error)</label><br>
                                            <label>✓ Shows formula or explains proportionality clearly</label>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td><b>Clear Communication (1 point)</b></td>
                                        <td>
                                            <label>✓ Response is organized and easy to follow</label><br>
                                            <label>✓ Uses appropriate statistical terminology</label>
                                        </td>
                                    </tr>
                                </table>
                            </div>
                        </details>
                    </div>
                    <div class="student-response">
                        ${response}
                    </div>
                    <span></span>
                </div>
                <p class="seqsep" role="heading">Part 2 of 2</p>
                <div>
                    <details>
                        <summary>Rubric Targets & Model Response (Click to expand)</summary>
                        <div>
                            <table>
                                <tr>
                                    <td><b>Key Concepts to Address</b></td>
                                    <td>
                                        <ul>
                                            <li>Sample size (n) affects precision of estimates</li>
                                            <li>Standard error = σ/√n</li>
                                            <li>Margin of error = (critical value) × (standard error)</li>
                                            <li>Larger n → smaller SE → smaller margin of error</li>
                                            <li>CLT ensures normal sampling distribution for large n</li>
                                        </ul>
                                    </td>
                                </tr>
                            </table>
                            <div class="model-response">
                                <strong>Model Response:</strong> As sample size increases, the margin of error decreases because the standard error of the mean becomes smaller. The Central Limit Theorem tells us that the sampling distribution of the mean approaches a normal distribution as n grows, with standard error σ/√n. Since margin of error is calculated as z* × (σ/√n), increasing n reduces the standard error and thus shrinks the margin of error. This inverse relationship (proportional to 1/√n) means we need to quadruple the sample size to cut the margin in half.
                            </div>
                        </div>
                    </details>
                </div>
            </div>
            <div class="scoredetails">
                <label>Score: <input type="text" aria-label="Score" value="" placeholder="0"> /10</label>
                <a href="#" class="fullcredlink" onclick="event.preventDefault(); this.parentElement.querySelector('input').value='10';">Full credit</a>
                <div>Feedback:</div>
                <div class="fbbox" role="textbox" aria-label="Feedback" contenteditable="true"></div>
                <input type="hidden" name="${fbName}" value="">
            </div>
        </div>
`;
}

const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Grade All Questions - Mock MyOpenMath Page (30 Students)</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 20px;
            background-color: #f5f5f5;
        }
        .header {
            background-color: #2c5aa0;
            color: white;
            padding: 15px;
            margin-bottom: 20px;
            position: sticky;
            top: 0;
            z-index: 100;
        }
        div[data-lastchange] {
            background: white;
            border: 1px solid #ccc;
            margin-bottom: 20px;
            padding: 15px;
            border-radius: 4px;
        }
        div[data-lastchange] > b {
            font-size: 16px;
            color: #2c5aa0;
            display: block;
            margin-bottom: 10px;
        }
        div[role="region"] {
            border: 1px solid #e0e0e0;
            padding: 10px;
            margin-top: 10px;
        }
        p.seqsep[role="heading"] {
            font-weight: bold;
            color: #555;
            margin: 10px 0;
            padding: 5px;
            background-color: #f0f0f0;
        }
        details {
            margin: 10px 0;
        }
        summary {
            cursor: pointer;
            color: #2c5aa0;
            font-weight: bold;
        }
        .student-response {
            background-color: #fffef0;
            border-left: 3px solid #ffd700;
            padding: 10px;
            margin: 10px 0;
            min-height: 40px;
            line-height: 1.6;
        }
        .scoredetails {
            margin-top: 15px;
            padding: 10px;
            background-color: #f9f9f9;
            border-top: 2px solid #ddd;
        }
        input[aria-label="Score"] {
            width: 60px;
            padding: 5px;
            font-size: 14px;
            border: 1px solid #ccc;
            border-radius: 3px;
        }
        .fullcredlink {
            margin-left: 10px;
            color: #2c5aa0;
            text-decoration: none;
            font-size: 12px;
        }
        .fullcredlink:hover {
            text-decoration: underline;
        }
        div.fbbox {
            border: 1px solid #ccc;
            padding: 10px;
            min-height: 60px;
            margin-top: 10px;
            background-color: white;
            cursor: text;
        }
        div.fbbox:focus {
            outline: 2px solid #2c5aa0;
            outline-offset: 2px;
        }
        div.fbbox:empty:before {
            content: "Enter feedback here...";
            color: #999;
        }
        table {
            width: 100%;
            margin: 10px 0;
        }
        tr {
            border-bottom: 1px solid #eee;
        }
        td {
            padding: 5px;
            vertical-align: top;
        }
        button {
            background-color: #2c5aa0;
            color: white;
            border: none;
            padding: 10px 20px;
            margin: 10px 5px;
            cursor: pointer;
            border-radius: 4px;
            font-size: 14px;
        }
        button:hover {
            background-color: #1e4070;
        }
        .save-buttons {
            position: sticky;
            bottom: 0;
            background-color: white;
            padding: 15px;
            border-top: 2px solid #2c5aa0;
            text-align: center;
            box-shadow: 0 -2px 10px rgba(0,0,0,0.1);
        }
        .model-response {
            background-color: #e8f4f8;
            border-left: 3px solid #2c5aa0;
            padding: 10px;
            margin: 10px 0;
            line-height: 1.6;
        }
        ul {
            margin: 5px 0;
            padding-left: 20px;
        }
        li {
            margin: 3px 0;
        }
    </style>
    <script>
        // Sync contenteditable feedback with hidden input (TinyMCE pattern)
        document.addEventListener('DOMContentLoaded', function() {
            document.querySelectorAll('div.fbbox').forEach(fbbox => {
                fbbox.addEventListener('input', function() {
                    const hidden = this.parentElement.querySelector('input[type="hidden"]');
                    if (hidden) {
                        hidden.value = this.innerHTML;
                    }
                });

                // Also handle paste events
                fbbox.addEventListener('paste', function(e) {
                    e.preventDefault();
                    const text = e.clipboardData.getData('text/plain');
                    document.execCommand('insertText', false, text);
                });
            });

            console.log('Mock MyOpenMath page loaded with 30 students');
            console.log('Ready for O.G.R.E automation testing');
        });
    </script>
</head>
<body>
    <div class="header">
        <h1>Grade All Questions - Statistics Essay (Mock Test Page)</h1>
        <p>Assignment: Statistical Inference - Sample Size and Margin of Error | 30 Students | Max Score: 10 points</p>
    </div>

    <form id="gradeForm" method="post" action="#">
${names.map((name, i) => generateStudentHTML(name, responses[i], i)).join('\n')}

        <div class="save-buttons">
            <button type="button" id="quickSave">Quick Save</button>
            <button type="submit">Save Changes</button>
        </div>
    </form>

    <script>
        // Quick Save button functionality
        document.getElementById('quickSave').addEventListener('click', function() {
            alert('Quick Save clicked! (This is a mock - no data is actually saved)');
            console.log('Quick Save - Current form data:', collectFormData());
        });

        document.getElementById('gradeForm').addEventListener('submit', function(e) {
            e.preventDefault();
            alert('Form submitted! (This is a mock - no data is actually sent)');
            console.log('Form Submit - Current form data:', collectFormData());
        });

        function collectFormData() {
            const students = Array.from(document.querySelectorAll('div[data-lastchange]'));
            return students.map((s, i) => ({
                name: s.querySelector('b').textContent,
                score: s.querySelector('input[aria-label="Score"]').value,
                feedback: s.querySelector('div.fbbox').innerHTML
            }));
        }
    </script>
</body>
</html>`;

// Write to root directory
fs.writeFileSync('./mock-myopenmath-30students.html', html, 'utf8');
console.log('✓ Generated mock-myopenmath-30students.html with 30 students in root directory');
