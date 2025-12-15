// --- 1. Initialization & Storage ---
document.addEventListener('DOMContentLoaded', () => {
  // Configure MathLive fonts
  if (window.MathfieldElement) {
    MathfieldElement.fontsDirectory = 'lib/fonts';
  }

  // Load saved settings
  const apiUrl = localStorage.getItem('apiUrl');
  const apiKey = localStorage.getItem('apiKey');
  const modelName = localStorage.getItem('modelName');
  if (apiUrl) document.getElementById('apiUrl').value = apiUrl;
  if (apiKey) document.getElementById('apiKey').value = apiKey;
  if (modelName) document.getElementById('modelName').value = modelName;

  // Initialize LaTeX Toolbars
  createLatexToolbar('rubricText', 'rubricControls');
  createLatexToolbar('studentText', 'studentControls');

  // Initialize Live Previews - REMOVED as we now use inline editing
  // setupLivePreview('rubricText', 'rubricMathPreview');
  // setupLivePreview('studentText', 'studentMathPreview');

  // Trigger initial UI state
  document.getElementById('modeSwitch').dispatchEvent(new Event('change'));
});

let conversationHistory = [];

// Helper to get content from rich editor (text + latex)
function getRichEditorContent(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return "";
  
  let content = "";
  el.childNodes.forEach(node => {
    if (node.nodeType === Node.TEXT_NODE) {
      content += node.textContent;
    } else if (node.tagName && node.tagName.toLowerCase() === 'math-field') {
      content += `$$${node.value}$$`;
    } else if (node.tagName === 'BR') {
      content += '\n';
    } else {
      content += node.innerText || "";
    }
  });
  return content;
}

// Helper to set content to rich editor (simple text)
function setRichEditorContent(elementId, text) {
  const el = document.getElementById(elementId);
  if (el) el.innerText = text;
}

function createLatexToolbar(textareaId, containerId) {
  const textarea = document.getElementById(textareaId);
  if (!textarea) return;

  // Add Math Editor Button directly (no toolbar wrapper)
  const mathBtn = document.createElement('button');
  mathBtn.className = 'secondary';
  
  if (containerId) {
      // Icon-only style for inline controls
      mathBtn.innerHTML = '<i class="bi bi-calculator"></i>';
      // Styles are now handled by CSS class .integrated-controls button
      mathBtn.removeAttribute('style'); // Clear inline styles to let CSS take over
  } else {
      // Full button style for rubric
      mathBtn.innerHTML = '<i class="bi bi-calculator"></i> Insert Math';
      mathBtn.style.width = '100%'; 
      mathBtn.style.marginBottom = '5px';
      mathBtn.style.fontSize = '12px';
  }
  
  mathBtn.title = 'Insert Math Equation';
  mathBtn.type = 'button';
  mathBtn.addEventListener('click', () => {
    insertMathField(textarea);
  });

  if (containerId) {
    const container = document.getElementById(containerId);
    if (container) {
      // Insert at the top of the container
      container.insertBefore(mathBtn, container.firstChild);
    }
  } else {
    // Insert button before the textarea
    textarea.parentNode.insertBefore(mathBtn, textarea);
  }

  // Handle backspace to delete math-field
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace') {
      const selection = window.getSelection();
      if (selection.rangeCount === 0) return;
      const range = selection.getRangeAt(0);

      if (range.collapsed) {
        // Check if the cursor is immediately after a math-field
        let previousNode = null;
        
        if (range.startContainer === textarea) {
          // Cursor is directly in the editor div
          if (range.startOffset > 0) {
            previousNode = textarea.childNodes[range.startOffset - 1];
          }
        } else if (range.startContainer.nodeType === Node.TEXT_NODE && range.startOffset === 0) {
          // Cursor is at the start of a text node
          previousNode = range.startContainer.previousSibling;
        }

        if (previousNode && previousNode.tagName === 'MATH-FIELD') {
          e.preventDefault();
          // Select the node and execute delete to preserve undo history
          const range = document.createRange();
          range.selectNode(previousNode);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
          document.execCommand('delete');
        }
      }
    }
  });
}

function insertMathField(editor) {
  editor.focus();
  
  const mf = new MathfieldElement();
  mf.mathVirtualKeyboardPolicy = "manual"; // Ensure keyboard toggle is visible
  mf.style.display = 'inline-block';
  mf.style.width = 'auto';
  // Min-width handled by CSS class .rich-editor math-field
  
  // Allow deleting the box if empty and backspace is pressed
  mf.addEventListener('keydown', (ev) => {
    if ((ev.key === 'Backspace' || ev.key === 'Delete') && !mf.value) {
      ev.preventDefault();
      // Select the node and execute delete to preserve undo history
      const range = document.createRange();
      range.selectNode(mf);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand('delete');
      editor.focus();
    }
  });

  // Ensure focus when clicked
  mf.addEventListener('click', (e) => {
    // Stop the click from bubbling to the contenteditable parent
    // which might try to move the caret elsewhere
    e.stopPropagation(); 
    mf.focus();
  });
  
  // Insert at cursor
  const selection = window.getSelection();
  if (selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    // Ensure we are inserting into the correct editor
    if (editor.contains(range.commonAncestorContainer)) {
      range.deleteContents();
      range.insertNode(mf);
      
      // Insert a zero-width space after the math field to allow typing
      const spacer = document.createTextNode('\u00A0');
      if (mf.nextSibling) {
        mf.parentNode.insertBefore(spacer, mf.nextSibling);
      } else {
        mf.parentNode.appendChild(spacer);
      }

      // Move cursor after the spacer
      range.setStartAfter(spacer);
      range.setEndAfter(spacer);
      selection.removeAllRanges();
      selection.addRange(range);
      
      // Focus the new math field
      setTimeout(() => mf.focus(), 10);
    } else {
      // Fallback: append to end
      editor.appendChild(mf);
      const spacer = document.createTextNode('\u00A0');
      editor.appendChild(spacer);
      setTimeout(() => mf.focus(), 10);
    }
  } else {
    editor.appendChild(mf);
    const spacer = document.createTextNode('\u00A0');
    editor.appendChild(spacer);
    setTimeout(() => mf.focus(), 10);
  }
}

