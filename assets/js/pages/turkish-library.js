import { turkishDb } from "../core/supabase.js";
import { clearCachedEntries } from "../core/dictionary-cache.js";

const entries = document.getElementById("libraryEntries");
const input = document.getElementById("librarySearchInput");
const form = document.getElementById("librarySearchForm");
const count = document.getElementById("libraryCount");
const sortButton = document.getElementById("sortButton");
const deleteAllButton = document.getElementById("deleteAllButton");
const backButton = document.getElementById("backButton");
let words = [];
let descending = true;

backButton.addEventListener("click", () => {
  window.location.href = "./dictionary.html";
});

function render() {
  const query = input.value.trim().toLocaleLowerCase("tr-TR");
  const visible = words
    .filter((word) => !query || word.word.toLocaleLowerCase("tr-TR") === query)
    .sort((a, b) => descending ? b.id - a.id : a.id - b.id);

  count.textContent = `${visible.length} word${visible.length === 1 ? "" : "s"}`;
  entries.innerHTML = visible.map((word) => {
    const meanings = word.turkish_meanings || [];
    const firstMeaning = meanings[0]?.meaning || "";
    const formGroups = Array.isArray(word.forms) ? word.forms : [];
    return `
      <details class="wiki-entry-card library-entry-card">
        <summary>
          <strong>${escapeHtml(word.word)}</strong>
          <small>ID ${word.id}</small>
          <span>${escapeHtml(meanings[0]?.part_of_speech || "")}</span>
          <span>${escapeHtml(firstMeaning)}</span>
        </summary>
        <div class="library-entry-details">
          <div class="wiki-etymology">WORD ${word.etymology} · ID ${word.id}</div>
          ${meanings.map((meaning) => `
            <section class="wiki-entry-section">
              <h3>${escapeHtml(meaning.part_of_speech || "")}</h3>
              <p>${escapeHtml(meaning.meaning || "")}</p>
            </section>
          `).join("")}
          ${formGroups.length ? `<section class="wiki-entry-section">
            <h3>Forms</h3>
            <p>${formatForms(formGroups)}</p>
          </section>` : ""}
          ${Array.isArray(word.pronunciation) && word.pronunciation.length ? `
            <section class="wiki-entry-section">
              <h3>Pronunciation</h3>
              <p>${escapeHtml(word.pronunciation.map((item) => item.ipa || "").filter(Boolean).join(" · "))}</p>
            </section>
          ` : ""}
          ${Array.isArray(word.notes) && word.notes.length ? `
            <section class="wiki-entry-section">
              <h3>Notes</h3>
              <p>${escapeHtml(word.notes.map((item) => item.text || "").filter(Boolean).join(" · "))}</p>
            </section>
          ` : ""}
          ${word.analysis ? `
            <section class="wiki-entry-section">
              <h3>Analysis</h3>
              <p>${escapeHtml(word.analysis)}</p>
            </section>
          ` : ""}
        </div>
      </details>
    `;
  }).join("") || "<p>No word found.</p>";
}

deleteAllButton.addEventListener("click", async () => {
  if (!words.length || !confirm("Delete all Turkish words?")) {
    return;
  }

  deleteAllButton.disabled = true;
  const { error } = await turkishDb.rpc(
    "delete_all_turkish_words"
  );

  if (error) {
    alert(error.message);
    deleteAllButton.disabled = false;
    return;
  }

  await clearCachedEntries("turkish");
  words = [];
  render();
  deleteAllButton.disabled = false;
});

function formatForms(forms) {
  if (!Array.isArray(forms) || !forms.length) {
    return "—";
  }

  return forms.map((group) => {
    const values = (group.forms || [])
      .map((form) =>
        `${form.label || ""}: ${form.value || ""}`
      )
      .join(" · ");
    return `${group.part_of_speech || ""}: ${values}`;
  }).map(escapeHtml).join("<br />");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
    '"': "&quot;", "'": "&#39;"
  }[char]));
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  render();
});

sortButton.addEventListener("click", () => {
  descending = !descending;
  sortButton.textContent =
    descending ? "Newest first" : "Oldest first";
  render();
});

const { data, error } = await turkishDb
  .from("turkish_words")
  .select("id, word, etymology, pronunciation, forms, notes, analysis, base_word_id, alternative_forms, turkish_meanings(part_of_speech, position, usage_label, meaning, examples)")
  .order("id", { ascending: false });

if (error) {
  entries.textContent = error.message;
} else {
  words = data || [];
  render();
}
