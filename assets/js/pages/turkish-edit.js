import { turkishDb } from "../core/supabase.js";
import {
  findCachedBaseWords,
  getCachedEntries,
  cacheEntries
} from "../core/dictionary-cache.js";

const id =
  Number(
    new URLSearchParams(window.location.search).get("id")
  );

const wordInput = document.getElementById("wordInput");
const analysisInput = document.getElementById("analysisInput");
const pronunciationInput = document.getElementById("pronunciationInput");
const formsInput = document.getElementById("formsInput");
const notesInput = document.getElementById("notesInput");
const meaningsInput = document.getElementById("meaningsInput");
const baseWordInput = document.getElementById("baseWordInput");
const baseWordSearchButton = document.getElementById("baseWordSearchButton");
const baseWordResults = document.getElementById("baseWordResults");
const form = document.getElementById("wordEditorForm");
const status = document.getElementById("editorStatus");

let currentWord = null;
let baseWordId = null;

function showStatus(message, type = "") {
  status.textContent = message;
  status.className = `wiki-status ${type}`;
  status.hidden = false;
}

function parseLines(value) {
  return String(value || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseMeanings(value) {
  return parseLines(value).map((line, index) => {
    const separator = line.indexOf("|");
    const partOfSpeech =
      separator >= 0
        ? line.slice(0, separator).trim()
        : "other";
    const meaning =
      separator >= 0
        ? line.slice(separator + 1).trim()
        : line;

    return {
      part_of_speech: partOfSpeech || "other",
      position: index + 1,
      usage_label: null,
      meaning,
      examples: null
    };
  });
}

function parseForms(value) {
  const groups = {};

  parseLines(value).forEach((line) => {
    const separator = line.indexOf("=");
    if (separator < 1) {
      return;
    }

    const label = line.slice(0, separator).trim();
    const formValue = line.slice(separator + 1).trim();
    const partOfSpeech = "general";

    groups[partOfSpeech] ||= [];
    groups[partOfSpeech].push({
      label,
      value: formValue,
      selected: true
    });
  });

  return Object.entries(groups).map(
    ([partOfSpeech, forms]) => ({
      part_of_speech: partOfSpeech,
      forms
    })
  );
}

function fillEditor(word) {
  currentWord = word;
  wordInput.value = word.word || "";
  analysisInput.value = word.analysis || "";
  pronunciationInput.value = (word.pronunciation || [])
    .map((item) => item.ipa || "")
    .filter(Boolean)
    .join("\n");
  formsInput.value = (word.forms || [])
    .flatMap((group) => group.forms || [])
    .map((item) => `${item.label || ""}=${item.value || ""}`)
    .join("\n");
  notesInput.value = (word.notes || [])
    .map((item) => item.text || "")
    .filter(Boolean)
    .join("\n");
  meaningsInput.value = (word.turkish_meanings || [])
    .map((meaning) =>
      `${meaning.part_of_speech || "other"} | ${meaning.meaning || ""}`
    )
    .join("\n");
  baseWordId = word.base_word_id || null;
  baseWordInput.value = "";
}

baseWordSearchButton.addEventListener("click", async () => {
  const query = baseWordInput.value.trim();
  baseWordResults.innerHTML = "";

  if (!query) {
    return;
  }

  const matches = await findCachedBaseWords(query);
  if (!matches.length) {
    baseWordResults.textContent =
      `A palavra "${query}" não consta na nossa biblioteca.`;
    baseWordId = null;
    return;
  }

  matches.forEach((match) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = match.word;
    button.addEventListener("click", () => {
      baseWordId = Number(match.id);
      baseWordInput.value = match.word;
      baseWordResults.innerHTML = "";
    });
    baseWordResults.appendChild(button);
  });
});

document.getElementById("backButton").addEventListener("click", () => {
  window.location.href = "./turkish-library.html";
});

document.getElementById("cancelButton").addEventListener("click", () => {
  window.location.href = "./turkish-library.html";
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const meanings = parseMeanings(meaningsInput.value);

  if (!meanings.length) {
    showStatus("At least one meaning is required.", "error");
    return;
  }

  const payload = {
    id,
    word: wordInput.value.trim(),
    pronunciation: parseLines(pronunciationInput.value)
      .map((ipa) => ({ ipa })),
    forms: parseForms(formsInput.value),
    notes: parseLines(notesInput.value)
      .map((text) => ({ text })),
    analysis: analysisInput.value.trim() || null,
    base_word_id: baseWordId,
    alternative_forms: currentWord?.alternative_forms || null,
    meanings
  };

  const { error } = await turkishDb.rpc(
    "update_turkish_word",
    { p_word: payload }
  );

  if (error) {
    showStatus(error.message, "error");
    return;
  }

  await cacheEntries("turkish", [{
    ...currentWord,
    ...payload,
    turkish_meanings: meanings,
    etymology: currentWord.etymology
  }]);

  window.location.href = "./turkish-library.html";
});

const cachedWords =
  await getCachedEntries("turkish");

const selectedWord =
  cachedWords.find(
    (word) => Number(word.id) === id
  );

if (!selectedWord) {
  showStatus("Word not found in the local library.", "error");
} else {
  fillEditor(selectedWord);
}
