import { supabase } from "../../js/supabase.js";


const syncButton =
  document.getElementById("syncButton");

const syncToast =
  document.getElementById("syncToast");

const languageButton =
  document.getElementById("languageButton");

const languageMenu =
  document.getElementById("languageMenu");

const currentLanguageFlag =
  document.getElementById("currentLanguageFlag");

const languageOptions =
  document.querySelectorAll(".language-option");

const logoutButton =
  document.getElementById("logoutButton");

const hubLanguageTitle =
  document.getElementById("hubLanguageTitle");

const onlineDirection =
  document.getElementById("onlineDirection");

const wiktionaryDirection =
  document.getElementById("wiktionaryDirection");

const onlineCard =
  document.getElementById("onlineCard");

const wiktionaryCard =
  document.getElementById("wiktionaryCard");

const dictionarySearchCard =
  document.getElementById("dictionarySearchCard");

const libraryCard =
  document.getElementById("libraryCard");


const languages = {

  turkish: {
    name: "Turkish",
    title: "TURKISH",
    flag: "../turkish-flag.png"
  },

  msa: {
    name: "Standard Arabic",
    title: "STANDARD ARABIC",
    flag: "../arabic-flag.png"
  },

  chinese: {
    name: "Chinese",
    title: "CHINESE",
    flag: "../chinese-flag.png"
  }

};


let storedLanguage =
  localStorage.getItem(
    "dictionary_language"
  );


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


function updateLanguageUI() {

  const language =
    languages[currentLanguage];


  hubLanguageTitle.textContent =
    language.title;


  currentLanguageFlag.src =
    language.flag;

  currentLanguageFlag.alt =
    language.name;


  onlineDirection.textContent =
    `English → ${language.name}`;


  wiktionaryDirection.textContent =
    `${language.name} → English`;


  document.title =
    `${language.name} Dictionary`;

}


function setLanguage(languageKey) {

  if (!languages[languageKey]) {
    return;
  }


  currentLanguage =
    languageKey;


  localStorage.setItem(
    "dictionary_language",
    currentLanguage
  );


  closeLanguageMenu();

  updateLanguageUI();

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


function showSyncToast(message) {

  syncToast.textContent =
    message;

  syncToast.hidden =
    false;


  window.setTimeout(
    () => {

      syncToast.hidden =
        true;

    },
    1800
  );

}


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

        setLanguage(
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

    }

  }
);


syncButton.addEventListener(
  "click",
  async () => {

    if (
      syncButton.classList.contains(
        "is-syncing"
      )
    ) {
      return;
    }


    syncButton.classList.add(
      "is-syncing"
    );


    await new Promise(
      (resolve) => {

        window.setTimeout(
          resolve,
          650
        );

      }
    );


    syncButton.classList.remove(
      "is-syncing"
    );


    showSyncToast(
      "Dictionary synchronized"
    );

  }
);


onlineCard.addEventListener(
  "click",
  () => {
  }
);


wiktionaryCard.addEventListener(
  "click",
  () => {

    if (currentLanguage !== "turkish") {

      return;

    }


    window.location.href =
      "./wiktionary-search.html";

  }
);


dictionarySearchCard.addEventListener(
  "click",
  () => {
  }
);


libraryCard.addEventListener(
  "click",
  () => {
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


updateLanguageUI();

requireSession();
