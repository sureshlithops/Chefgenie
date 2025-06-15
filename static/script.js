// 🎤 Voice Recognition
const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
recognition.continuous = true;
recognition.interimResults = true;
recognition.lang = 'en-US';

// DOM Elements
const micButton = document.getElementById('micButton');
const statusDiv = document.getElementById('status');
const resultDiv = document.getElementById('result');
const offlineNotice = document.getElementById('offlineNotice');
const installBtn = document.getElementById('installBtn');
const recipeInput = document.getElementById('recipeInput');
const textSubmit = document.getElementById('textSubmit');

// App State
let isListening = false;
let wakeWordDetected = false;
let deferredPrompt = null;
let localRecipes = {}; // 🔹 Loaded from recipes.json

function isOffline() {
  return !navigator.onLine;
}

// 🔁 Load local recipes on startup
fetch('/static/recipes.json')
  .then(res => res.json())
  .then(data => {
    localRecipes = data;
    console.log("✅ Local recipes loaded");
  });

// 🔍 Search local recipes
function getLocalRecipe(query) {
  const cleaned = query.toLowerCase().replace("hey chefgenie", "").trim();
  for (let key in localRecipes) {
    if (cleaned.includes(key.toLowerCase()) || key.toLowerCase().includes(cleaned)) {
      return localRecipes[key];
    }
  }
  return null;
}

// 🎤 Toggle microphone
micButton.addEventListener('click', () => {
  if (!isListening) {
    recognition.start();
    micButton.textContent = "🎤 Listening...";
    statusDiv.textContent = "Say 'Hey ChefGenie' to begin";
    isListening = true;
  } else {
    recognition.stop();
    micButton.textContent = "🎤 Enable Microphone";
    statusDiv.textContent = "Microphone off";
    isListening = false;
  }
});

// 🎙️ Handle voice results
recognition.onresult = (event) => {
  let finalTranscript = '';
  for (let i = event.resultIndex; i < event.results.length; ++i) {
    if (event.results[i].isFinal) {
      finalTranscript += event.results[i][0].transcript.toLowerCase();
    }
  }
  if (!finalTranscript) return;

  recognition.onspeechend = () => {
    recognition.stop();
    isListening = false;
    micButton.textContent = "🎤 Enable Microphone";
    statusDiv.textContent = "Microphone inactive.";
  };

  if (["stop", "cancel", "exit"].some(cmd => finalTranscript.includes(cmd))) {
    statusDiv.textContent = "🛑 Conversation stopped.";
    speak("Conversation stopped.");
    recognition.stop();
    isListening = false;
    wakeWordDetected = false;
    micButton.textContent = "🎤 Enable Microphone";
    return;
  }

  if (!wakeWordDetected && finalTranscript.includes('hey chefgenie')) {
    wakeWordDetected = true;
    statusDiv.textContent = "Listening for recipe request...";
    speak("How can I help?");
    return;
  }

  if (wakeWordDetected) {
    if (finalTranscript.includes('stop')) {
      wakeWordDetected = false;
      statusDiv.textContent = "Say 'Hey ChefGenie' to begin";
      speak("Goodbye!");
    } else {
      const cleanedCommand = finalTranscript.replace('hey chefgenie', '').trim();
      processRecipeRequest(cleanedCommand);
      wakeWordDetected = false;
    }
  }
};

// 🗣️ Speak out loud
function speak(text) {
  const utterance = new SpeechSynthesisUtterance(text);
  window.speechSynthesis.speak(utterance);
}

// 📝 Handle text input
textSubmit.addEventListener('click', () => {
  const userText = recipeInput.value.trim().toLowerCase();
  if (!userText) return;

  processRecipeRequest(userText);
});

recipeInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') textSubmit.click();
});

