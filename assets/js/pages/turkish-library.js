import { getCachedEntries } from "../core/dictionary-cache.js";

const entries = document.getElementById("libraryEntries");
const input = document.getElementById("librarySearchInput");
const form = document.getElementById("librarySearchForm");
const count = document.getElementById("libraryCount");
const toolbar = document.getElementById("libraryToolbar");
const filterButton = document.getElementById("filterButton");
const filterMenu = document.getElementById("filterMenu");
const backButton = document.getElementById("backButton");
const previewLibraryButton =
  document.getElementById("previewLibraryButton");
let words = [];
let sortMode = "newest";
let activeQuery = "";
let libraryScrollY = 0;

backButton.addEventListener("click", () => {
  window.location.href = "./dictionary.html";
});

previewLibraryButton.addEventListener("click", () => {
  window.location.href =
    "./turkish-library.html?preview=15";
});

function render() {
  const query = activeQuery;
  toolbar.hidden = !words.length;
  const visible = words
    .filter((word) => !query || word.word.toLocaleLowerCase("tr-TR") === query)
    .sort((a, b) => {
      if (sortMode === "alphabetical") {
        return a.word.localeCompare(
          b.word,
          "tr",
          { sensitivity: "base" }
        );
      }

      return sortMode === "newest"
        ? b.id - a.id
        : a.id - b.id;
    });

  count.textContent =
    `${visible.length} ${
      visible.length === 0 || visible.length === 1
        ? "word"
        : "words"
    }`;

  entries.innerHTML = visible.length
    ? visible.map((word) => {
    const meanings = word.turkish_meanings || [];
    const previewMeanings = meanings.slice(0, 3);
    const pronunciation = Array.isArray(word.pronunciation)
      ? word.pronunciation
        .map((item) => item.ipa || "")
        .filter(Boolean)
        .join(" · ")
      : "";
    const formGroups = Array.isArray(word.forms) ? word.forms : [];
    const hasForms = formGroups.some(
      (group) =>
        Array.isArray(group.forms) &&
        group.forms.length > 0
    );
    return `
      <details
        class="wiki-entry-card library-entry-card"
        data-library-word="${escapeHtml(word.word)}"
      >
        <summary>
          <span class="library-summary-heading">
            <strong>${escapeHtml(word.word)}</strong>
            ${
              pronunciation
                ? `<small class="library-pronunciation">${escapeHtml(pronunciation)}</small>`
                : ""
            }
          </span>
          <span class="library-meaning-preview">
            ${
              previewMeanings.map((meaning) => `
                <span>
                  ${escapeHtml(meaning.meaning || "")}
                </span>
              `).join("")
            }
          </span>
        </summary>
        <div class="library-entry-details">
          ${renderSavedMeanings(meanings)}
          ${hasForms ? `<section class="wiki-entry-section">
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
      }).join("")
    : `
      <div class="library-empty-state">
        ${
          query
            ? `
              <p>
                No saved word found for
                <em>${escapeHtml(query)}</em>.
              </p>
              <small>
                Search this word on Wiktionary to add it to your library.
              </small>
            `
            : `
              <p>Your library is empty.</p>
              <small>
                Search a word on Wiktionary to add it to your library.
              </small>
            `
        }
        <button
          type="button"
          class="wiki-search-button library-wiktionary-button"
          data-search-wiktionary="${escapeHtml(query)}"
          ${query ? "" : "hidden"}
        >
          Search on Wiktionary
        </button>
        <button
          type="button"
          class="library-clear-search-button"
          data-clear-library-search
          aria-label="Clear library search"
          title="Clear search"
          ${query ? "" : "hidden"}
        >
          ×
        </button>
      </div>
    `;
}

entries.addEventListener("click", (event) => {
  const button =
    event.target.closest("[data-search-wiktionary]");
  const clearButton =
    event.target.closest("[data-clear-library-search]");

  if (button) {
    const word = button.dataset.searchWiktionary;
    window.location.href =
      `./wiktionary-search.html?word=${encodeURIComponent(word)}`;
    return;
  }

  if (clearButton) {
    activeQuery = "";
    input.value = "";
    render();
    window.requestAnimationFrame(
      () => window.scrollTo(
        0,
        libraryScrollY
      )
    );
  }
});

function renderSavedMeanings(meanings) {
  if (!meanings.length) {
    return "";
  }

  const groups = meanings.reduce(
    (result, meaning) => {
      const key =
        meaning.part_of_speech || "Other";
      (result[key] ||= []).push(meaning);
      return result;
    },
    {}
  );

  return Object.entries(groups).map(
    ([partOfSpeech, groupMeanings]) => `
      <section class="wiki-pos-section">
        <div class="wiki-pos-title">
          ${escapeHtml(partOfSpeech)}
        </div>
        <div class="wiki-pos-subsection wiki-meanings-section">
          <h3>Meanings</h3>
          ${groupMeanings.map((meaning) => `
            <div class="wiki-meaning-block">
              <div class="wiki-meaning-row">
                <span class="wiki-meaning-number">
                  ${meaning.position || ""}
                </span>
                <span class="wiki-meaning-text">
                  ${escapeHtml(meaning.meaning || "")}
                </span>
              </div>
              ${formatExamples(meaning.examples)}
            </div>
          `).join("")}
        </div>
      </section>
    `
  ).join("");
}

