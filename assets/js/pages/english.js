import { supabase } from "../core/supabase.js";


const backButton =
  document.getElementById(
    "englishBackButton"
  );

const languageButton =
  document.getElementById(
    "languageButton"
  );

const languageMenu =
  document.getElementById(
    "languageMenu"
  );

const languageOptions =
  document.querySelectorAll(
    ".language-option"
  );

const logoutButton =
  document.getElementById(
    "logoutButton"
  );

const searchForm =
  document.getElementById(
    "englishSearchForm"
  );

const searchInput =
  document.getElementById(
    "englishSearchInput"
  );

const searchStatus =
  document.getElementById(
    "englishSearchStatus"
  );

const results = document.getElementById("englishResults");


function openLanguageMenu() {

  languageMenu.hidden =
    false;

  languageButton.setAttribute(
    "aria-expanded",
    "true"
  );

}


function closeLanguageMenu() {

  languageMenu.hidden =
    true;

  languageButton.setAttribute(
    "aria-expanded",
    "false"
  );

}


function toggleLanguageMenu() {

  if (
    languageMenu.hidden
  ) {

    openLanguageMenu();

  } else {

    closeLanguageMenu();

  }

}


function goToLanguage(
  languageKey
) {

  if (
    languageKey === "english"
  ) {

    closeLanguageMenu();

    return;

  }


  localStorage.setItem(
    "dictionary_language",
    languageKey
  );


  window.location.href =
    "./dictionary.html";

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

  }

}


backButton.addEventListener(
  "click",
  () => {

    window.location.href =
      "./dictionary.html";

  }
);


languageButton.addEventListener(
  "click",
  (event) => {

    event.stopPropagation();

    toggleLanguageMenu();

  }
);


languageOptions.forEach(
  (option) => {

    option.addEventListener(
      "click",
      () => {

        goToLanguage(
          option.dataset.language
        );

      }
    );

  }
);


document.addEventListener(
  "click",
  (event) => {

    if (
      !languageMenu.contains(
        event.target
      ) &&
      !languageButton.contains(
        event.target
      )
    ) {

      closeLanguageMenu();

    }

  }
);


document.addEventListener(
  "keydown",
  (event) => {

    if (
      event.key === "Escape"
    ) {

      closeLanguageMenu();

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


searchForm.addEventListener(
  "submit",
  async (event) => {
    event.preventDefault();
    const word = searchInput.value.trim();

    if (!word) {
      searchStatus.textContent = "Enter an English word.";
      searchStatus.hidden = false;
      return;
    }

    searchStatus.hidden = true;
    results.hidden = false;
    results.textContent = "Searching...";

    try {
      const response = await fetch(
        `https://en.wiktionary.org/w/rest.php/v1/page/${encodeURIComponent(word)}/with_html`,
        { headers: { Accept: "application/json" } }
      );
      if (response.status === 404) throw new Error("Word not found.");
      if (!response.ok) throw new Error(`Wiktionary returned HTTP ${response.status}.`);

      const data = await response.json();
      const doc = new DOMParser().parseFromString(data.html, "text/html");
      const english = [...doc.querySelectorAll("h2")]
        .find((heading) => heading.textContent.trim() === "English")
        ?.closest("section");
      const senses = extractTurkishTranslationSenses(english);

      results.innerHTML = senses.length
        ? `<h3>${escapeHtml(word)}</h3>
           ${senses.map((sense) => `
             <article class="english-translation-sense">
               <h4>${escapeHtml(sense.sense)}</h4>
               <p>${sense.translations.map(escapeHtml).join(", ")}</p>
             </article>
           `).join("")}`
        : `<h3>${escapeHtml(word)}</h3>
           <p>No Turkish translation found.</p>`;
    } catch (error) {
      results.textContent = error.message;
    }
  }
);

function extractTurkishTranslationSenses(englishSection) {
  if (!englishSection) {
    return [];
  }

  return [...englishSection.querySelectorAll(".NavFrame[id^='Translations-']")]
    .map((frame) => {
      const sense = frame.id
        .replace(/^Translations-/, "")
        .replace(/_/g, " ")
        .trim();
      const translations = [...frame.querySelectorAll("tr")]
        .filter((row) => /\bTurkish\b/i.test(row.textContent))
        .flatMap((row) => [
          ...row.querySelectorAll("a[lang='tr'], a[href*='#Turkish']")
        ].map((link) => link.textContent.trim()))
        .filter((value, index, list) =>
          value && list.indexOf(value) === index
        );

      return { sense, translations };
    })
    .filter((item) => item.translations.length);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
    '"': "&quot;", "'": "&#39;"
  }[char]));
}


requireSession();