// 🧾 Display multiple recipes (used for local fallback)
function displayRecipes(recipes) {
  resultDiv.innerHTML = ''; // Clear previous content

  if (recipes.length === 0) {
    resultDiv.innerHTML = '<div class="error-card">❌ No recipes found.</div>';
    speak("No recipes found.");
    return;
  }

  recipes.forEach(recipe => {
    const card = document.createElement('div');
    card.className = 'recipe-card';

    card.innerHTML = `
      <h2>${recipe.name}</h2>
      <div class="recipe-section">
        <h3>🧂 Ingredients:</h3>
        <ul>
          ${recipe.ingredients.map(i => `<li>${i}</li>`).join('')}
        </ul>
      </div>
      <div class="recipe-section">
        <h3>👨‍🍳 Instructions:</h3>
        <ol>
          ${(recipe.steps || recipe.instructions || []).map(s => `<li>${s}</li>`).join('')}
        </ol>
      </div>
    `;

    resultDiv.appendChild(card);
  });

  speak(`${recipes.length} recipes found`);
}

// 📡 Process recipe request (Hybrid)
function processRecipeRequest(text) {
  const localMatch = getLocalRecipe(text);
  if (localMatch) {
    displayRecipes([localMatch]);
    speak(`Here's the recipe for ${localMatch.name}`);
    return;
  }

  if (isOffline()) {
    resultDiv.innerHTML = '<div class="error-card">⚠️ You are offline. No matching local recipe found.</div>';
    speak("You are offline. And I couldn’t find a local match.");
    return;
  }

  statusDiv.textContent = `Fetching recipe for: "${text}"`;
  fetch('/process', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  })
    .then(res => res.json())
    .then(data => {
      if (data.stopped) {
        statusDiv.textContent = data.message;
        speak(data.message);
        micButton.textContent = "🎤 Enable Microphone";
        isListening = false;
        wakeWordDetected = false;
        recognition.stop();
        return;
      }

      if (data.recipe) {
        const recipe = data.recipe;
        resultDiv.innerHTML = `
          <div class="recipe-card">
            <h2>${recipe.title}</h2>

            <div class="section">
              <h3>🧂 Ingredients</h3>
              <ul>${recipe.ingredients.map(i => `<li>${i}</li>`).join('')}</ul>
            </div>

            <div class="section">
              <h3>👨‍🍳 Steps</h3>
              <ol>${recipe.steps.map(s => `<li>${s}</li>`).join('')}</ol>
            </div>

            <div class="section">
              <h3>🧬 Nutrition</h3>
              <ul>${Object.entries(recipe.nutrition).map(([k, v]) => `<li><strong>${k}:</strong> ${v}</li>`).join('')}</ul>
            </div>
          </div>
        `;
        speak(`Here's the recipe for ${recipe.title}`);
      } else {
        resultDiv.innerHTML = `<div class="error-card">❌ ${data.error || "No recipe found."}</div>`;
        speak(data.error || "No recipe found.");
      }
    })
    .catch(err => {
      console.error(err);
      resultDiv.innerHTML = '<div class="error-card">⚠️ Failed to connect to server.</div>';
      speak("Couldn't connect to the server.");
    });
}

// 📦 Register Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js');

    if (!navigator.onLine && Object.keys(localRecipes).length > 0) {
      const list = Object.values(localRecipes);
      displayRecipes(list);
    }
  });
}

// 📱 Handle PWA Install Prompt
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  installBtn.classList.remove('hidden');
});

installBtn.addEventListener('click', () => {
  installBtn.classList.add('hidden');
  if (deferredPrompt) {
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(choice => {
      if (choice.outcome === 'accepted') deferredPrompt = null;
    });
  }
});

// 🌐 Offline Notice
window.addEventListener('online', () => offlineNotice.classList.add('hidden'));
window.addEventListener('offline', () => offlineNotice.classList.remove('hidden'));
if (!navigator.onLine) offlineNotice.classList.remove('hidden');

// 🛠️ Handle errors
recognition.onerror = (event) => {
  statusDiv.textContent = `Error: ${event.error}`;
};
