/**
 * Wave 0.2 Spike: eval_webview_script Integration Tests
 * 
 * Tests the message-passing eval bridge for JavaScript execution with return values.
 * 
 * ⚠️ PREREQUISITES:
 * - App must be running in dev mode (`npm run tauri:dev`)
 * - Embedded browser must be open and navigated to a test page
 * - Tests are INTEGRATION tests (not unit tests with mocks)
 * 
 * Run these tests manually from the Tauri app console or via manual verification.
 * These are NOT part of the automated test suite.
 */

import { describe, it, expect } from 'vitest';
import { evalScript, evalScriptJSON } from './browser';

describe('evalScript - Basic Return Values', () => {
  it('Test 1: Simple number return', async () => {
    const result = await evalScript(`42`);
    expect(result).toBe('42');
  });

  it('Test 2: String return', async () => {
    const result = await evalScript(`"hello world"`);
    expect(result).toBe('"hello world"');
  });

  it('Test 3: Boolean return', async () => {
    const result = await evalScript(`true`);
    expect(result).toBe('true');
  });

  it('Test 4: Null return', async () => {
    const result = await evalScript(`null`);
    expect(result).toBe('null');
  });
});

describe('evalScriptJSON - Complex Objects', () => {
  it('Test 5: Object return', async () => {
    const result = await evalScriptJSON<{ name: string; age: number }>(`({ name: "John", age: 30 })`);
    expect(result).toEqual({ name: "John", age: 30 });
  });

  it('Test 6: Array return', async () => {
    const result = await evalScriptJSON<number[]>(`[1, 2, 3, 4, 5]`);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual([1, 2, 3, 4, 5]);
  });

  it('Test 7: Nested object return', async () => {
    const result = await evalScriptJSON<any>(`({
      student: { id: "123", name: "Alice" },
      scores: [85, 92, 78],
      metadata: { graded: true }
    })`);
    expect(result.student.name).toBe("Alice");
    expect(result.scores.length).toBe(3);
    expect(result.metadata.graded).toBe(true);
  });
});

describe('evalScript - DOM Queries', () => {
  it('Test 8: Extract page title', async () => {
    const result = await evalScript(`document.title`);
    expect(typeof result).toBe('string');
    console.log('✓ Page title:', result);
  });

  it('Test 9: Extract page URL', async () => {
    const result = await evalScript(`window.location.href`);
    expect(typeof result).toBe('string');
    expect(result).toMatch(/^https?:\/\//);
    console.log('✓ Page URL:', result);
  });

  it('Test 10: Query DOM element', async () => {
    const result = await evalScript(`document.body.tagName`);
    expect(result).toBe('"BODY"');
    console.log('✓ Body tag:', result);
  });
});

describe('evalScriptJSON - DOM Extraction', () => {
  it('Test 11: Count elements on page', async () => {
    const counts = await evalScriptJSON<{ divs: number; inputs: number; links: number }>(`({
      divs: document.querySelectorAll('div').length,
      inputs: document.querySelectorAll('input').length,
      links: document.querySelectorAll('a').length
    })`);
    
    expect(typeof counts.divs).toBe('number');
    expect(typeof counts.inputs).toBe('number');
    expect(typeof counts.links).toBe('number');
    console.log('✓ Element counts:', counts);
  });
});

describe('evalScript - Error Handling', () => {
  it('Test 12: Throw error', async () => {
    await expect(
      evalScript(`throw new Error("Test error")`)
    ).rejects.toThrow();
    console.log('✓ Error thrown correctly');
  });

  it('Test 13: Reference error', async () => {
    await expect(
      evalScript(`nonExistentVariable`)
    ).rejects.toThrow();
    console.log('✓ Reference error caught');
  });
});

describe('evalScript - Async Operations', () => {
  it('Test 14: Promise resolution', async () => {
    const result = await evalScript(`Promise.resolve(42)`);
    expect(result).toBe('42');
    console.log('✓ Promise resolved');
  });

  it('Test 15: Async function with delay', async () => {
    const result = await evalScriptJSON<{ delayed: string }>(`
      (async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return { delayed: "success" };
      })()
    `);
    expect(result.delayed).toBe("success");
    console.log('✓ Async function completed');
  });

  it('Test 16: Timeout handling (10s)', { timeout: 15000 }, async () => {
    // This should timeout after 10s
    await expect(
      evalScript(`new Promise(() => {})`) // Never resolves
    ).rejects.toThrow(/[Tt]imeout/);
    console.log('✓ Timeout handled correctly');
  });
});

describe('evalScript - Performance', () => {
  it('Test 17: Latency measurement (100 iterations)', async () => {
    const iterations = 100;
    const latencies: number[] = [];
    
    console.log(`Running ${iterations} iterations for latency measurement...`);
    
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await evalScript(`42`);
      const duration = performance.now() - start;
      latencies.push(duration);
    }
    
    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const sortedLatencies = [...latencies].sort((a, b) => a - b);
    const p50Latency = sortedLatencies[Math.floor(iterations * 0.50)];
    const p95Latency = sortedLatencies[Math.floor(iterations * 0.95)];
    const p99Latency = sortedLatencies[Math.floor(iterations * 0.99)];
    const minLatency = Math.min(...latencies);
    const maxLatency = Math.max(...latencies);
    
    console.log('\n📊 Performance Metrics:');
    console.log(`  Iterations: ${iterations}`);
    console.log(`  Average:    ${avgLatency.toFixed(2)}ms`);
    console.log(`  Median:     ${p50Latency.toFixed(2)}ms`);
    console.log(`  P95:        ${p95Latency.toFixed(2)}ms`);
    console.log(`  P99:        ${p99Latency.toFixed(2)}ms`);
    console.log(`  Min:        ${minLatency.toFixed(2)}ms`);
    console.log(`  Max:        ${maxLatency.toFixed(2)}ms`);
    console.log('');
    
    // Success criteria: avg < 50ms, P99 < 100ms
    console.log('🎯 Success Criteria:');
    console.log(`  Average < 50ms:  ${avgLatency < 50 ? '✅ PASS' : '❌ FAIL'} (${avgLatency.toFixed(2)}ms)`);
    console.log(`  P99 < 100ms:     ${p99Latency < 100 ? '✅ PASS' : '❌ FAIL'} (${p99Latency.toFixed(2)}ms)`);
    console.log('');
    
    expect(avgLatency).toBeLessThan(50);
    expect(p99Latency).toBeLessThan(100);
  }, { timeout: 30000 });

  it('Test 18: Parallel execution (10 concurrent calls)', async () => {
    const start = performance.now();
    
    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(evalScript(`${i}`));
    }
    
    const results = await Promise.all(promises);
    const duration = performance.now() - start;
    
    expect(results.length).toBe(10);
    results.forEach((result, i) => {
      expect(result).toBe(String(i));
    });
    
    console.log('');
    console.log('⚡ Parallel Execution:');
    console.log(`  Concurrent calls: 10`);
    console.log(`  Total time:       ${duration.toFixed(2)}ms`);
    console.log(`  Avg per call:     ${(duration / 10).toFixed(2)}ms`);
    console.log('  ✅ All calls completed successfully');
    console.log('');
  });
});

