
export async function loadModels() {
    const modelSelect = document.getElementById('modelSelect');
    if (!modelSelect) return;

    // modelSelect.innerHTML = '<option>Loading...</option>'; // Don't wipe if refreshing nicely

    try {
        const models = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ type: 'get_models' }, (response) => {
                if (response && response.models) resolve(response.models);
                else reject(new Error('Failed to get models'));
            });
        });

        modelSelect.innerHTML = models.map(model =>
            `<option value="${model.id}" data-caps='${JSON.stringify(model.capabilities || [])}'>${model.name} (${model.id})</option>`
        ).join('');

        // Restore last selected
        const prev = localStorage.getItem('lastModel');
        if (prev && models.find(m => m.id === prev)) modelSelect.value = prev;

        // Trigger change to update UI state
        modelSelect.dispatchEvent(new Event('change'));

    } catch (e) {
        console.error('Error loading models:', e);
        modelSelect.innerHTML = '<option value="">Error loading models</option>';
    }
}

export function initChat() {
    const sendBtn = document.getElementById('chatSend');
    const input = document.getElementById('chatInput');
    const modelSelect = document.getElementById('modelSelect');

    if (!sendBtn || !input || !modelSelect) {
        console.error('Chat elements not found', { sendBtn, input, modelSelect });
        return;
    }

    let currentImage = null; // Base64 string if attached
    let conversationHistory = []; // Array of {role: 'user'|'assistant', content: string|array}

    // Controls Container
    const controls = document.createElement('div');
    controls.className = 'chat-controls';
    controls.style.display = 'flex';
    controls.style.alignItems = 'center';
    controls.style.gap = '4px';
    sendBtn.parentNode.insertBefore(controls, sendBtn);
    sendBtn.parentNode.removeChild(sendBtn); // Move send button into controls

    // 1. Refresh Models Button (LEFT of Select)
    // We need to move the refresh button logic here or create it if not exists
    // The select is in `chatBody` > `modelSelect` (which is below the input row in original HTML)
    // Actually in the original HTML `modelSelect` is at the bottom.
    // Let's create a container for the model select line.

    const settingsRow = document.createElement('div');
    settingsRow.style.display = 'flex';
    settingsRow.style.gap = '4px';
    settingsRow.style.marginTop = '8px';
    settingsRow.style.alignItems = 'center';
    modelSelect.parentNode.insertBefore(settingsRow, modelSelect);
    settingsRow.appendChild(modelSelect); // Move select into row

    const refreshBtn = document.createElement('button');
    refreshBtn.innerHTML = '🔄';
    refreshBtn.title = "Refresh Models";
    refreshBtn.style.padding = '6px';
    refreshBtn.onclick = loadModels;
    settingsRow.insertBefore(refreshBtn, modelSelect); // Insert BEFORE select

    // 2. Image Generation Button
    const genBtn = document.createElement('button');
    genBtn.textContent = '🎨';
    genBtn.title = "Generate Image";
    genBtn.onclick = () => {
        const prompt = input.value.trim();
        if (!prompt) return alert('Enter a prompt first');
        input.value = '';
        addMessage('user', prompt + ' (Image Request)');
        addMessage('assistant', '🎨 Generating image...', { pending: true });

        chrome.runtime.sendMessage({ type: 'image_request', prompt: prompt }, (response) => {
            document.querySelector('.message.pending')?.remove();
            if (response && response.imageUrl) {
                addMessage('assistant', `<img src="${response.imageUrl}" style="max-width:100%;border-radius:8px">`, { isHtml: true });
            } else {
                addMessage('assistant', 'Error: ' + (response.error || 'Unknown error'));
            }
        });
    };

    // 3. Attach Image Button
    const attachBtn = document.createElement('button');
    attachBtn.textContent = '📎';
    attachBtn.title = "Attach Image";
    const fileInp = document.createElement('input');
    fileInp.type = 'file'; fileInp.accept = 'image/*'; fileInp.style.display = 'none';
    attachBtn.onclick = () => fileInp.click();

    // 4. Voice Button
    const micBtn = document.createElement('button');
    micBtn.textContent = '🎤';
    micBtn.title = "Voice Input";
    let isRecording = false;
    let mediaRecorder; let audioChunks = [];

    micBtn.onclick = async () => {
        if (!isRecording) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                mediaRecorder = new MediaRecorder(stream);
                mediaRecorder.start();
                isRecording = true;
                micBtn.style.background = '#ff4444';
                micBtn.textContent = '⏹';
                audioChunks = [];
                mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
                mediaRecorder.onstop = async () => {
                    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                    const reader = new FileReader();
                    reader.readAsDataURL(audioBlob);
                    reader.onloadend = () => {
                        const base64data = reader.result;
                        addMessage('assistant', '🎧 Transcribing...', { pending: true });
                        chrome.runtime.sendMessage({ type: 'audio_request', audioBlob: base64data }, (res) => {
                            document.querySelector('.message.pending')?.remove();
                            if (res.text) input.value += (input.value ? ' ' : '') + res.text;
                            else alert('Transcription failed');
                        });
                    };
                    stream.getTracks().forEach(t => t.stop());
                };
            } catch (e) { alert('Mic permission denied'); }
        } else {
            mediaRecorder.stop();
            isRecording = false;
            micBtn.style.background = '';
            micBtn.textContent = '🎤';
        }
    };

    // Preview for attached image
    const previewDiv = document.createElement('div');
    previewDiv.id = 'imgPreview';
    previewDiv.style.display = 'none';
    previewDiv.style.padding = '4px';
    previewDiv.style.fontSize = '11px';
    previewDiv.style.color = 'var(--accent)';
    input.parentNode.insertBefore(previewDiv, input);

    fileInp.onchange = () => {
        if (fileInp.files && fileInp.files[0]) {
            const reader = new FileReader();
            reader.readAsDataURL(fileInp.files[0]);
            reader.onload = () => {
                currentImage = reader.result;
                previewDiv.textContent = `Attached: ${fileInp.files[0].name} (Click Send to include)`;
                previewDiv.style.display = 'block';
                attachBtn.style.color = 'var(--accent)';
            };
        }
    };

    // Replace old layout
    controls.appendChild(attachBtn);
    controls.appendChild(micBtn);
    controls.appendChild(genBtn);
    controls.appendChild(sendBtn);

    // Filter Logic
    const updateCaps = () => {
        const opt = modelSelect.options[modelSelect.selectedIndex];
        if (!opt) return;
        const caps = JSON.parse(opt.dataset.caps || '["text"]');

        // Vision check
        if (caps.includes('image')) {
            attachBtn.disabled = false;
            attachBtn.style.opacity = '1';
            attachBtn.title = "Attach Image";
        } else {
            attachBtn.disabled = true;
            attachBtn.style.opacity = '0.3';
            attachBtn.title = "Model does not support images";
            // Check if we need to clear current attachment
            if (currentImage) {
                currentImage = null;
                fileInp.value = '';
                previewDiv.style.display = 'none';
                attachBtn.style.color = '';
            }
        }

        localStorage.setItem('lastModel', modelSelect.value);
    };

    modelSelect?.addEventListener('change', updateCaps);

    const doSend = () => {
        const message = input.value.trim();
        if (!message && !currentImage) return;
        input.value = '';
        previewDiv.style.display = 'none';
        attachBtn.style.color = '';

        const modelId = modelSelect.value;
        const modelName = modelSelect.options[modelSelect.selectedIndex]?.text || modelId;

        // Show User Message
        let userHtml = message;
        if (currentImage) userHtml += `<br><img src="${currentImage}" style="max-height:100px;border-radius:4px;margin-top:4px">`;
        addMessage('user', userHtml, { isHtml: !!currentImage });

        addMessage('assistant', 'Thinking...', { pending: true, model: modelName });

        // Prepare User Message Content for History
        let userContent = message;
        if (currentImage) {
            userContent = [
                { type: "text", text: message },
                { type: "image_url", image_url: { url: currentImage } }
            ];
        }

        // Add to history
        conversationHistory.push({ role: 'user', content: userContent });

        // Build Payload
        const payload = {
            type: 'chat_request',
            model: modelId,
            history: conversationHistory // Send full history
        };

        chrome.runtime.sendMessage(payload, (response) => {
            const pending = document.querySelector('.message.pending');
            if (pending) pending.remove();

            if (response && response.text) {
                let text = response.text;
                conversationHistory.push({ role: 'assistant', content: text }); // Add response to history

                let isHtml = false;
                // Handle <think> blocks from reasoning models
                if (text.includes('<think>')) {
                    text = text.replace(/<think>([\s\S]*?)<\/think>/g,
                        '<details class="thinking"><summary>Thought Process</summary><div class="think-content">$1</div></details>');
                    isHtml = true;
                }
                addMessage('assistant', text, { model: modelName, isHtml: isHtml });
            } else {
                // On error, remove the last user message from history so they can retry? 
                // Or just leave it. Let's leave it for now but maybe warn.
                conversationHistory.pop(); // Remove failed user message to allow retry without dupes
                addMessage('assistant', 'Error: ' + (response.error || 'Unknown error'));
            }
        });

        currentImage = null;
        fileInp.value = '';
    };

    if (sendBtn) sendBtn.addEventListener('click', doSend);

    if (input) {
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                if (!e.shiftKey) {
                    e.preventDefault(); // Prevent newline
                    doSend();
                }
                // else: allow default behavior (newline)
            }
        });
    }
}

function addMessage(role, content, metadata = {}) {
    const chatMessages = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role} ${metadata.pending ? 'pending' : ''}`;

    // Metadata Header
    const metaDiv = document.createElement('div');
    metaDiv.className = 'msg-meta';
    const name = role === 'user' ? 'You' : (metadata.model ? `AI (${metadata.model})` : 'AI');
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    metaDiv.textContent = `${name} • ${time}`;

    // Content
    const contentDiv = document.createElement('div');
    contentDiv.className = 'msg-content';
    contentDiv.dir = 'auto'; // Enable automatic RTL/LTR detection
    if (metadata.isHtml) contentDiv.innerHTML = content;
    else contentDiv.textContent = content;

    messageDiv.appendChild(metaDiv);
    messageDiv.appendChild(contentDiv);

    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}
