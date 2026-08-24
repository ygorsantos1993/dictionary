import { supabase } from "../../js/supabase.js";

const userEmail =
  document.getElementById("userEmail");

const logoutButton =
  document.getElementById("logoutButton");

const syncButton =
  document.getElementById("syncButton");

const languageButton =
  document.getElementById("languageButton");

const languageMenu =
  document.getElementById("languageMenu");

const currentLanguageFlag =
  document.getElementById("currentLanguageFlag");

const languageOptions =
  document.querySelectorAll(".language-option");

const searchInput =
  document.getElementById("searchInput");

const searchSuggestions =
  document.getElementById("searchSuggestions");

const wordsList =
  document.getElementById("wordsList");

const wordsCountText =
  document.getElementById("wordsCountText");

const browseAllButton =
  document.getElementById("browseAllButton");

const wordDetails =
  document.getElementById("wordDetails");

const wordDetailsEmpty =
  document.getElementById("wordDetailsEmpty");

const detailsPartOfSpeech =
  document.getElementById("detailsPartOfSpeech");

const detailsWord =
  document.getElementById("detailsWord");

const detailsPronunciation =
  document.getElementById("detailsPronunciation");

const detailsWordMeta =
  document.getElementById("detailsWordMeta");

const detailsForms =
  document.getElementById("detailsForms");

const detailsMeanings =
  document.getElementById("detailsMeanings");


const languages = {
  chinese: {
    name: "Chinese",
    flag: "../chinese-flag.png"
  },

  msa: {
    name: "Modern Standard Arabic",
    flag: "../arabic-flag.png"
  },

  turkish: {
    name: "Turkish",
    flag: "../turkish-flag.png"
  }
};


let storedLanguage =
  localStorage.getItem("dictionary_language");

if (storedLanguage === "arabic") {
  storedLanguage = "msa";

  localStorage.setItem(
    "dictionary_language",
    "msa"
  );
}

let currentLanguage =
  languages[storedLanguage]
    ? storedLanguage
    : "turkish";


/*
  CACHE LOCAL FAKE
  Depois vamos trocar por IndexedDB.
*/
const cachedWordsByLanguage = {
  turkish: [
    {
      id: 101,
      word: "kitap",
      pronunciation: "/ciˈtap/",
      part_of_speech: "noun",
      forms: {
        definite_accusative: "kitabı",
        plural: "kitaplar"
      },
      meanings: [
        {
          position: 1,
          meaning: "book",
          usage_label: null,
          examples: [
            "Boş zamanlarında kitap okur musun? ― Do you read books in your free time?"
          ]
        }
      ]
    },
    {
      id: 102,
      word: "küçük",
      pronunciation: "/cyˈtʃyc/",
      part_of_speech: "adjective",
      forms: {
        predicative_stem: "küçüğ"
      },
      meanings: [
        {
          position: 1,
          meaning: "small, little",
          usage_label: null,
          examples: []
        },
        {
          position: 2,
          meaning: "minor, of little importance",
          usage_label: null,
          examples: []
        }
      ]
    },
    {
      id: 103,
      word: "ağaç",
      pronunciation: "/aˈaʧ/",
      part_of_speech: "noun",
      forms: {
        definite_accusative: "ağacı",
        plural: "ağaçlar"
      },
      meanings: [
        {
          position: 1,
          meaning: "tree",
          usage_label: null,
          examples: [
            "Ağaca tırmanmak ― to climb a tree"
          ]
        }
      ]
    },
    {
      id: 104,
      word: "demek",
      pronunciation: "/deˈmek/",
      part_of_speech: "verb",
      forms: {
        aorist: "der",
        past: "dedi",
        present_progressive: "diyor"
      },
      meanings: [
        {
          position: 1,
          meaning: "to say",
          usage_label: null,
          examples: []
        }
      ]
    }
  ],

  msa: [
    {
      id: 201,
      word: "كتب",
      pronunciation: "kataba",
      part_of_speech: "verb",
      forms: {
        perfect: "kataba",
        imperfect: "yaktubu",
        verbal_noun: "kitābah"
      },
      meanings: [
        {
          position: 1,
          meaning: "to write",
          usage_label: null,
          examples: []
        }
      ]
    },
    {
      id: 202,
      word: "كتاب",
      pronunciation: "kitāb",
      part_of_speech: "noun",
      forms: {
        plural: "kutub"
      },
      meanings: [
        {
          position: 1,
          meaning: "book",
          usage_label: null,
          examples: []
        }
      ]
    }
  ],

  chinese: [
    {
      id: 301,
      word: "喝",
      pronunciation: "hē",
      part_of_speech: "verb",
      forms: {
        pinyin: "hē"
      },
      meanings: [
        {
          position: 1,
          meaning: "to drink",
          usage_label: null,
          examples: []
        }
      ]
    },
    {
      id: 302,
      word: "拿",
      pronunciation: "ná",
      part_of_speech: "verb",
      forms: {
        pinyin: "ná"
      },
      meanings: [
        {
          position: 1,
          meaning: "to take, to hold",
          usage_label: null,
          examples: []
        }
      ]
    }
  ]
};