describe('evalScript - Stress Test', () => {
  it('Test 19: 200+ sequential calls (memory leak check)', async () => {
    const iterations = 250;
    let failures = 0;
    
    console.log(`Running ${iterations} sequential calls...`);
    
    for (let i = 0; i < iterations; i++) {
      try {
        const result = await evalScript(`${i}`);
        expect(result).toBe(String(i));
        
        if (i % 50 === 0 && i > 0) {
          console.log(`  Progress: ${i}/${iterations} calls completed`);
        }
      } catch (error) {
        failures++;
        console.error(`  ❌ Call ${i} failed:`, error);
      }
    }
    
    console.log('');
    console.log('🔬 Stress Test Results:');
    console.log(`  Total calls:  ${iterations}`);
    console.log(`  Successful:   ${iterations - failures}`);
    console.log(`  Failed:       ${failures}`);
    console.log(`  Success rate: ${((iterations - failures) / iterations * 100).toFixed(2)}%`);
    console.log('');
    
    expect(failures).toBe(0);
  }, { timeout: 60000 });

  it('Test 20: Large payload return (serialization limit check)', async () => {
    // Create a large array (30 students × 10 fields)
    const result = await evalScriptJSON<Array<any>>(`
      Array.from({ length: 30 }, (_, i) => ({
        id: String(i + 1),
        name: 'Student ' + (i + 1),
        email: 'student' + (i + 1) + '@example.com',
        score1: Math.floor(Math.random() * 100),
        score2: Math.floor(Math.random() * 100),
        score3: Math.floor(Math.random() * 100),
        feedback1: 'Feedback text for question 1 with multiple sentences. This demonstrates realistic feedback length that a teacher might write.',
        feedback2: 'Feedback text for question 2 with multiple sentences. This demonstrates realistic feedback length that a teacher might write.',
        feedback3: 'Feedback text for question 3 with multiple sentences. This demonstrates realistic feedback length that a teacher might write.',
        notes: 'Additional notes and comments about student performance, including recommendations for improvement.'
      }))
    `);
    
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(30);
    
    const payloadSize = JSON.stringify(result).length;
    console.log('');
    console.log('📦 Large Payload Test:');
    console.log(`  Records:      30 students`);
    console.log(`  Payload size: ${(payloadSize / 1024).toFixed(2)} KB`);
    console.log(`  ✅ Serialization successful`);
    console.log('');
  });
});
