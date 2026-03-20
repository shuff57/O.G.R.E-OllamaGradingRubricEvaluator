import { readFile } from 'fs/promises';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';

export async function loadGoldStandard(path) {
  const content = await readFile(path, 'utf-8');
  const data = JSON.parse(content);
  
  return data.perStudent.map((student) => ({
    index: student.index,
    name: student.name,
    goldScore: student.mean,
    scores: student.scores,
    rationale: student.rationale,
  }));
}

export async function loadValidationJSONL(path) {
  const results = [];
  
  return new Promise((resolve, reject) => {
    const rl = createInterface({
      input: createReadStream(path),
      crlfDelay: Infinity,
    });

    rl.on('line', (line) => {
      try {
        const obj = JSON.parse(line);
        
        if (!obj.messages || !Array.isArray(obj.messages)) {
          console.warn('Skipping line: missing messages array');
          return;
        }

        const userMsg = obj.messages.find((m) => m.role === 'user');
        const assistantMsg = obj.messages.find((m) => m.role === 'assistant');

        if (!userMsg || !assistantMsg) {
          console.warn('Skipping line: missing user or assistant message');
          return;
        }

        let goldScore = null;
        try {
          const assistantContent = JSON.parse(assistantMsg.content);
          goldScore = assistantContent.score;
        } catch (e) {
          console.warn('Skipping line: could not parse assistant content as JSON');
          return;
        }

        if (goldScore === null || typeof goldScore !== 'number') {
          console.warn('Skipping line: invalid or missing score');
          return;
        }

        results.push({
          goldScore,
          rubricPrompt: userMsg.content,
          studentResponse: '',
        });
      } catch (e) {
        console.warn(`Skipping malformed JSON line: ${e.message}`);
      }
    });

    rl.on('close', () => {
      resolve(results);
    });

    rl.on('error', reject);
  });
}

export function identifyEdgeCases(goldData) {
  const lowEdge = [];
  const highEdge = [];

  goldData.forEach((student) => {
    if (student.goldScore <= 2) {
      lowEdge.push(student.index);
    }
    if (student.goldScore >= 9) {
      highEdge.push(student.index);
    }
  });

  return { lowEdge, highEdge };
}

export function groupByRubric(jsonlData) {
  const groups = {};

  jsonlData.forEach((sample) => {
    const prompt = sample.rubricPrompt.toLowerCase();
    
    let type = 'other';
    if (prompt.includes('chi-square') || prompt.includes('χ²')) {
      type = 'chi-square';
    } else if (prompt.includes('hypothesis') || prompt.includes('p-value')) {
      type = 'hypothesis';
    } else if (prompt.includes('regression') || prompt.includes('leverage') || prompt.includes('influential')) {
      type = 'regression';
    } else if (prompt.includes('probability') || prompt.includes('p(a)') || prompt.includes('independent')) {
      type = 'probability';
    }

    if (!groups[type]) {
      groups[type] = [];
    }
    groups[type].push(sample);
  });

  return groups;
}

export async function buildEvalDataset(goldPath, jsonlPath) {
  const goldData = await loadGoldStandard(goldPath);
  const jsonlData = await loadValidationJSONL(jsonlPath);
  const edgeCases = identifyEdgeCases(goldData);
  const rubricGroups = groupByRubric(jsonlData);

  return {
    goldData,
    jsonlData,
    edgeCases,
    rubricGroups,
  };
}