// --- MathLive Modal Logic --- REMOVED (Inline editing used instead)
/*
let currentTargetTextarea = null;
function openMathModal(textarea) { ... }
*/

document.getElementById('saveConfig').addEventListener('click', () => {
  const apiUrl = document.getElementById('apiUrl').value;
  const apiKey = document.getElementById('apiKey').value;
  const modelName = document.getElementById('modelName').value;
  localStorage.setItem('apiUrl', apiUrl);
  localStorage.setItem('apiKey', apiKey);
  localStorage.setItem('modelName', modelName);
  showConfigStatus('Settings saved!', 'green');
});

// Handle Model Change for Thinking Controls
const modelSelect = document.getElementById('modelName');
modelSelect.addEventListener('change', updateThinkingControls);
// Call on init
updateThinkingControls();

function updateThinkingControls() {
  const model = document.getElementById('modelName').value;
  const thinkingControls = document.getElementById('thinkingControls');
  const gptThinking = document.getElementById('gptThinking');
  const otherThinking = document.getElementById('otherThinking');

  thinkingControls.style.display = 'none';
  gptThinking.style.display = 'none';
  otherThinking.style.display = 'none';

  if (model.includes('gpt-oss')) {
    thinkingControls.style.display = 'block';
    gptThinking.style.display = 'block';
  } else if (
    model.includes('qwen3') || 
    model.includes('deepseek-v3.1') || 
    model.includes('deepseek-r1') ||
    model.includes('kimi-k2-thinking')
  ) {
    thinkingControls.style.display = 'block';
    otherThinking.style.display = 'block';
  }
}

document.getElementById('testConnection').addEventListener('click', async () => {
  let apiUrl = document.getElementById('apiUrl').value.replace(/\/$/, "");
  // If the user included /api at the end, remove it so we can append it correctly later
  if (apiUrl.endsWith('/api')) {
    apiUrl = apiUrl.slice(0, -4);
  }
  
  const apiKey = document.getElementById('apiKey').value;
  showConfigStatus('Testing connection...', 'blue');
  
  const headers = {};
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  try {
    // Try fetching /api/tags to verify API access and Auth
    const tagsResponse = await proxyFetch(`${apiUrl}/api/tags`, { headers });
    
    if (tagsResponse.ok) {
      showConfigStatus('Connection successful!', 'green');
    } else if (tagsResponse.status === 401) {
      showConfigStatus('Connection failed: 401 Unauthorized. Check API Key.', 'red');
    } else {
      showConfigStatus(`Connection failed: ${tagsResponse.status} ${tagsResponse.statusText}`, 'red');
    }
  } catch (error) {
    if (error.message === 'Failed to fetch') {
      showConfigStatus('Connection failed. Check URL and ensure CORS is enabled if using localhost.', 'red');
    } else {
      showConfigStatus(`Connection failed: ${error.message}`, 'red');
    }
  }
});

// --- 2. Handling Rubric (File Upload) ---
// Toggle between Text and Table mode
let rubricImages = [];
let studentImages = [];

function addImage(target, base64) {
  const container = document.getElementById(target === 'rubric' ? 'rubricImagesContainer' : 'studentImagesContainer');
  const list = target === 'rubric' ? rubricImages : studentImages;
  
  list.push(base64);
  renderImages(target);
  if (target === 'rubric') saveState();
}

function removeImage(target, index) {
  const list = target === 'rubric' ? rubricImages : studentImages;
  list.splice(index, 1);
  renderImages(target);
  if (target === 'rubric') saveState();
}

function renderImages(target) {
  const container = document.getElementById(target === 'rubric' ? 'rubricImagesContainer' : 'studentImagesContainer');
  const list = target === 'rubric' ? rubricImages : studentImages;
  
  container.innerHTML = '';
  list.forEach((base64, index) => {
    const div = document.createElement('div');
    div.style.position = 'relative';
    div.style.width = '100px';
    div.style.height = 'auto';
    
    const img = document.createElement('img');
    img.src = base64.startsWith('data:') ? base64 : `data:image/png;base64,${base64}`;
    img.style.width = '100%';
    img.style.border = '1px solid #ccc';
    img.style.borderRadius = '4px';
    
    const btn = document.createElement('button');
    btn.innerHTML = '&times;';
    btn.style.position = 'absolute';
    btn.style.top = '-5px';
    btn.style.right = '-5px';
    btn.style.background = 'red';
    btn.style.color = 'white';
    btn.style.border = 'none';
    btn.style.borderRadius = '50%';
    btn.style.width = '20px';
    btn.style.height = '20px';
    btn.style.cursor = 'pointer';
    btn.style.fontSize = '12px';
    btn.style.lineHeight = '1';
    btn.style.padding = '0';
    
    btn.addEventListener('click', () => removeImage(target, index));
    
    div.appendChild(img);
    div.appendChild(btn);
    container.appendChild(div);
  });
}