let filteredWords = [];
let selectedWordId = null;


function getCurrentWords() {
  return cachedWordsByLanguage[currentLanguage] || [];
}


function updateLanguageUI() {
  const language =
    languages[currentLanguage];

  currentLanguageFlag.src =
    language.flag;

  currentLanguageFlag.alt =
    language.name;

  searchInput.placeholder =
    `Type a word in ${language.name}...`;
}


function openLanguageMenu() {
  languageMenu.hidden = false;

  languageButton.setAttribute(
    "aria-expanded",
    "true"
  );
}


function closeLanguageMenu() {
  languageMenu.hidden = true;

  languageButton.setAttribute(
    "aria-expanded",
    "false"
  );
}


function toggleLanguageMenu() {
  if (languageMenu.hidden) {
    openLanguageMenu();
  } else {
    closeLanguageMenu();
  }
}


function setLanguage(languageKey) {
  if (!languages[languageKey]) {
    return;
  }

  currentLanguage =
    languageKey;

  localStorage.setItem(
    "dictionary_language",
    languageKey
  );

  selectedWordId = null;

  updateLanguageUI();
  closeLanguageMenu();
  renderWordList(getCurrentWords());
  renderSuggestions([]);
  renderEmptyDetails();
  searchInput.value = "";
}


function normalizeText(value) {
  return (value || "")
    .toString()
    .toLocaleLowerCase();
}


function searchWords(query) {
  const words = getCurrentWords();
  const normalizedQuery =
    normalizeText(query).trim();

  if (!normalizedQuery) {
    return words;
  }

  const exactMatches = [];
  const startsWithMatches = [];
  const includesMatches = [];

  words.forEach((wordItem) => {
    const normalizedWord =
      normalizeText(wordItem.word);

    if (normalizedWord === normalizedQuery) {
      exactMatches.push(wordItem);
      return;
    }

    if (normalizedWord.startsWith(normalizedQuery)) {
      startsWithMatches.push(wordItem);
      return;
    }

    if (normalizedWord.includes(normalizedQuery)) {
      includesMatches.push(wordItem);
    }
  });

  return [
    ...exactMatches,
    ...startsWithMatches,
    ...includesMatches
  ];
}


function renderSuggestions(words) {
  searchSuggestions.innerHTML = "";

  if (!searchInput.value.trim()) {
    searchSuggestions.hidden = true;
    return;
  }

  if (!words.length) {
    const empty =
      document.createElement("div");

    empty.className =
      "suggestion-empty";

    empty.textContent =
      "No cached matches found.";

    searchSuggestions.appendChild(empty);

    searchSuggestions.hidden = false;
    return;
  }

  words.slice(0, 8).forEach((wordItem) => {
    const button =
      document.createElement("button");

    button.type = "button";
    button.className = "suggestion-item";

    button.innerHTML = `
      <span class="suggestion-word">${wordItem.word}</span>
      <span class="suggestion-meta">${wordItem.part_of_speech}</span>
    `;

    button.addEventListener(
      "click",
      () => {
        selectWord(wordItem.id);
        searchSuggestions.hidden = true;
      }
    );

    searchSuggestions.appendChild(button);
  });

  searchSuggestions.hidden = false;
}


