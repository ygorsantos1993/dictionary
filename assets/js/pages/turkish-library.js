import { supabase } from "../core/supabase.js";

const entries = document.getElementById("libraryEntries");
const input = document.getElementById("librarySearchInput");
const form = document.getElementById("librarySearchForm");
const count = document.getElementById("libraryCount");
const sortButton = document.getElementById("sortButton");
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
    return `
      <details class="wiki-entry-card library-entry-card">
        <summary>
          <strong>${escapeHtml(word.word)}</strong>
          <span>${escapeHtml(firstMeaning)}</span>
        </summary>
        <div class="library-entry-details">
          <small>ID ${word.id} · WORD ${word.etymology}</small>
          ${meanings.map((meaning) => `
            <section class="wiki-entry-section">
              <h3>${escapeHtml(meaning.part_of_speech || "")}</h3>
              <p>${escapeHtml(meaning.meaning || "")}</p>
            </section>
          `).join("")}
          <small>Forms: ${escapeHtml(JSON.stringify(word.forms || []))}</small>
          <small>Analysis: ${escapeHtml(word.analysis || "")}</small>
          <small>Base word: ${escapeHtml(word.base_word_text || "")}</small>
        </div>
      </details>
    `;
  }).join("") || "<p>No word found.</p>";
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

const { data, error } = await supabase
  .from("turkish_words")
  .select("id, word, etymology, pronunciation, forms, notes, analysis, base_word_text, base_word_id, alternative_forms, turkish_meanings(part_of_speech, position, usage_label, meaning, examples)")
  .order("id", { ascending: false });

if (error) {
  entries.textContent = error.message;
} else {
  words = data || [];
  render();
}