document.querySelectorAll('input[name="rubricMode"]').forEach(radio => {
  radio.addEventListener('change', (e) => {
    if (e.target.value === 'text') {
      document.getElementById('rubricTextContainer').style.display = 'block';
      document.getElementById('rubricTableContainer').style.display = 'none';
    } else {
      document.getElementById('rubricTextContainer').style.display = 'none';
      document.getElementById('rubricTableContainer').style.display = 'block';
      // Add a default row if empty
      const tbody = document.querySelector('#rubricTable tbody');
      if (tbody.children.length === 0) {
        addRubricRow();
      }
    }
  });
});

document.getElementById('btnAddRow').addEventListener('click', addRubricRow);

function addRubricRow(criteria = '', desc = '', pts = '') {
  const tbody = document.querySelector('#rubricTable tbody');
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td style="border: 1px solid #ddd; padding: 0;"><input type="text" class="r-criteria" style="border:none; margin:0; width:100%;" placeholder="Criteria" value="${criteria}"></td>
    <td style="border: 1px solid #ddd; padding: 0;"><input type="text" class="r-desc" style="border:none; margin:0; width:100%;" placeholder="Description" value="${desc}"></td>
    <td style="border: 1px solid #ddd; padding: 0;"><input type="number" class="r-pts" style="border:none; margin:0; width:100%;" placeholder="0" value="${pts}"></td>
    <td style="border: 1px solid #ddd; padding: 0; text-align:center;"><button class="btn-del" style="background:none; color:red; border:none; cursor:pointer; padding:0; margin:0; width:auto;"><i class="bi bi-trash"></i></button></td>
  `;
  tr.querySelector('.btn-del').addEventListener('click', () => {
    tr.remove();
    saveState();
  });
  tbody.appendChild(tr);
}

function getRubricFromTable() {
  const rows = document.querySelectorAll('#rubricTable tbody tr');
  let text = "Rubric:\n";
  rows.forEach(row => {
    const criteria = row.querySelector('.r-criteria').value;
    const desc = row.querySelector('.r-desc').value;
    const pts = row.querySelector('.r-pts').value;
    if (criteria || desc || pts) {
      text += `- Criteria: ${criteria}, Description: ${desc}, Points: ${pts}\n`;
    }
  });
  return text;
}

document.getElementById('rubricUpload').addEventListener('change', (e) => {
  const files = e.target.files;
  if (files && files.length > 0) {
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = function(event) {
        const base64Raw = event.target.result; 
        // Strip header for Ollama (data:image/png;base64,...)
        // But keep full string for display
        addImage('rubric', base64Raw);
      };
      reader.readAsDataURL(file);
    });
  }
});

document.getElementById('studentUpload').addEventListener('change', (e) => {
  const files = e.target.files;
  if (files && files.length > 0) {
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = function(event) {
        const base64Raw = event.target.result; 
        addImage('student', base64Raw);
      };
      reader.readAsDataURL(file);
    });
  }
});

// REMOVED btnRubricScreenshot listener

// --- Import Rubric from Highlight ---
function showRubricStatus(text, type = 'loading') {
  const el = document.getElementById('rubricStatus');
  const txt = document.getElementById('rubricStatusText');
  const spinner = el.querySelector('.spinner');
  
  el.style.display = 'flex';
  txt.innerText = text;
  
  if (type === 'loading') {
    el.style.background = '#e0f2fe';
    el.style.borderColor = '#bae6fd';
    el.style.color = '#0369a1';
    spinner.style.display = 'block';
    spinner.style.borderColor = '#0369a1';
    spinner.style.borderTopColor = 'transparent';
  } else if (type === 'success') {
    el.style.background = '#dcfce7';
    el.style.borderColor = '#bbf7d0';
    el.style.color = '#15803d';
    spinner.style.display = 'none';
    setTimeout(() => { el.style.display = 'none'; }, 3000);
  } else if (type === 'error') {
    el.style.background = '#fee2e2';
    el.style.borderColor = '#fecaca';
    el.style.color = '#b91c1c';
    spinner.style.display = 'none';
  }
}

document.getElementById('btnGetRubricText').addEventListener('click', async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection().toString()
    }, (results) => {
      if (chrome.runtime.lastError) {
        showRubricStatus("Error: Please refresh the web page and try again.", "error");
        return;
      }
      
      if (results && results[0] && results[0].result) {
        // Switch to text mode
        document.querySelector('input[name="rubricMode"][value="text"]').click();
        
        const editor = document.getElementById('rubricText');
        const text = results[0].result;
        
        if (editor.innerText.trim()) {
          editor.innerText += "\n\n" + text;
        } else {
          editor.innerText = text;
        }
        saveState();
      } else {
        showRubricStatus("No text selected on page.", "error");
      }
    });
  } catch (e) {
    showRubricStatus("Error: " + e.message, "error");
  }
});

document.getElementById('btnImportRubric').addEventListener('click', async () => {
  // 1. Get Highlighted Text
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let selection = "";
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection().toString()
    });
    if (results && results[0] && results[0].result) {
      selection = results[0].result;
    }
  } catch (e) {
    showRubricStatus("Could not get selection: " + e.message, "error");
    return;
  }

  if (!selection || selection.trim() === "") {
    showRubricStatus("Please highlight rubric text on the page first.", "error");
    return;
  }

  showRubricStatus("Parsing rubric from text...", "loading");
  const btn = document.getElementById('btnImportRubric');
  btn.disabled = true;

  // 2. Prepare API Call
  let apiUrl = document.getElementById('apiUrl').value.replace(/\/$/, "");
  if (apiUrl.endsWith('/api')) {
    apiUrl = apiUrl.slice(0, -4);
  }
  const apiKey = document.getElementById('apiKey').value;
  const modelName = document.getElementById('modelName').value;

  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  const prompt = Prompts.getRubricExtractionPrompt(selection);

  try {
    const response = await proxyFetch(`${apiUrl}/api/generate`, {
      method: "POST",
      headers: headers,
      body: JSON.stringify({
        model: modelName,
        prompt: prompt,
        stream: false,
        format: "json"
      })
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("401 Unauthorized. Please check your API Key.");
      }
      throw new Error("API Error: " + response.status);
    }

    const data = await response.json();
    let jsonResponse = data.response;
    
    // Clean up potential markdown code blocks
    jsonResponse = jsonResponse.replace(/```json/g, "").replace(/```/g, "").trim();
    
    const parsed = JSON.parse(jsonResponse);
    
    if (parsed && parsed.rubric && Array.isArray(parsed.rubric)) {
      // 3. Populate Table
      const tbody = document.querySelector('#rubricTable tbody');
      tbody.innerHTML = ""; // Clear existing
      
      parsed.rubric.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td style="border: 1px solid #ddd; padding: 0;"><input type="text" class="r-criteria" style="border:none; margin:0; width:100%;" value="${item.criteria || ''}"></td>
          <td style="border: 1px solid #ddd; padding: 0;"><input type="text" class="r-desc" style="border:none; margin:0; width:100%;" value="${item.description || ''}"></td>
          <td style="border: 1px solid #ddd; padding: 0;"><input type="number" class="r-pts" style="border:none; margin:0; width:100%;" value="${item.points || 0}"></td>
          <td style="border: 1px solid #ddd; padding: 0; text-align:center;"><button class="btn-del" style="background:none; color:red; border:none; cursor:pointer; padding:0; margin:0; width:auto;"><i class="bi bi-trash"></i></button></td>
        `;
        tr.querySelector('.btn-del').addEventListener('click', () => tr.remove());
        tbody.appendChild(tr);
      });

      // Switch to table mode
      document.querySelector('input[name="rubricMode"][value="table"]').click();
      showRubricStatus("Rubric imported successfully!", "success");
      
      // Clear rubric images after successful import
      rubricImages = [];
      renderImages('rubric');
      saveState();
    } else {
      throw new Error("Invalid JSON structure returned");
    }

  } catch (err) {
    console.error(err);
    showRubricStatus("Failed to parse rubric: " + err.message, "error");
  } finally {
    btn.disabled = false;
  }
});

