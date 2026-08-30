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
  entries.innerHTML = visible.map((word) => `
    <article class="wiki-entry-card">
      <div class="wiki-entry-top">
        <div>
          <div class="wiki-etymology">ID ${word.id} · WORD ${word.etymology}</div>
          <h2>${escapeHtml(word.word)}</h2>
        </div>
      </div>
      ${(word.turkish_meanings || []).slice(0, 3).map((meaning) => `
        <section class="wiki-entry-section">
          <h3>${escapeHtml(meaning.part_of_speech || "")}</h3>
          <p>${escapeHtml(meaning.meaning || "")}</p>
        </section>
      `).join("")}
    </article>
  `).join("") || "<p>No word found.</p>";
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
  sortButton.textContent = `ID: ${descending ? "newest" : "oldest"} first`;
  render();
});

const { data, error } = await supabase
  .from("turkish_words")
  .select("id, word, etymology, turkish_meanings(part_of_speech, meaning)")
  .order("id", { ascending: false });

if (error) {
  entries.textContent = error.message;
} else {
  words = data || [];
  render();
}
