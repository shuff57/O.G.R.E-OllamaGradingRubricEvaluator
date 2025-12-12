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
  createLatexToolbar('rubricText');
  createLatexToolbar('studentText');

  // Initialize Live Previews - REMOVED as we now use inline editing
  // setupLivePreview('rubricText', 'rubricMathPreview');
  // setupLivePreview('studentText', 'studentMathPreview');
});

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

function createLatexToolbar(textareaId) {
  const textarea = document.getElementById(textareaId);
  if (!textarea) return;

  const toolbar = document.createElement('div');
  toolbar.className = 'latex-toolbar';

  // Add Math Editor Button
  const mathBtn = document.createElement('button');
  mathBtn.className = 'latex-btn';
  mathBtn.innerHTML = '<i class="bi bi-calculator"></i> Insert Math';
  mathBtn.title = 'Insert Math Equation';
  mathBtn.style.fontWeight = 'bold';
  mathBtn.style.width = '100%'; 
  mathBtn.type = 'button';
  mathBtn.addEventListener('click', () => {
    insertMathField(textarea);
  });
  toolbar.appendChild(mathBtn);

  // Insert toolbar before the textarea
  textarea.parentNode.insertBefore(toolbar, textarea);

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
// ...existing code...
  const apiUrl = document.getElementById('apiUrl').value;
  const apiKey = document.getElementById('apiKey').value;
  const modelName = document.getElementById('modelName').value;
  localStorage.setItem('apiUrl', apiUrl);
  localStorage.setItem('apiKey', apiKey);
  localStorage.setItem('modelName', modelName);
  showStatus('Settings saved!', 'green');
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
  showStatus('Testing connection...', 'blue');
  
  const headers = {};
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  try {
    // Try fetching /api/tags to verify API access and Auth
    const tagsResponse = await proxyFetch(`${apiUrl}/api/tags`, { headers });
    
    if (tagsResponse.ok) {
      showStatus('Connection successful!', 'green');
    } else if (tagsResponse.status === 401) {
      showStatus('Connection failed: 401 Unauthorized. Check API Key.', 'red');
    } else {
      showStatus(`Connection failed: ${tagsResponse.status} ${tagsResponse.statusText}`, 'red');
    }
  } catch (error) {
    if (error.message === 'Failed to fetch') {
      showStatus('Connection failed. Check URL and ensure CORS is enabled if using localhost.', 'red');
    } else {
      showStatus(`Connection failed: ${error.message}`, 'red');
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
}

function removeImage(target, index) {
  const list = target === 'rubric' ? rubricImages : studentImages;
  list.splice(index, 1);
  renderImages(target);
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

function addRubricRow() {
  const tbody = document.querySelector('#rubricTable tbody');
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td style="border: 1px solid #ddd; padding: 0;"><input type="text" class="r-criteria" style="border:none; margin:0; width:100%;" placeholder="Criteria"></td>
    <td style="border: 1px solid #ddd; padding: 0;"><input type="text" class="r-desc" style="border:none; margin:0; width:100%;" placeholder="Description"></td>
    <td style="border: 1px solid #ddd; padding: 0;"><input type="number" class="r-pts" style="border:none; margin:0; width:100%;" placeholder="0"></td>
    <td style="border: 1px solid #ddd; padding: 0; text-align:center;"><button class="btn-del" style="background:none; color:red; border:none; cursor:pointer; padding:0; margin:0; width:auto;"><i class="bi bi-trash"></i></button></td>
  `;
  tr.querySelector('.btn-del').addEventListener('click', () => tr.remove());
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

// REMOVED btnRubricScreenshot listener

// --- Import Rubric from Highlight ---
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
    showStatus("Could not get selection: " + e.message, "red");
    return;
  }

  if (!selection || selection.trim() === "") {
    showStatus("Please highlight rubric text on the page first.", "orange");
    return;
  }

  showStatus("Parsing rubric...", "blue");

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
      showStatus("Rubric imported successfully!", "green");
    } else {
      throw new Error("Invalid JSON structure returned");
    }

  } catch (err) {
    console.error(err);
    showStatus("Failed to parse rubric: " + err.message, "red");
  }
});

// --- Import Rubric from Image ---
document.getElementById('btnImportRubricImage').addEventListener('click', async () => {
  if (rubricImages.length === 0) {
    showStatus("Please take a screenshot or upload an image of the rubric first.", "orange");
    return;
  }

  showStatus("Parsing rubric from image...", "blue");

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
      
      // Clear the images as they have been processed
      rubricImages = [];
      renderImages('rubric');
      
      showStatus("Rubric imported from image successfully! Images cleared.", "green");
    } else {
      throw new Error("Invalid JSON structure returned");
    }

  } catch (err) {
    console.error(err);
    showStatus("Failed to parse rubric from image: " + err.message, "red");
  }
});

// --- 3. Handling Student Work (Highlight & Screenshot) ---

let currentCaptureTarget = null; // 'rubric' or 'student'

// A. Get Highlighted Text
document.getElementById('btnHighlight').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => window.getSelection().toString()
  }, (results) => {
    if (results && results[0] && results[0].result) {
      setRichEditorContent('studentText', results[0].result);
    } else {
      showStatus("No text selected on page.", "orange");
    }
  });
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
        addImage(currentCaptureTarget, croppedDataUrl);
        
        currentCaptureTarget = null;
      };
      img.src = response.dataUrl;
    }
  });
}

// --- 4. The Main Logic: Call Ollama ---
document.getElementById('btnGrade').addEventListener('click', async () => {
  let apiUrl = document.getElementById('apiUrl').value.replace(/\/$/, ""); // remove trailing slash
  // If the user included /api at the end, remove it so we can append it correctly later
  if (apiUrl.endsWith('/api')) {
    apiUrl = apiUrl.slice(0, -4);
  }

  const apiKey = document.getElementById('apiKey').value;
  const modelName = document.getElementById('modelName').value;
  
  let rubricText = "";
  const rubricMode = document.querySelector('input[name="rubricMode"]:checked').value;
  
  if (rubricMode === 'table') {
    rubricText = getRubricFromTable();
  } else {
    rubricText = getRichEditorContent('rubricText');
  }

  const studentText = getRichEditorContent('studentText');

  if (!rubricText && rubricImages.length === 0) {
    showStatus("Please provide a rubric or role.", "red");
    return;
  }
  
  showStatus("Thinking...", "blue");
  document.getElementById('response').innerText = "";

  // Construct the prompt
  const systemInstruction = Prompts.getGradingSystemPrompt(rubricText);

  const userPrompt = `Student Submission: ${studentText}`;

  // Gather Images
  const images = [];
  // Add rubric images (strip header)
  rubricImages.forEach(img => images.push(img.split(',')[1]));
  // Add student images (strip header)
  studentImages.forEach(img => images.push(img.split(',')[1]));

  const headers = { "Content-Type": "application/json" };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const requestBody = {
    model: modelName,
    prompt: `${systemInstruction}\n\n${userPrompt}`,
    images: images.length > 0 ? images : undefined,
    stream: true, // Enable streaming
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

  console.log("Sending request to Ollama:", requestBody);

  // Reset UI
  const thinkingContainer = document.getElementById('thinkingContainer');
  thinkingContainer.style.display = 'none';
  thinkingContainer.removeAttribute('open'); // Collapse the details
  document.getElementById('thinkingContent').innerText = '';
  document.getElementById('response').innerText = '';

  try {
    // We need to use a custom fetch implementation that supports streaming
    // Since proxyFetch in background.js might not support streaming well, 
    // we will try to use the direct fetch if possible (if CORS allows), 
    // otherwise we need to update proxyFetch to support streaming or use a different approach.
    // For now, let's assume we can use the proxyFetch but we need to handle the stream in the background.
    // However, standard chrome.runtime.sendMessage does not support streaming responses easily.
    // A better approach for streaming in extensions is using a long-lived connection (port).
    
    // Let's try to use the direct fetch first, as we fixed the CORS issue on the server side.
    // If that fails, we might need a more complex proxy setup.
    
    const response = await fetch(`${apiUrl}/api/generate`, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      let errorMessage = `API Error: ${response.status}`;
      try {
        const errorData = await response.json();
        if (errorData && errorData.error) {
          errorMessage = `Ollama Error: ${errorData.error}`;
        }
      } catch (e) {
        // Could not parse JSON error, try text
        try {
          const errorText = await response.text();
          if (errorText) errorMessage = `API Error: ${errorText}`;
        } catch (e2) {}
      }

      if (response.status === 401) {
        throw new Error("401 Unauthorized. Please check your API Key.");
      }
      
      // Common 400 error for non-vision models
      if (response.status === 400 && images.length > 0) {
        errorMessage += "\n\nTip: You are sending images. Ensure the selected model supports vision (e.g., qwen3-vl, gemini-3-pro).";
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
      
      // Ollama sends multiple JSON objects in one chunk sometimes
      const lines = chunkValue.split('\n');
      
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const json = JSON.parse(line);
          
          // Handle Thinking
          if (json.thinking) {
            document.getElementById('thinkingContainer').style.display = 'block';
            thinkingText += json.thinking;
            document.getElementById('thinkingContent').innerText = thinkingText;
          }
          
          // Handle Content
          if (json.response) {
            responseText += json.response;
            document.getElementById('response').innerText = responseText;
          }
          
          if (json.done) {
            showStatus("Done.", "green");
          }
        } catch (e) {
          console.error("Error parsing chunk", e);
        }
      }
    }

  } catch (err) {
    console.error(err);
    showStatus(`Error connecting to Ollama: ${err.message}`, "red");
  }
});

function showStatus(text, color) {
  const el = document.getElementById('status');
  el.innerText = text;
  el.style.color = color || 'black';
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