// --- Import Rubric from Image ---
document.getElementById('btnImportRubricImage').addEventListener('click', async () => {
  if (rubricImages.length === 0) {
    showRubricStatus("Please take a screenshot or upload an image of the rubric first.", "error");
    return;
  }

  showRubricStatus("Parsing rubric from image...", "loading");
  const btn = document.getElementById('btnImportRubricImage');
  btn.disabled = true;

  // Prepare API Call
  let apiUrl = document.getElementById('apiUrl').value.replace(/\/$/, "");
  if (apiUrl.endsWith('/api')) {
    apiUrl = apiUrl.slice(0, -4);
  }
  const apiKey = document.getElementById('apiKey').value;
  const modelName = document.getElementById('modelName').value;

  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  const prompt = Prompts.getRubricExtractionFromImagePrompt();
  
  // Prepare images
  const images = rubricImages.map(img => img.split(',')[1]);

  try {
    const response = await proxyFetch(`${apiUrl}/api/generate`, {
      method: "POST",
      headers: headers,
      body: JSON.stringify({
        model: "qwen3-vl:235b-instruct-cloud", // Hardcoded for rubric extraction
        prompt: prompt,
        images: images,
        stream: false,
        format: "json"
      })
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("401 Unauthorized. Please check your API Key.");
      }
      throw new Error("API Error: " + response.status);
    }

    const data = await response.json();
    let jsonResponse = data.response;
    
    // Clean up potential markdown code blocks
    jsonResponse = jsonResponse.replace(/```json/g, "").replace(/```/g, "").trim();
    
    const parsed = JSON.parse(jsonResponse);
    
    if (parsed && parsed.rubric && Array.isArray(parsed.rubric)) {
      // Populate Table
      const tbody = document.querySelector('#rubricTable tbody');
      tbody.innerHTML = ""; // Clear existing
      
      parsed.rubric.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td style="border: 1px solid #ddd; padding: 0;"><input type="text" class="r-criteria" style="border:none; margin:0; width:100%;" value="${item.criteria || ''}"></td>
          <td style="border: 1px solid #ddd; padding: 0;"><input type="text" class="r-desc" style="border:none; margin:0; width:100%;" value="${item.description || ''}"></td>
          <td style="border: 1px solid #ddd; padding: 0;"><input type="number" class="r-pts" style="border:none; margin:0; width:100%;" value="${item.points || 0}"></td>
          <td style="border: 1px solid #ddd; padding: 0; text-align:center;"><button class="btn-del" style="background:none; color:red; border:none; cursor:pointer; padding:0; margin:0; width:auto;"><i class="bi bi-trash"></i></button></td>
        `;
        tr.querySelector('.btn-del').addEventListener('click', () => tr.remove());
        tbody.appendChild(tr);
      });

      // Switch to table mode
      document.querySelector('input[name="rubricMode"][value="table"]').click();
      showRubricStatus("Rubric imported successfully!", "success");
      
      // Clear rubric images after successful import
      rubricImages = [];
      renderImages('rubric');
      saveState();
    } else {
      throw new Error("Invalid JSON structure returned");
    }

  } catch (err) {
    console.error(err);
    showRubricStatus("Failed to parse rubric: " + err.message, "error");
  } finally {
    btn.disabled = false;
  }
});

// --- 3. Handling Student Work (Highlight & Screenshot) ---

let currentCaptureTarget = null; // 'rubric' or 'student'

// A. Get Highlighted Text
document.getElementById('btnGetStudentText').addEventListener('click', async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection().toString()
    }, (results) => {
      if (chrome.runtime.lastError) {
        showStatus("Error: Please refresh the web page and try again.", "red");
        return;
      }

      if (results && results[0] && results[0].result) {
        setRichEditorContent('studentText', results[0].result);
      } else {
        showStatus("No text selected on page.", "orange");
      }
    });
  } catch (e) {
    showStatus("Error: " + e.message, "red");
  }
});

// B. Import Student Work (Text)
document.getElementById('btnImportStudent').addEventListener('click', async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection().toString()
    }, async (results) => {
      if (chrome.runtime.lastError) {
        showStatus("Error: Please refresh the web page.", "red");
        return;
      }
      if (results && results[0] && results[0].result) {
        const text = results[0].result;
        showStatus("Processing student text...", "blue");
        // Just set it for now, or we could add an LLM call to 'clean' it
        setRichEditorContent('studentText', text);
        showStatus("Student text imported.", "green");
      } else {
        showStatus("No text selected.", "orange");
      }
    });
  } catch (e) {
    showStatus("Error: " + e.message, "red");
  }
});

// C. Import Student Work (Image)
document.getElementById('btnImportStudentImage').addEventListener('click', () => {
  // We reuse the area selection logic but set a flag to process it differently
  startAreaSelection('student-import');
});

// B. Screenshot Visible Tab - REMOVED

// C. Area Selection Logic
document.getElementById('btnRubricArea').addEventListener('click', () => startAreaSelection('rubric'));
document.getElementById('btnStudentArea').addEventListener('click', () => startAreaSelection('student'));

async function startAreaSelection(target) {
  currentCaptureTarget = target;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  // Inject the capture script
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['capture_area.js']
  });
}

// Listen for area selection from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "areaSelected" && currentCaptureTarget) {
    processAreaCapture(request.area);
  }
});

function processAreaCapture(area) {
  // 1. Capture full visible tab
  chrome.runtime.sendMessage({ action: "captureVisibleTab" }, (response) => {
    if (response && response.dataUrl) {
      // 2. Crop image
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Handle device pixel ratio
        const dpr = area.devicePixelRatio || 1;
        
        canvas.width = area.width * dpr;
        canvas.height = area.height * dpr;
        
        ctx.drawImage(
          img,
          area.x * dpr, area.y * dpr, area.width * dpr, area.height * dpr,
          0, 0, canvas.width, canvas.height
        );
        
        const croppedDataUrl = canvas.toDataURL('image/png');
        
        // 3. Update UI
        if (currentCaptureTarget === 'rubric-import') {
          extractRubricFromImage(croppedDataUrl);
        } else if (currentCaptureTarget === 'student-import') {
          // For now, just add the image, but we could add OCR logic here later
          // Or we can try to extract text using a vision model if the user wants
          // For now, let's treat it as adding an image to the student section
          addImage('student', croppedDataUrl);
          showStatus("Student work image added.", "green");
        } else {
          addImage(currentCaptureTarget, croppedDataUrl);
        }
        
        currentCaptureTarget = null;
      };
      img.src = response.dataUrl;
    }
  });
}

// --- 4. The Main Logic: Call Ollama ---
let solverTurn = 0;

// Toggle UI based on mode
document.getElementById('modeSwitch').addEventListener('change', (e) => {
  const isSolver = e.target.checked;
  const studentText = document.getElementById('studentText');
  const rubricCard = document.getElementById('rubricCard');
  const rubricTitle = document.getElementById('rubricTitle');
  const studentWorkTitle = document.getElementById('studentWorkTitle');
  const btnImportStudent = document.getElementById('btnImportStudent');
  const btnImportStudentImage = document.getElementById('btnImportStudentImage');
  const btnImportRubric = document.getElementById('btnImportRubric');
  const btnImportRubricImage = document.getElementById('btnImportRubricImage');
  const rubricText = document.getElementById('rubricText');
  const chatHistoryDisplay = document.getElementById('chatHistoryDisplay');
  
  // Reset History and State
  chatHistoryDisplay.innerHTML = '';
  conversationHistory = [];
  solverTurn = 0;
  
  if (isSolver) {
    document.body.classList.add('solver-mode');
    rubricCard.style.display = 'block';
    rubricTitle.innerHTML = '<i class="bi bi-list-check"></i> Question Setup';
    studentWorkTitle.innerHTML = '<i class="bi bi-chat-dots"></i> Solver Chat';
    
    // Update Question Setup buttons
    btnImportRubric.innerHTML = '<i class="bi bi-stars"></i> Import Question for Highlighted Text (AI)';
    btnImportRubricImage.innerHTML = '<i class="bi bi-file-image"></i> Import Question from Screenshot (AI)';

    // Update Solver Chat buttons
    btnImportStudent.innerHTML = '<i class="bi bi-stars"></i> Import from Highlighted Text (AI)';
    btnImportStudentImage.innerHTML = '<i class="bi bi-file-image"></i> Import from Screenshot (AI)';

    studentText.setAttribute('placeholder', "Ask a question...");
    rubricText.setAttribute('placeholder', "Paste question text here or upload image...");
    
  } else {
    document.body.classList.remove('solver-mode');
    rubricCard.style.display = 'block';
    rubricTitle.innerHTML = '<i class="bi bi-list-check"></i> 1. Define Role / Rubric';
    studentWorkTitle.innerHTML = '<i class="bi bi-person-workspace"></i> 2. Student Work';
    
    // Reset Question Setup buttons
    btnImportRubric.innerHTML = '<i class="bi bi-stars"></i> Import Rubric from Highlighted Text (AI)';
    btnImportRubricImage.innerHTML = '<i class="bi bi-file-image"></i> Import Rubric from Screenshot (AI)';

    // Reset Student Work buttons
    btnImportStudent.innerHTML = '<i class="bi bi-stars"></i> Import Student Work from Text (AI)';
    btnImportStudentImage.innerHTML = '<i class="bi bi-file-image"></i> Import Student Work from Screenshot (AI)';

    studentText.setAttribute('placeholder', "Student text will appear here...");
    rubricText.setAttribute('placeholder', "Paste rubric text here or upload image...");
    
    // Add placeholder message for Grader
    const placeholder = document.createElement('div');
    placeholder.style.color = '#888';
    placeholder.style.fontStyle = 'italic';
    placeholder.style.textAlign = 'center';
    placeholder.style.padding = '20px';
    placeholder.innerText = 'Enter student work below and click Send to grade.';
    chatHistoryDisplay.appendChild(placeholder);
  }
});

document.getElementById('btnGrade').addEventListener('click', async () => {
  let apiUrl = document.getElementById('apiUrl').value.replace(/\/$/, ""); // remove trailing slash
  // If the user included /api at the end, remove it so we can append it correctly later
  if (apiUrl.endsWith('/api')) {
    apiUrl = apiUrl.slice(0, -4);
  }

  const apiKey = document.getElementById('apiKey').value;
  let modelName = document.getElementById('modelName').value;
  const isSolver = document.getElementById('modeSwitch').checked;
  
  // Auto-switch model if images are present
  if (studentImages.length > 0 || rubricImages.length > 0) {
    const visionModel = "qwen3-vl:235b-instruct-cloud"; // Or just "qwen3-vl" depending on your preference
    if (modelName !== visionModel) {
      modelName = visionModel;
      document.getElementById('modelName').value = visionModel;
      updateThinkingControls(); // Update UI controls for the new model
      showStatus(`Auto-switched to ${visionModel} for image analysis.`, "blue");
    }
  }
  
  let rubricText = "";
  const rubricMode = document.querySelector('input[name="rubricMode"]:checked').value;
  
  if (rubricMode === 'table') {
    rubricText = getRubricFromTable();
  } else {
    rubricText = getRichEditorContent('rubricText');
  }

  const studentText = getRichEditorContent('studentText');

  if (!isSolver && !rubricText && rubricImages.length === 0) {
    showStatus("Please provide a rubric or role.", "red");
    return;
  }
  
  if (!studentText && studentImages.length === 0) {
    showStatus("Please provide text or images.", "red");
    return;
  }

  showStatus("Thinking...", "blue");

  // Gather Images
  const images = [];
  // Add rubric images (strip header)
  rubricImages.forEach(img => images.push(img.split(',')[1]));
  // Add student images (strip header)
  studentImages.forEach(img => images.push(img.split(',')[1]));

  // Add User Bubble to Chat History
  const chatHistoryDisplay = document.getElementById('chatHistoryDisplay');
  
  // Clear placeholder if first message in Grader mode
  if (!isSolver && conversationHistory.length === 0) {
      chatHistoryDisplay.innerHTML = '';
  }

  const userBubble = document.createElement('div');
  userBubble.className = 'chat-message user-message';
  userBubble.innerText = studentText; // Show raw text to user
  chatHistoryDisplay.appendChild(userBubble);
  chatHistoryDisplay.scrollTop = chatHistoryDisplay.scrollHeight;

  // Clear Input
  setRichEditorContent('studentText', '');
  studentImages = []; // Clear images after sending
  renderImages('student');

  let systemInstruction;
  let userPrompt;
  let mode = 'chat';

  if (isSolver) {
    // If it's the first turn or a reset
    if (solverTurn === 0 || solverTurn >= 4) {
        solverTurn = 1;
        // chatHistoryDisplay.innerHTML = ''; // Don't clear history here, let user see previous
        systemInstruction = Prompts.getSolverSystemPrompt(rubricText);
        userPrompt = `Student Question (Interaction 1/4): ${studentText}`;
        
        // Initialize History
        conversationHistory = [
            { role: "system", content: systemInstruction },
            { role: "user", content: userPrompt, images: images.length > 0 ? images : undefined }
        ];
        mode = 'solver';
    } else {
        // Continuation
        solverTurn++;
        userPrompt = `Student Follow-up (Interaction ${solverTurn}/4): ${studentText}`;
        conversationHistory.push({ role: "user", content: userPrompt, images: images.length > 0 ? images : undefined });
        mode = 'solver';
    }
  } else {
    // Grader Mode
    if (conversationHistory.length === 0) {
        // First Run (Grading)
        systemInstruction = Prompts.getGradingSystemPrompt(rubricText);
        userPrompt = `Student Submission: ${studentText}`;
        conversationHistory = [
            { role: "system", content: systemInstruction },
            { role: "user", content: userPrompt, images: images.length > 0 ? images : undefined }
        ];
        mode = 'grading';
    } else {
        // Follow-up Chat
        userPrompt = studentText;
        conversationHistory.push({ role: "user", content: userPrompt, images: images.length > 0 ? images : undefined });
        mode = 'chat';
    }
  }

  await streamChat(conversationHistory, mode);
});

// --- Chat Logic ---
// Removed btnSendChat listener as it's now integrated into btnGrade/btnSolverSend

async function streamChat(messages, mode) {
  let apiUrl = document.getElementById('apiUrl').value.replace(/\/$/, "");
  if (apiUrl.endsWith('/api')) apiUrl = apiUrl.slice(0, -4);
  const apiKey = document.getElementById('apiKey').value;
  const modelName = document.getElementById('modelName').value;

  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  const requestBody = {
    model: modelName,
    messages: messages,
    stream: true,
    options: {}
  };

  // Add Thinking Parameters
  if (modelName.includes('gpt-oss')) {
    const level = document.getElementById('thinkLevel').value;
    requestBody.options.think_level = level;
  } else if (
    modelName.includes('qwen3') || 
    modelName.includes('deepseek-v3.1') || 
    modelName.includes('deepseek-r1') ||
    modelName.includes('kimi-k2-thinking')
  ) {
    const thinkingEnabled = document.getElementById('thinkingMode').checked;
    if (thinkingEnabled) {
      requestBody.options.thinking_mode = true; 
    }
  }

  // Prepare Chat Bubble for Assistant
  const chatHistoryDisplay = document.getElementById('chatHistoryDisplay');
  const assistantBubble = document.createElement('div');
  assistantBubble.className = 'chat-message assistant-message';
  chatHistoryDisplay.appendChild(assistantBubble);
  chatHistoryDisplay.scrollTop = chatHistoryDisplay.scrollHeight;

  // Thinking Container inside Bubble
  const thinkingDetails = document.createElement('details');
  thinkingDetails.style.display = 'none';
  thinkingDetails.style.marginBottom = '10px';
  thinkingDetails.style.fontSize = '12px';
  thinkingDetails.style.color = '#666';
  thinkingDetails.style.borderLeft = '2px solid #ccc';
  thinkingDetails.style.paddingLeft = '8px';
  
  const thinkingSummary = document.createElement('summary');
  thinkingSummary.innerText = 'Thinking Process';
  thinkingSummary.style.cursor = 'pointer';
  thinkingSummary.style.fontWeight = 'bold';
  
  const thinkingContent = document.createElement('div');
  thinkingContent.style.whiteSpace = 'pre-wrap';
  thinkingContent.style.marginTop = '5px';
  
  thinkingDetails.appendChild(thinkingSummary);
  thinkingDetails.appendChild(thinkingContent);
  assistantBubble.appendChild(thinkingDetails);

  // Content Container
  const contentContainer = document.createElement('div');
  assistantBubble.appendChild(contentContainer);

  if (mode === 'grading') {
      contentContainer.innerHTML = '<em>Generating Assessment...</em>';
  }

  try {
    const response = await fetch(`${apiUrl}/api/chat`, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      let errorMessage = `API Error: ${response.status}`;
      try {
        const errorData = await response.json();
        if (errorData && errorData.error) errorMessage = `Ollama Error: ${errorData.error}`;
      } catch (e) {
        try {
          const errorText = await response.text();
          if (errorText) errorMessage = `API Error: ${errorText}`;
        } catch (e2) {}
      }
      if (response.status === 401) throw new Error("401 Unauthorized. Please check your API Key.");
      if (response.status === 400 && messages.some(m => m.images)) {
        errorMessage += "\n\nTip: You are sending images. Ensure the selected model supports vision.";
      }
      throw new Error(errorMessage);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let done = false;
    let thinkingText = '';
    let responseText = '';

    while (!done) {
      const { value, done: doneReading } = await reader.read();
      done = doneReading;
      const chunkValue = decoder.decode(value, { stream: true });
      const lines = chunkValue.split('\n');
      
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const json = JSON.parse(line);
          
          // Handle Thinking
          if (json.thinking) {
             thinkingDetails.style.display = 'block';
             thinkingText += json.thinking;
             thinkingContent.innerText = thinkingText;
          }
          
          // Handle Content
          if (json.message && json.message.content) {
            responseText += json.message.content;
            
            if (mode === 'chat' || mode === 'solver') {
              contentContainer.innerHTML = marked.parse(responseText);
              chatHistoryDisplay.scrollTop = chatHistoryDisplay.scrollHeight;
            }
          }
          
          if (json.done) {
            if (mode === 'grading') {
              showStatus("Done.", "green");
              renderGradingResponse(responseText, contentContainer);
            } else if (mode === 'solver') {
               showStatus(`Interaction ${solverTurn}/4 Complete.`, "green");
               // Refocus input for next message
               document.getElementById('studentText').focus();
            }
            // Add to history
            conversationHistory.push({ role: "assistant", content: responseText });
          }
        } catch (e) {
          console.error("Error parsing chunk", e);
        }
      }
    }
  } catch (err) {
    console.error(err);
    showStatus(`Error connecting to Ollama: ${err.message}`, "red");
    contentContainer.innerText += `\n[Error: ${err.message}]`;
    contentContainer.style.color = 'red';
  }
}

function renderGradingResponse(text, container) {
  container.innerHTML = '';

  try {
    // Clean up potential markdown code blocks
    let jsonStr = text.replace(/```json/g, "").replace(/```/g, "").trim();
    const data = JSON.parse(jsonStr);

    if (data && data.grading && Array.isArray(data.grading)) {
      const table = document.createElement('table');
      table.style.width = '100%';
      table.style.borderCollapse = 'collapse';
      table.style.fontSize = '13px';
      
      const thead = document.createElement('thead');
      thead.innerHTML = `
        <tr style="background: #f1f1f1; text-align: left;">
          <th style="border: 1px solid #ddd; padding: 8px;">Criteria</th>
          <th style="border: 1px solid #ddd; padding: 8px;">Status</th>
          <th style="border: 1px solid #ddd; padding: 8px;">Evidence & Comment</th>
        </tr>
      `;
      table.appendChild(thead);

      const tbody = document.createElement('tbody');
      data.grading.forEach(item => {
        let statusIcon = item.status;
        if (item.status.toLowerCase() === 'pass') {
          statusIcon = '<i class="bi bi-check-circle-fill" style="color: #198754;"></i>';
        } else if (item.status.toLowerCase() === 'fail') {
          statusIcon = '<i class="bi bi-x-circle-fill" style="color: #dc3545;"></i>';
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td style="border: 1px solid #ddd; padding: 8px; font-weight: bold; vertical-align: top; width: 20%;">${item.criteria}</td>
          <td style="border: 1px solid #ddd; padding: 8px; text-align: center; vertical-align: top; width: 10%; font-size: 1.2em;">${statusIcon}</td>
          <td style="border: 1px solid #ddd; padding: 8px; vertical-align: top;">
            <div style="font-style: italic; color: #555; margin-bottom: 4px; border-left: 2px solid #ccc; padding-left: 6px;">"${item.excerpt}"</div>
            <div>${item.comment}</div>
          </td>
        `;
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      container.appendChild(table);
    } else {
      // Fallback if JSON structure doesn't match
      container.innerHTML = marked.parse(text);
    }
  } catch (e) {
    // Fallback if not valid JSON
    container.innerHTML = marked.parse(text);
  }
}

function showStatus(text, color) {
  const el = document.getElementById('status');
  el.innerText = text;
  el.style.color = color || 'black';
}

let configStatusTimeout;
function showConfigStatus(text, color) {
  const el = document.getElementById('configStatus');
  if (el) {
    el.innerText = text;
    el.style.color = color || 'black';
    el.style.display = 'block';
    el.style.marginTop = '5px';
    
    if (configStatusTimeout) clearTimeout(configStatusTimeout);
    configStatusTimeout = setTimeout(() => {
      el.innerText = '';
      el.style.display = 'none';
      el.style.marginTop = '0';
    }, 3000);
  }
}

function proxyFetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    if (typeof chrome === 'undefined' || !chrome.runtime) {
      reject(new Error("Extension API not found. Please open this via the extension icon, not as a file."));
      return;
    }
    chrome.runtime.sendMessage({
      action: "proxyFetch",
      url: url,
      options: options
    }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (response.error) {
        reject(new Error(response.error));
      } else {
        // Mimic the fetch response object slightly for compatibility
        resolve({
          ok: response.ok,
          status: response.status,
          statusText: response.statusText,
          text: () => Promise.resolve(response.data),
          json: () => Promise.resolve(JSON.parse(response.data))
        });
      }
    });
  });
}

