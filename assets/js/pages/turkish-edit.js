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
const wordDisplay = document.getElementById("wordDisplay");
const analysisInput = document.getElementById("analysisInput");
const pronunciationFields = document.getElementById("pronunciationFields");
const formsFields = document.getElementById("formsFields");
const notesFields = document.getElementById("notesFields");
const meaningsFields = document.getElementById("meaningsFields");
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

function addField(container, values, fields, placeholders) {
  const row = document.createElement("div");
  row.className = "editor-item-row";
  row.innerHTML = fields.map((field, index) =>
    `<input data-field="${field}" placeholder="${placeholders[index] || ""}"
      value="${String(values?.[field] || "").replaceAll('"', "&quot;")}" />`
  ).join("");
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = true;
  checkbox.className = "editor-item-enabled";
  row.prepend(checkbox);
  container.appendChild(row);
  return row;
}

function enabledRows(container) {
  return [...container.querySelectorAll(".editor-item-row")]
    .filter((row) => row.querySelector(".editor-item-enabled").checked);
}

function readFieldRows(container, fields) {
  return enabledRows(container).map((row) => {
    const result = {};
    fields.forEach((field) => {
      result[field] = row.querySelector(`[data-field="${field}"]`).value.trim();
    });
    return result;
  });
}

function fillEditor(word) {
  currentWord = word;
  wordInput.value = word.word || "";
  wordDisplay.textContent = word.word || "";
  analysisInput.value = word.analysis || "";
  (word.pronunciation || []).forEach((item) =>
    addField(pronunciationFields, item, ["ipa"], ["IPA"]));
  (word.forms || []).flatMap((group) => group.forms || []).forEach((item) =>
    addField(formsFields, item, ["label", "value"], ["Form", "Value"]));
  (word.notes || []).forEach((item) =>
    addField(notesFields, item, ["text"], ["Note"]));
  (word.turkish_meanings || []).forEach((item) =>
    addField(meaningsFields, item,
      ["part_of_speech", "meaning", "examples"],
      ["Part of speech", "Meaning", "Example"]));
  baseWordId = word.base_word_id || null;
  baseWordInput.value = "";
}

document.querySelector("[data-add-pronunciation]").onclick = () =>
  addField(pronunciationFields, {}, ["ipa"], ["IPA"]);
document.querySelector("[data-add-form]").onclick = () =>
  addField(formsFields, {}, ["label", "value"], ["Form", "Value"]);
document.querySelector("[data-add-note]").onclick = () =>
  addField(notesFields, {}, ["text"], ["Note"]);
document.querySelector("[data-add-meaning]").onclick = () =>
  addField(meaningsFields, {}, ["part_of_speech", "meaning", "examples"],
    ["Part of speech", "Meaning", "Example"]);

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
  const meanings = readFieldRows(meaningsFields,
    ["part_of_speech", "meaning", "examples"])
    .filter((item) => item.meaning)
    .map((item, index) => ({
      ...item,
      position: index + 1,
      usage_label: null,
      examples: item.examples ? [{ text: item.examples }] : null
    }));

  if (!meanings.length) {
    showStatus("At least one meaning is required.", "error");
    return;
  }

  const payload = {
    id,
    word: wordInput.value.trim(),
    pronunciation: readFieldRows(pronunciationFields, ["ipa"])
      .filter((item) => item.ipa),
    forms: [{
      part_of_speech: "general",
      forms: readFieldRows(formsFields, ["label", "value"])
        .filter((item) => item.label && item.value)
    }],
    notes: readFieldRows(notesFields, ["text"])
      .filter((item) => item.text),
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