function formatForms(forms) {
  if (!Array.isArray(forms) || !forms.length) {
    return "—";
  }

  return `
    <div class="library-form-list">
      ${forms.flatMap((group) =>
        (group.forms || []).map((form) => `
          <div class="library-form-row">
            <small>${escapeHtml(form.label || "")}</small>
            <strong>${escapeHtml(form.value || "")}</strong>
          </div>
        `)
      ).join("")}
    </div>
  `;
}

function formatExamples(examples) {
  if (!Array.isArray(examples) || !examples.length) {
    return "";
  }

  return `
    <div class="library-examples">
      ${examples.map((example) => {
        const source =
          typeof example === "string"
            ? example
            : example?.source || "";
        const translation =
          typeof example === "string"
            ? ""
            : example?.translation || "";

        return `
          <p>
            ${escapeHtml(source)}
            ${translation ? `<small>${escapeHtml(translation)}</small>` : ""}
          </p>
        `;
      }).join("")}
    </div>
  `;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
    '"': "&quot;", "'": "&#39;"
  }[char]));
}

function createPreviewWords() {
  const samples = [
    ["akarsu", "stream", "noun", "akarsuya"],
    ["belik", "small sign", "noun", "belikler"],
    ["çevrik", "turned over", "adjective", "çevrik"],
    ["düşünmek", "to think", "verb", "düşünüyor"],
    ["esinti", "breeze", "noun", "esintiler"],
    ["gölgeli", "shaded", "adjective", "gölgeli"],
    ["ışımak", "to shine", "verb", "ışıyor"],
    ["kıyıdaş", "coastal neighbor", "noun", "kıyıdaşlar"],
    ["meraklı", "curious", "adjective", "meraklı"],
    ["oynak", "playful", "adjective", "oynak"],
    ["pırıltı", "sparkle", "noun", "pırıltılar"],
    ["serinlik", "coolness", "noun", "serinlik"],
    ["tınlamak", "to sound", "verb", "tınlıyor"],
    ["uyumlu", "harmonious", "adjective", "uyumlu"],
    ["yolculuk", "journey", "noun", "yolculuklar"]
  ];

  return samples.map(
    ([word, meaning, partOfSpeech, plural], index) => ({
      id: index + 1,
      word,
      etymology: 1,
      pronunciation: [
        { ipa: `/${word}/` }
      ],
      forms: [
        {
          part_of_speech: partOfSpeech,
          forms: [
            { label: "plural", value: plural }
          ]
        }
      ],
      notes: [
        { text: "Preview note only" }
      ],
      analysis: `Preview etymology for ${word}.`,
      base_word_id: null,
      alternative_forms: null,
      turkish_meanings: [
        {
          part_of_speech: partOfSpeech,
          position: 1,
          meaning,
          examples: [
            {
              source: `Bu bir ${word} örneğidir.`,
              translation: `This is a ${word} example.`
            }
          ]
        },
        {
          part_of_speech: partOfSpeech,
          position: 2,
          meaning: `A second preview meaning of ${word}.`,
          examples: []
        },
        {
          part_of_speech: partOfSpeech,
          position: 3,
          meaning: `A third preview meaning of ${word}.`,
          examples: []
        }
      ]
    })
  );
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  libraryScrollY = window.scrollY;
  activeQuery =
    input.value
      .trim()
      .toLocaleLowerCase("tr-TR");
  input.value = "";
  render();

  if (
    activeQuery &&
    document.documentElement.scrollHeight >
      window.innerHeight + 1
  ) {
    window.requestAnimationFrame(
      () => {
        const matchingCard =
          Array.from(
            entries.querySelectorAll(
              "[data-library-word]"
            )
          ).find(
            (card) =>
              card.dataset.libraryWord ===
              activeQuery
          );

        matchingCard?.scrollIntoView({
          behavior: "smooth",
          block: "center"
        });
      }
    );
  }
});

filterButton.addEventListener("click", (event) => {
  event.stopPropagation();
  filterMenu.hidden = !filterMenu.hidden;
  filterButton.setAttribute(
    "aria-expanded",
    String(!filterMenu.hidden)
  );
});

filterMenu.addEventListener("click", (event) => {
  const option = event.target.closest("[data-sort]");
  if (!option) {
    return;
  }

  sortMode = option.dataset.sort;
  filterMenu.hidden = true;
  filterButton.setAttribute("aria-expanded", "false");
  render();
});

document.addEventListener("click", () => {
  filterMenu.hidden = true;
  filterButton.setAttribute("aria-expanded", "false");
});

const previewLimit = Number(
  new URLSearchParams(
    window.location.search
  ).get("preview")
);

const result =
  previewLimit > 0
    ? { data: createPreviewWords(), error: null }
    : {
        data: await getCachedEntries("turkish"),
        error: null
      };

if (result.error) {
  entries.textContent = result.error.message;
} else {
  words = result.data || [];
  render();
}