// --- Persistence Logic ---
function saveState() {
  const state = {
    apiUrl: document.getElementById('apiUrl').value,
    apiKey: document.getElementById('apiKey').value,
    modelName: document.getElementById('modelName').value,
    rubricMode: document.querySelector('input[name="rubricMode"]:checked').value,
    rubricText: document.getElementById('rubricText').innerHTML,
    rubricTable: getRubricTableData(),
    rubricImages: rubricImages
  };
  chrome.storage.local.set(state, () => {
    console.log('State saved');
  });
}

function loadState() {
  chrome.storage.local.get([
    'apiUrl', 'apiKey', 'modelName', 
    'rubricMode', 'rubricText', 'rubricTable', 'rubricImages'
  ], (result) => {
    if (result.apiUrl) document.getElementById('apiUrl').value = result.apiUrl;
    if (result.apiKey) document.getElementById('apiKey').value = result.apiKey;
    if (result.modelName) {
      document.getElementById('modelName').value = result.modelName;
      updateThinkingControls();
    }
    
    if (result.rubricMode) {
      const radio = document.querySelector(`input[name="rubricMode"][value="${result.rubricMode}"]`);
      if (radio) {
        radio.checked = true;
        radio.dispatchEvent(new Event('change'));
      }
    }

    if (result.rubricText) {
      document.getElementById('rubricText').innerHTML = result.rubricText;
    }

    if (result.rubricTable && Array.isArray(result.rubricTable)) {
      const tbody = document.querySelector('#rubricTable tbody');
      tbody.innerHTML = "";
      result.rubricTable.forEach(item => {
        addRubricRow(item.criteria, item.description, item.points);
      });
    }

    if (result.rubricImages && Array.isArray(result.rubricImages)) {
      rubricImages = result.rubricImages;
      renderImages('rubric');
    }
  });
}