function renderWordList(words) {
  filteredWords = words;
  wordsList.innerHTML = "";

  wordsCountText.textContent =
    `${words.length} word${words.length === 1 ? "" : "s"}`;

  if (!words.length) {
    const empty =
      document.createElement("div");

    empty.className =
      "words-list-empty";

    empty.textContent =
      "No words available.";

    wordsList.appendChild(empty);
    return;
  }

  words.forEach((wordItem) => {
    const button =
      document.createElement("button");

    button.type = "button";
    button.className =
      `word-row ${selectedWordId === wordItem.id ? "active" : ""}`;

    button.innerHTML = `
      <div class="word-row-main">
        <div class="word-row-word">${wordItem.word}</div>
        <div class="word-row-pos">${wordItem.part_of_speech}</div>
      </div>

      <div class="word-row-id">ID ${wordItem.id}</div>
    `;

    button.addEventListener(
      "click",
      () => {
        selectWord(wordItem.id);
      }
    );

    wordsList.appendChild(button);
  });
}


function renderEmptyDetails() {
  wordDetails.hidden = true;
  wordDetailsEmpty.hidden = false;
}


function renderWordDetails(wordItem) {
  wordDetails.hidden = false;
  wordDetailsEmpty.hidden = true;

  detailsPartOfSpeech.textContent =
    wordItem.part_of_speech;

  detailsWord.textContent =
    wordItem.word;

  detailsPronunciation.textContent =
    wordItem.pronunciation || "";

  detailsWordMeta.textContent =
    `Database ID: ${wordItem.id}`;

  detailsForms.textContent =
    JSON.stringify(
      wordItem.forms || {},
      null,
      2
    );

  detailsMeanings.innerHTML = "";

  (wordItem.meanings || []).forEach((meaningItem) => {
    const block =
      document.createElement("div");

    block.className =
      "meaning-card";

    const examplesHtml =
      (meaningItem.examples || [])
        .map(
          (example) =>
            `<div class="meaning-example">${example}</div>`
        )
        .join("");

    block.innerHTML = `
      <div class="meaning-top">
        <div class="meaning-index">${meaningItem.position}</div>
        <div class="meaning-content">
          <div class="meaning-text">${meaningItem.meaning}</div>
          ${
            meaningItem.usage_label
              ? `<div class="meaning-usage">${meaningItem.usage_label}</div>`
              : ""
          }
        </div>
      </div>

      ${examplesHtml}
    `;

    detailsMeanings.appendChild(block);
  });
}


function selectWord(wordId) {
  selectedWordId = wordId;

  const wordItem =
    getCurrentWords().find(
      (item) => item.id === wordId
    );

  renderWordList(filteredWords);

  if (!wordItem) {
    renderEmptyDetails();
    return;
  }

  renderWordDetails(wordItem);
}


function handleSearch() {
  const query =
    searchInput.value;

  const results =
    searchWords(query);

  renderWordList(results);
  renderSuggestions(results);
}


async function requireSession() {
  const {
    data,
    error
  } = await supabase.auth.getSession();

  if (
    error ||
    !data.session
  ) {
    window.location.href =
      "../index.html";

    return;
  }

  userEmail.textContent =
    data.session.user.email;
}


languageButton.addEventListener(
  "click",
  (event) => {
    event.stopPropagation();
    toggleLanguageMenu();
  }
);


languageOptions.forEach((option) => {
  option.addEventListener(
    "click",
    () => {
      setLanguage(option.dataset.language);
    }
  );
});


document.addEventListener(
  "click",
  (event) => {
    if (
      !languageMenu.contains(event.target) &&
      !languageButton.contains(event.target)
    ) {
      closeLanguageMenu();
    }
  }
);


document.addEventListener(
  "keydown",
  (event) => {
    if (event.key === "Escape") {
      closeLanguageMenu();
      searchSuggestions.hidden = true;
    }
  }
);


logoutButton.addEventListener(
  "click",
  async () => {
    await supabase.auth.signOut();

    window.location.href =
      "../index.html";
  }
);


syncButton.addEventListener(
  "click",
  () => {
    /*
      Depois isso vai:
      1. consultar settings no Supabase
      2. comparar com cache local
      3. sincronizar se necessário
    */
    alert(
      "Sync button ready. Next step: connect it to settings + IndexedDB."
    );
  }
);


searchInput.addEventListener(
  "input",
  handleSearch
);


searchInput.addEventListener(
  "focus",
  handleSearch
);


browseAllButton.addEventListener(
  "click",
  () => {
    searchInput.value = "";
    renderSuggestions([]);
    renderWordList(getCurrentWords());
  }
);


updateLanguageUI();
renderWordList(getCurrentWords());
renderEmptyDetails();
renderSuggestions([]);
requireSession();