function getRubricTableData() {
  const rows = document.querySelectorAll('#rubricTable tbody tr');
  const data = [];
  rows.forEach(row => {
    data.push({
      criteria: row.querySelector('.r-criteria').value,
      description: row.querySelector('.r-desc').value,
      points: row.querySelector('.r-pts').value
    });
  });
  return data;
}

// Auto-save on changes
document.getElementById('apiUrl').addEventListener('change', saveState);
document.getElementById('apiKey').addEventListener('change', saveState);
document.getElementById('modelName').addEventListener('change', saveState);
document.querySelectorAll('input[name="rubricMode"]').forEach(r => r.addEventListener('change', saveState));
document.getElementById('rubricText').addEventListener('input', saveState);
// For table inputs, we need to delegate since rows are dynamic
document.querySelector('#rubricTable').addEventListener('input', saveState);
// For images, we'll call saveState() inside addImage/removeImage

// Load on startup
loadState();

document.getElementById('saveConfig').addEventListener('click', () => {
  saveState();
  showStatus('Settings and Rubric saved!', 'green');
});

// Add Enter key listener for studentText in Solver mode
document.getElementById('studentText').addEventListener('keydown', (e) => {
  const isSolver = document.getElementById('modeSwitch').checked;
  if (isSolver && e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    document.getElementById('btnGrade').click();
  }
});

// Add listener for the new inline send button
document.getElementById('btnSolverSend').addEventListener('click', () => {
  document.getElementById('btnGrade').click();
});